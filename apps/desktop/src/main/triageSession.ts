/**
 * Triage: one card per remaining tab with an AI summary and a recommended action.
 * Cards appear right away; recommendations fill in as the AI answers.
 */
import { EventEmitter } from 'node:events';
import {
  fallbackRecommendation,
  normalizeRecommendation,
  normalizeUrl,
  siteName,
  themeLabel,
  triageCandidates,
  type BrowserKind,
  type BrowserTab,
  type Recommendation,
  type TabToOpen,
  type TriageAction,
} from '@tabtamer/core';
import { batches, type CostMeter, type TabForAI, type TriageProvider } from '@tabtamer/llm';
import type { Store } from './store';
import type { AiStatus, TriageCard, TriageState } from './types';

export interface TriageHub {
  allTabs(): BrowserTab[];
  closeTabs(browser: BrowserKind, tabIds: number[]): boolean;
  openTabs(browser: BrowserKind, tabs: TabToOpen[]): boolean;
  getPageTexts(browser: BrowserKind, tabIds: number[]): Promise<Map<number, string>>;
  moveToGroup(
    browser: BrowserKind,
    tabIds: number[],
    windowId: number | undefined,
    groupTitle: string,
    groupColor: string,
  ): Promise<number | null>;
  restoreTabs(
    browser: BrowserKind,
    moves: { tabId: number; windowId: number; index: number }[],
  ): Promise<boolean>;
}

export type { AiStatus, TriageCard, TriageState };

type UndoEntry =
  | { kind: 'close'; card: TriageCard; tab: BrowserTab }
  | { kind: 'save'; card: TriageCard; tab: BrowserTab; savedId: string }
  | { kind: 'move'; card: TriageCard; tab: BrowserTab };

const PARALLEL_BATCHES = 3;
const key = (b: BrowserKind, id: number) => `${b}:${id}`;

export class TriageSession extends EventEmitter<{ update: [TriageState] }> {
  private cards: TriageCard[] = [];
  private tabs = new Map<string, BrowserTab>();
  private undoStack: UndoEntry[] = [];
  private aiStatus: AiStatus = 'working';
  private aiMessage: string | undefined;
  private sessionUsd = 0;
  private run = 0;

  constructor(
    private readonly hub: TriageHub,
    private readonly store: Store,
    private readonly provider: TriageProvider | null,
    private readonly meter: CostMeter,
  ) {
    super();
  }

  /** Build the cards. `exclude` = tab keys known to be closing (e.g. just swept). */
  start(exclude: Iterable<string> = []): TriageState {
    const run = ++this.run;
    const skip = new Set(exclude);
    const candidates = triageCandidates(this.hub.allTabs(), this.store.settings.themes).filter(
      (t) => !skip.has(key(t.browser, t.id)),
    );
    this.tabs = new Map(candidates.map((t) => [key(t.browser, t.id), t]));
    this.undoStack = [];
    this.sessionUsd = 0;
    this.aiMessage = undefined;
    this.cards = candidates.map((t) => {
      const card: TriageCard = {
        key: key(t.browser, t.id),
        browser: t.browser,
        tabId: t.id,
        title: t.title || t.url || 'Untitled',
        site: siteName(t.url),
        url: t.url,
      };
      if (t.favIconUrl) card.favIconUrl = t.favIconUrl;
      const cached = this.store.cached(normalizeUrl(t.url));
      if (cached) card.rec = { ...cached, source: 'cache' };
      return card;
    });
    this.aiStatus = 'working';
    void this.analyze(run);
    return this.state();
  }

  state(): TriageState {
    const done = this.cards.filter((c) => c.done);
    return {
      cards: this.cards,
      ai: {
        status: this.aiStatus,
        ...(this.aiMessage ? { message: this.aiMessage } : {}),
        model: this.provider?.model ?? '',
        sessionUsd: this.sessionUsd,
        monthUsd: this.meter.spent(),
        capUsd: this.meter.capUsd,
      },
      categories: this.store.settings.categories,
      themes: this.store.settings.themes,
      counts: {
        closed: done.filter((c) => c.done!.action === 'forget').length,
        saved: done.filter((c) => c.done!.action === 'save').length,
        kept: done.filter((c) => c.done!.action === 'theme').length,
        themes: [
          ...new Set(done.filter((c) => c.done!.action === 'theme').map((c) => c.done!.target)),
        ],
      },
      canUndo: this.undoStack.length > 0,
    };
  }

  private emitUpdate() {
    this.emit('update', this.state());
  }

  private fillFallback(cards: TriageCard[]) {
    for (const c of cards) if (!c.rec) c.rec = fallbackRecommendation(c);
  }

