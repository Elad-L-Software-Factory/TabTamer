import { describe, expect, it } from 'vitest';
import { TabRegistry } from './registry';
import type { TabInfo } from './types';

const tabs = (n: number): TabInfo[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    windowId: 1,
    url: `https://example.com/${i}`,
    title: `Tab ${i}`,
    pinned: false,
    audible: false,
    active: i === 0,
  }));

describe('TabRegistry', () => {
  it('starts empty', () => {
    expect(new TabRegistry().summary()).toEqual({ total: 0, byBrowser: {}, connected: [] });
  });

  it('sums tabs across browsers and replaces a browser snapshot', () => {
    const r = new TabRegistry();
    r.setTabs('chrome', tabs(31));
    r.setTabs('edge', tabs(16));
    expect(r.summary()).toEqual({
      total: 47,
      byBrowser: { chrome: 31, edge: 16 },
      connected: ['chrome', 'edge'],
    });
    r.setTabs('chrome', tabs(5));
    expect(r.summary().total).toBe(21);
  });

  it('forgets a browser when it disconnects', () => {
    const r = new TabRegistry();
    r.setTabs('chrome', tabs(3));
    r.setTabs('edge', tabs(2));
    r.removeBrowser('chrome');
    expect(r.summary()).toEqual({ total: 2, byBrowser: { edge: 2 }, connected: ['edge'] });
  });

  it('returns all tabs with their browser', () => {
    const r = new TabRegistry();
    r.setTabs('edge', tabs(2));
    expect(r.allTabs().map((t) => t.browser)).toEqual(['edge', 'edge']);
  });
});
