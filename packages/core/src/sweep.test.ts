import { describe, expect, it } from 'vitest';
import { buildSweep, type SweepReason } from './sweep';
import type { BrowserTab } from './types';

const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
let nextId = 1;

function tab(url: string, title = '', extra: Partial<BrowserTab> = {}): BrowserTab {
  return {
    browser: 'chrome',
    id: nextId++,
    windowId: 1,
    url,
    title,
    pinned: false,
    audible: false,
    active: false,
    lastAccessed: NOW - 5 * 60 * 1000,
    ...extra,
  };
}

const reasonOf = (t: BrowserTab, tabs: BrowserTab[]): SweepReason | undefined =>
  buildSweep(tabs, NOW).find((i) => i.tab.id === t.id)?.reason;

describe('buildSweep: junk rules', () => {
  it.each<[string, string, SweepReason]>([
    ['https://us02web.zoom.us/j/123456789?pwd=abc', 'Launch Meeting - Zoom', 'meeting'],
    ['https://zoom.us/s/987654321', 'Zoom', 'meeting'],
    ['https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0', 'Join conversation', 'meeting'],
    ['https://acme.webex.com/acme/j.php?MTID=m123', 'Cisco Webex', 'meeting'],
    ['chrome://newtab/', 'New Tab', 'blank'],
    ['edge://newtab/', 'New tab', 'blank'],
    ['about:blank', '', 'blank'],
    ['https://login.microsoftonline.com/common/oauth2/authorize?x=1', 'Sign in', 'login'],
    ['https://example.com/auth/callback?code=1', 'Redirecting...', 'login'],
    ['https://example.com/download/thanks', 'Thank you for downloading!', 'download'],
    ['chrome://downloads/', 'Downloads', 'download'],
    ['https://example.com/missing', '404 Not Found', 'error'],
    ['https://example.com/x', "This site can't be reached", 'error'],
  ])('%s -> %s', (url, title, reason) => {
    const t = tab(url, title);
    expect(reasonOf(t, [t])).toBe(reason);
  });

  it('flags search results only when not looked at for over an hour', () => {
    const old = tab('https://www.google.com/search?q=best+laptop', 'best laptop - Google Search', {
      lastAccessed: NOW - 2 * HOUR,
    });
    const fresh = tab('https://www.bing.com/search?q=weather', 'weather - Search', {
      lastAccessed: NOW - 10 * 60 * 1000,
    });
    expect(reasonOf(old, [old, fresh])).toBe('oldSearch');
    expect(reasonOf(fresh, [old, fresh])).toBeUndefined();
  });

  it('keeps an in-browser Zoom meeting and an active Google Meet call', () => {
    const web = tab('https://us02web.zoom.us/wc/123456789/join', 'Zoom Meeting');
    const meet = tab('https://meet.google.com/abc-defg-hij', 'Meet - abc-defg-hij');
    expect(buildSweep([web, meet], NOW)).toEqual([]);
  });

  it('flags a Google Meet tab after the call ended', () => {
    const ended = tab('https://meet.google.com/abc-defg-hij', 'You left the meeting');
    expect(reasonOf(ended, [ended])).toBe('meeting');
  });

  it('never proposes pinned tabs, tabs playing audio, or the active sign-in tab', () => {
    const pinned = tab('about:blank', '', { pinned: true });
    const audible = tab('https://zoom.us/j/1', 'Zoom', { audible: true });
    const signingIn = tab('https://accounts.example.com/signin', 'Sign in', { active: true });
    expect(buildSweep([pinned, audible, signingIn], NOW)).toEqual([]);
  });

  it('does not flag ordinary pages', () => {
    const t = tab('https://example.com/blog/how-to-login-faster', 'How to log in faster');
    expect(buildSweep([t], NOW)).toEqual([]);
  });
});

describe('buildSweep: duplicates', () => {
  it('keeps the most recently used copy and proposes the others', () => {
    const older = tab('https://example.com/article?utm_source=x', 'Article', {
      lastAccessed: NOW - 3 * HOUR,
    });
    const newest = tab('https://www.example.com/article', 'Article', {
      lastAccessed: NOW - 1000,
    });
    const items = buildSweep([older, newest], NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ reason: 'duplicate', tab: { id: older.id } });
    expect(items[0]!.keep).toMatchObject({ id: newest.id });
  });

  it('counts duplicates across browsers and prefers keeping a pinned copy', () => {
    const pinned = tab('https://example.com/app', 'App', { pinned: true, lastAccessed: 0 });
    const edgeCopy = tab('https://example.com/app', 'App', { browser: 'edge', lastAccessed: NOW });
    const items = buildSweep([pinned, edgeCopy], NOW);
    expect(items.map((i) => i.tab.id)).toEqual([edgeCopy.id]);
  });

  it('reports a junk tab once, under its junk reason, not also as a duplicate', () => {
    const a = tab('chrome://newtab/', 'New Tab');
    const b = tab('chrome://newtab/', 'New Tab');
    const items = buildSweep([a, b], NOW);
    expect(items.map((i) => i.reason)).toEqual(['blank', 'blank']);
  });
});
