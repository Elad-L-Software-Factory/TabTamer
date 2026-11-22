import { describe, expect, it } from 'vitest';
import type { BrowserKind, BrowserTab, TabToOpen } from '@tabtamer/core';
import { SweepSession, type TabActions } from './sweepSession';

function fakeHub(tabs: BrowserTab[]) {
  const calls: { close: [BrowserKind, number[]][]; open: [BrowserKind, TabToOpen[]][] } = {
    close: [],
    open: [],
  };
  const hub: TabActions = {
    allTabs: () => tabs,
    closeTabs: (b, ids) => (calls.close.push([b, ids]), true),
    openTabs: (b, t) => (calls.open.push([b, t]), true),
  };
  return { hub, calls };
}

const t = (browser: BrowserKind, id: number, url: string, title = ''): BrowserTab => ({
  browser,
  id,
  windowId: 7,
  index: id,
  url,
  title,
  pinned: false,
  audible: false,
  active: false,
  lastAccessed: 0,
});

describe('SweepSession', () => {
  const tabs = [
    t('chrome', 1, 'chrome://newtab/', 'New Tab'),
    t('chrome', 2, 'https://zoom.us/j/1', 'Zoom'),
    t('edge', 3, 'about:blank'),
    t('edge', 4, 'https://example.com/keep', 'Keep me'),
  ];

  it('proposes junk with stable keys and pre-selects everything', () => {
    const { hub } = fakeHub(tabs);
    const items = new SweepSession(hub).start(0);
    expect(items.map((i) => i.key)).toEqual(['chrome:2', 'chrome:1', 'edge:3']);
  });

  it('closes only approved tabs that are still open, grouped per browser', () => {
    const { hub, calls } = fakeHub(tabs);
    const s = new SweepSession(hub);
    s.start(0);
    const closed = s.run(['chrome:1', 'chrome:2', 'chrome:999', 'edge:4']);
    expect(closed).toBe(2);
    expect(calls.close).toEqual([['chrome', [2, 1]]]);
  });

  it('reopens the closed tabs on Undo, once, and only within the time limit', () => {
    const { hub, calls } = fakeHub(tabs);
    const s = new SweepSession(hub);
    s.start(0);
    s.run(['chrome:1', 'edge:3'], 1000);
    expect(s.undo(1000 + 10_000)).toBe(2);
    expect(calls.open).toEqual([
      ['chrome', [{ url: 'chrome://newtab/', windowId: 7, index: 1 }]],
      ['edge', [{ url: 'about:blank', windowId: 7, index: 3 }]],
    ]);
    expect(s.undo(1000 + 11_000)).toBe(0);

    s.start(0);
    s.run(['chrome:2'], 0);
    expect(s.undo(5 * 60 * 1000)).toBe(0);
  });
});