  private async analyze(run: number): Promise<void> {
    const todo = this.cards.filter((c) => !c.rec);
    if (todo.length === 0) return this.finish(run, 'done');
    if (!this.provider) {
      this.fillFallback(todo);
      return this.finish(
        run,
        'off',
        'No Claude key set up yet, so everything is suggested as Save.',
      );
    }
    if (!this.meter.canSpend()) {
      this.fillFallback(todo);
      return this.finish(
        run,
        'capped',
        'Monthly AI spending limit reached. Using simple suggestions.',
      );
    }

    // Page text, per browser, for richer summaries (missing text is fine).
    const texts = new Map<string, string>();
    for (const browser of new Set(todo.map((c) => c.browser))) {
      const ids = todo.filter((c) => c.browser === browser).map((c) => c.tabId);
      const got = await this.hub.getPageTexts(browser, ids);
      for (const [id, text] of got) texts.set(key(browser, id), text);
    }
    if (run !== this.run) return;

    const groups = batches(todo);
    let failed = 0;
    const worker = async () => {
      for (let group = groups.shift(); group; group = groups.shift()) {
        if (!this.meter.canSpend()) {
          this.fillFallback(group);
          this.aiStatus = 'capped';
          continue;
        }
        const input: TabForAI[] = group.map((c) => {
          const t: TabForAI = { id: c.key, title: c.title, url: c.url };
          const text = texts.get(c.key);
          if (text) t.text = text;
          return t;
        });
        try {
          const { items, usage } = await this.provider!.classify(input, {
            categories: this.store.settings.categories,
            themes: this.store.settings.themes.map((t) => t.name),
          });
          if (run !== this.run) return;
          this.sessionUsd += this.meter.add(this.provider!.model, usage);
          this.store.settings.spend = this.meter.snapshot();
          this.store.saveSettings();
          const byId = new Map(items.map((i) => [i.id, i]));
          const toCache: [string, Recommendation][] = [];
          for (const c of group) {
            const ai = byId.get(c.key);
            if (!ai) continue;
            c.rec = normalizeRecommendation(
              ai,
              this.store.settings.categories,
              this.store.settings.themes,
            );
            toCache.push([normalizeUrl(c.url), c.rec]);
          }
          this.store.putCache(toCache);
          this.fillFallback(group); // any tab the AI skipped
        } catch (err) {
          failed++;
          this.aiMessage = `AI unavailable (${err instanceof Error ? err.message : String(err)}). Using simple suggestions.`;
          this.fillFallback(group);
        }
        this.emitUpdate();
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_BATCHES }, worker));
    if (run !== this.run) return;
    const status: AiStatus = this.aiStatus === 'capped' ? 'capped' : failed ? 'error' : 'done';
    this.finish(run, status, this.aiMessage);
  }

  private finish(run: number, status: AiStatus, message?: string) {
    if (run !== this.run) return;
    this.aiStatus = status;
    this.aiMessage = message;
    this.emitUpdate();
  }

  /** Carry out one decision. Target is the category (save) or theme (theme) name. */
  async act(cardKey: string, action: TriageAction, target?: string): Promise<boolean> {
    const card = this.cards.find((c) => c.key === cardKey);
    const tab = this.tabs.get(cardKey);
    if (!card || !tab || card.done) return false;
    const open = this.hub.allTabs().some((t) => key(t.browser, t.id) === cardKey);
    if (!open) {
      card.done = { action: 'forget', target: '' }; // user already closed it
      this.emitUpdate();
      return false;
    }

    if (action === 'forget') {
      if (!this.hub.closeTabs(tab.browser, [tab.id])) return false;
      card.done = { action, target: '' };
      this.undoStack.push({ kind: 'close', card, tab });
    } else if (action === 'save') {
      const category = this.store.ensureCategory(target || card.rec?.target || 'Unsorted');
      const saved = this.store.addSaved({
        url: tab.url,
        title: card.title,
        summary: card.rec?.summary ?? card.title,
        category,
        browser: tab.browser,
        ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
      });
      if (!this.hub.closeTabs(tab.browser, [tab.id])) {
        this.store.removeSaved(saved.id);
        return false;
      }
      card.done = { action, target: category };
      this.undoStack.push({ kind: 'save', card, tab, savedId: saved.id });
    } else {
      const theme = this.store.ensureTheme(target || card.rec?.target || 'Daily Tasks');
      const label = themeLabel(theme);
      const home = this.hub
        .allTabs()
        .find((t) => t.browser === tab.browser && t.groupTitle === label);
      const windowId = await this.hub.moveToGroup(
        tab.browser,
        [tab.id],
        home?.windowId,
        label,
        theme.color,
      );
      if (windowId === null) return false;
      card.done = { action, target: theme.name };
      this.undoStack.push({ kind: 'move', card, tab });
    }
    this.emitUpdate();
    return true;
  }

  /** Accept every remaining recommendation. Returns how many were done. */
  async acceptAll(): Promise<number> {
    let n = 0;
    for (const c of this.cards) {
      if (c.done || !c.rec) continue;
      if (await this.act(c.key, c.rec.action, c.rec.target)) n++;
    }
    return n;
  }

  /** Reverse the last decision. */
  async undo(): Promise<boolean> {
    const last = this.undoStack.pop();
    if (!last) return false;
    const { card, tab } = last;
    const reopen: TabToOpen = { url: tab.url, windowId: tab.windowId };
    if (tab.index !== undefined) reopen.index = tab.index;
    if (last.kind === 'close') {
      this.hub.openTabs(tab.browser, [reopen]);
    } else if (last.kind === 'save') {
      this.store.removeSaved(last.savedId);
      this.hub.openTabs(tab.browser, [reopen]);
    } else {
      await this.hub.restoreTabs(tab.browser, [
        { tabId: tab.id, windowId: tab.windowId, index: tab.index ?? 0 },
      ]);
    }
    delete card.done;
    this.emitUpdate();
    return true;
  }
}
