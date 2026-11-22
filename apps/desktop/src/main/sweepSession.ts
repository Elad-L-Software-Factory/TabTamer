import {
  buildSweep,
  siteName,
  type BrowserKind,
  type BrowserTab,
  type SweepItem,
  type SweepReason,
  type TabToOpen,
} from '@tabtamer/core';

/** What the sweep needs from the browser hub (kept small so it is easy to test). */
export interface TabActions {
  allTabs(): BrowserTab[];
  closeTabs(browser: BrowserKind, tabIds: number[]): boolean;
  openTabs(browser: BrowserKind, tabs: TabToOpen[]): boolean;
}

/** A sweep row as the screens see it. */
export interface SweepRow {
  key: string;
  browser: BrowserKind;
  tabId: number;
  title: string;
  site: string;
  favIconUrl?: string;
  reason: SweepReason;
  keepTitle?: string;
}

/** Undo stays available a little longer than the 30 seconds the screen shows. */
export const UNDO_WINDOW_MS = 60_000;

export const tabKey = (browser: BrowserKind, id: number) => `${browser}:${id}`;

export class SweepSession {
  private items: SweepItem[] = [];
  private lastClosed: { at: number; tabs: BrowserTab[] } | null = null;

  constructor(private readonly hub: TabActions) {}

  start(now = Date.now()): SweepRow[] {
    this.items = buildSweep(this.hub.allTabs(), now);
    return this.items.map(({ tab, reason, keep }) => {
      const row: SweepRow = {
        key: tabKey(tab.browser, tab.id),
        browser: tab.browser,
        tabId: tab.id,
        title: tab.title || tab.url || 'Untitled',
        site: siteName(tab.url),
        reason,
      };
      if (tab.favIconUrl) row.favIconUrl = tab.favIconUrl;
      if (keep) row.keepTitle = keep.title || keep.url;
      return row;
    });
  }

  /** Close the approved tabs. Returns how many were closed. */
  run(keys: string[], now = Date.now()): number {
    const approved = new Set(keys);
    const open = new Set(this.hub.allTabs().map((t) => tabKey(t.browser, t.id)));
    const toClose = this.items
      .map((i) => i.tab)
      .filter((tab) => {
        const k = tabKey(tab.browser, tab.id);
        return approved.has(k) && open.has(k);
      });

    const byBrowser = new Map<BrowserKind, BrowserTab[]>();
    for (const tab of toClose)
      byBrowser.set(tab.browser, [...(byBrowser.get(tab.browser) ?? []), tab]);
    let closed = 0;
    const closedTabs: BrowserTab[] = [];
    for (const [browser, tabs] of byBrowser) {
      if (
        this.hub.closeTabs(
          browser,
          tabs.map((t) => t.id),
        )
      ) {
        closed += tabs.length;
        closedTabs.push(...tabs);
      }
    }
    this.items = [];
    this.lastClosed = closedTabs.length ? { at: now, tabs: closedTabs } : null;
    return closed;
  }

  /** Keys of tabs the last sweep closed (the browser may not have reported them gone yet). */
  closedKeys(): string[] {
    return (this.lastClosed?.tabs ?? []).map((t) => tabKey(t.browser, t.id));
  }

  /** Reopen the last swept tabs. Returns how many were reopened (0 if too late or nothing). */
  undo(now = Date.now()): number {
    const batch = this.lastClosed;
    this.lastClosed = null;
    if (!batch || now - batch.at > UNDO_WINDOW_MS) return 0;
    const byBrowser = new Map<BrowserKind, TabToOpen[]>();
    for (const tab of batch.tabs) {
      const entry: TabToOpen = { url: tab.url, windowId: tab.windowId };
      if (tab.index !== undefined) entry.index = tab.index;
      byBrowser.set(tab.browser, [...(byBrowser.get(tab.browser) ?? []), entry]);
    }
    let reopened = 0;
    for (const [browser, tabs] of byBrowser) {
      if (this.hub.openTabs(browser, tabs)) reopened += tabs.length;
    }
    return reopened;
  }
}
