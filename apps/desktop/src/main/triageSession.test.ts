import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BrowserKind, BrowserTab, TabToOpen } from '@tabtamer/core';
import { CostMeter, type AiRecommendation, type TriageProvider } from '@tabtamer/llm';
import { Store } from './store';
import { TriageSession, type TriageHub } from './triageSession';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function store() {
  const d = mkdtempSync(path.join(tmpdir(), 'tt-store-'));
  dirs.push(d);
  return new Store(d);
}

const tab = (
  id: number,
  url: string,
  title: string,
  extra: Partial<BrowserTab> = {},
): BrowserTab => ({
  browser: 'chrome',
  id,
  windowId: 1,
  index: id,
  url,
  title,
  pinned: false,
  audible: false,
  active: false,
  ...extra,
});

function fakeHub(tabs: BrowserTab[]) {
  const log: string[] = [];
  const hub: TriageHub = {
    allTabs: () => tabs,
    closeTabs: (b: BrowserKind, ids: number[]) => (log.push(`close ${b} ${ids}`), true),
    openTabs: (b: BrowserKind, t: TabToOpen[]) => (
      log.push(`open ${b} ${t.map((x) => x.url)}`),
      true
    ),
    getPageTexts: async (_b, ids) => new Map(ids.map((i) => [i, `text of ${i}`])),
    moveToGroup: async (b, ids, windowId, title) => {
      log.push(`move ${b} ${ids} to ${windowId ?? 'new'} "${title}"`);
      return windowId ?? 99;
    },
    restoreTabs: async (b, moves) => (
      log.push(`restore ${b} ${moves.map((m) => `${m.tabId}@${m.windowId}:${m.index}`)}`),
      true
    ),
  };
  return { hub, log };
}

function provider(answer: (ids: string[]) => AiRecommendation[] | Error) {
  const calls: number[] = [];
  const p: TriageProvider = {
    name: 'Fake',
    model: 'claude-haiku-5-5',
    classify: async (tabs) => {
      calls.push(tabs.length);
      const a = answer(tabs.map((t) => t.id));
      if (a instanceof Error) throw a;
      return {
        items: a,
        usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  };
  return { p, calls };
}

const meter = () => new CostMeter({ month: CostMeter.monthKey(), usd: 0 }, 2);
const until = (s: TriageSession, pred: () => boolean) =>
  new Promise<void>((resolve) => {
    if (pred()) return resolve();
    s.on('update', () => pred() && resolve());
  });

const tabs = [
  tab(1, 'https://example.com/jobs/pm', 'Senior PM | Acme'),
  tab(2, 'https://example.com/news/old', 'Yesterday news'),
  tab(3, 'https://example.com/guide', 'Async guide'),
  tab(4, 'https://example.com/pinned', 'Pinned', { pinned: true }),
  tab(5, 'https://example.com/in-theme', 'Already themed', {
    windowId: 7,
    groupTitle: '💼 Job Search',
  }),
];

describe('TriageSession', () => {
  it('builds cards for unorganized tabs and fills them from the AI', async () => {
    const { hub } = fakeHub(tabs);
    const { p, calls } = provider((ids) =>
      ids.map((id) => ({
        id,
        summary: `about ${id}`,
        action: id.endsWith(':2') ? 'forget' : id.endsWith(':1') ? 'theme' : 'save',
        target: id.endsWith(':1') ? 'job search' : id.endsWith(':3') ? 'Learning' : '',
        confidence: id.endsWith(':2') ? 'low' : 'high',
        reason: 'r',
      })),
    );
    const s = new TriageSession(hub, store(), p, meter());
    expect(s.start().cards.map((c) => c.tabId)).toEqual([1, 2, 3]);
    await until(s, () => s.state().ai.status === 'done');
    const recs = Object.fromEntries(s.state().cards.map((c) => [c.tabId, c.rec]));
    expect(recs[1]).toMatchObject({ action: 'theme', target: 'Job Search' });
    expect(recs[2]).toMatchObject({ action: 'save', target: 'Unsorted' }); // unsure forget -> save
    expect(recs[3]).toMatchObject({ action: 'save', target: 'Learning' });
    expect(calls).toEqual([3]);
    expect(s.state().ai.sessionUsd).toBeGreaterThan(0);
  });

  it('uses the cache next time and does not call the AI again', async () => {
    const st = store();
    const { hub } = fakeHub(tabs);
    const { p, calls } = provider((ids) =>
      ids.map((id) => ({
        id,
        summary: 's',
        action: 'save',
        target: 'Learning',
        confidence: 'high',
        reason: 'r',
      })),
    );
    const s1 = new TriageSession(hub, st, p, meter());
    s1.start();
    await until(s1, () => s1.state().ai.status === 'done');
    const s2 = new TriageSession(hub, st, p, meter());
    s2.start();
    await until(s2, () => s2.state().ai.status === 'done');
    expect(calls).toEqual([3]);
    expect(s2.state().cards.every((c) => c.rec?.source === 'cache')).toBe(true);
  });

  it('falls back to "save to Unsorted" when there is no key, an error, or the cap is reached', async () => {
    const { hub } = fakeHub(tabs);
    const off = new TriageSession(hub, store(), null, meter());
    off.start();
    await until(off, () => off.state().ai.status === 'off');
    expect(off.state().cards.every((c) => c.rec?.target === 'Unsorted')).toBe(true);

    const { p } = provider(() => new Error('network down'));
    const err = new TriageSession(hub, store(), p, meter());
    err.start();
    await until(err, () => err.state().ai.status === 'error');
    expect(err.state().cards.every((c) => c.rec?.source === 'fallback')).toBe(true);

    const { p: p2, calls } = provider(() => []);
    const capped = new TriageSession(
      hub,
      store(),
      p2,
      new CostMeter({ month: CostMeter.monthKey(), usd: 5 }, 2),
    );
    capped.start();
    await until(capped, () => capped.state().ai.status === 'capped');
    expect(calls).toEqual([]);
  });

  it('forget, save and theme actions, each with undo', async () => {
    const st = store();
    const { hub, log } = fakeHub(tabs);
    const s = new TriageSession(hub, st, null, meter());
    s.start();

    await s.act('chrome:2', 'forget');
    await s.act('chrome:3', 'save', 'Home Projects');
    await s.act('chrome:1', 'theme', 'Job Search');
    expect(log).toEqual([
      'close chrome 2',
      'close chrome 3',
      'move chrome 1 to 7 "💼 Job Search"', // joins the existing Job Search window
    ]);
    expect(st.saved.map((x) => [x.title, x.category])).toEqual([['Async guide', 'Home Projects']]);
    expect(st.settings.categories).toContain('Home Projects');
    expect(s.state().counts).toEqual({ closed: 1, saved: 1, kept: 1, themes: ['Job Search'] });

    await s.undo();
    await s.undo();
    await s.undo();
    expect(log.slice(3)).toEqual([
      'restore chrome 1@1:1',
      'open chrome https://example.com/guide',
      'open chrome https://example.com/news/old',
    ]);
    expect(st.saved).toEqual([]);
    expect(s.state().cards.every((c) => !c.done)).toBe(true);
  });

  it('creates a theme on the fly in a new window', async () => {
    const st = store();
    const { hub, log } = fakeHub(tabs);
    const s = new TriageSession(hub, st, null, meter());
    s.start();
    await s.act('chrome:3', 'theme', 'Home renovation');
    expect(st.settings.themes.map((t) => t.name)).toContain('Home renovation');
    expect(log[0]).toMatch(/^move chrome 3 to new ".+ Home renovation"$/);
  });
});
