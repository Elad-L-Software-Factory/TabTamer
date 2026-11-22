/**
 * Sweep: tabs that can close right away (junk and duplicates). Free and instant: no AI.
 * The user always approves the list before anything closes.
 */
import type { BrowserTab } from './types';
import { normalizeUrl } from './url';

export type SweepReason =
  'meeting' | 'blank' | 'login' | 'download' | 'error' | 'oldSearch' | 'duplicate';

export interface SweepItem {
  tab: BrowserTab;
  reason: SweepReason;
  /** For duplicates: the copy that stays open. */
  keep?: BrowserTab;
}

/** Display order and plain-English labels for the Sweep screen. */
export const SWEEP_GROUPS: { reason: SweepReason; title: string; why: string }[] = [
  { reason: 'meeting', title: 'Meeting launchers', why: 'The meeting app already opened' },
  { reason: 'duplicate', title: 'Duplicates', why: 'Same page is open in another tab' },
  { reason: 'blank', title: 'Empty tabs', why: 'Empty tab' },
  { reason: 'login', title: 'Sign-in and redirect pages', why: 'Sign-in or redirect page' },
  { reason: 'download', title: 'Download pages', why: 'Download page' },
  { reason: 'error', title: 'Broken pages', why: 'Page did not load' },
  {
    reason: 'oldSearch',
    title: 'Old search results',
    why: 'Search not looked at for over an hour',
  },
];

const HOUR = 60 * 60 * 1000;

interface Parsed {
  host: string;
  path: string;
  search: string;
  protocol: string;
}

function parse(url: string): Parsed | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname.toLowerCase(),
      path: u.pathname.toLowerCase(),
      search: u.search.toLowerCase(),
      protocol: u.protocol,
    };
  } catch {
    return null;
  }
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith('.' + domain);

function isMeetingLauncher(p: Parsed, title: string): boolean {
  if (hostIs(p.host, 'zoom.us')) {
    if (p.path.includes('/wc/')) return false; // meeting running in the browser
    return /^\/(j|s|w|my)\//.test(p.path) || p.path.startsWith('/postattendee');
  }
  if (hostIs(p.host, 'teams.microsoft.com') || hostIs(p.host, 'teams.live.com')) {
    return (
      p.path.startsWith('/l/meetup-join') ||
      p.path.startsWith('/meet/') ||
      p.path.startsWith('/dl/launcher')
    );
  }
  if (hostIs(p.host, 'webex.com')) {
    return (
      p.path.includes('/j.php') ||
      p.path.includes('/wbxmjs/joinservice') ||
      p.path.startsWith('/meet/')
    );
  }
  if (p.host === 'meet.google.com') {
    return /you left the meeting|call ended|you've left|returned to home screen/i.test(title);
  }
  return false;
}

function isBlank(url: string, p: Parsed | null): boolean {
  if (url === '' || url === 'about:blank' || url === 'about:newtab') return true;
  if (!p) return false;
  if (p.protocol === 'chrome:' || p.protocol === 'edge:') {
    return p.host === 'newtab' || p.host === 'new-tab-page';
  }
  return p.protocol === 'chrome-search:' && p.host === 'local-ntp';
}

const LOGIN_HOSTS = [
  'login.microsoftonline.com',
  'login.live.com',
  'accounts.google.com',
  'appleid.apple.com',
];
const LOGIN_PATH =
  /\/(login|log-in|signin|sign-in|sign_in|logon|oauth2?|authorize|auth\/callback|callback|sso|saml)(\/|$|\?)/;

function isLogin(p: Parsed, title: string): boolean {
  if (/^redirecting/i.test(title.trim())) return true;
  if (LOGIN_HOSTS.some((h) => p.host === h)) return true;
  return LOGIN_PATH.test(p.path);
}

function isDownload(p: Parsed | null, title: string): boolean {
  if (p && (p.protocol === 'chrome:' || p.protocol === 'edge:') && p.host === 'downloads')
    return true;
  return /thanks? (you )?for downloading|your download (will|should) (start|begin)|download (has )?started|downloading will begin/i.test(
    title,
  );
}

function isError(p: Parsed | null, title: string): boolean {
  if (p?.protocol === 'chrome-error:') return true;
  return /^(400|401|403|404|410|500|502|503|504)\b|page not found|404 not found|this site can.t be reached|this page isn.t working|aw, snap|^err_|problem loading page|internal server error|bad gateway|service unavailable/i.test(
    title.trim(),
  );
}

function isSearch(p: Parsed): boolean {
  const q = /[?&](q|p|query)=/.test(p.search);
  if (/(^|\.)google\.[a-z.]+$/.test(p.host)) return p.path === '/search' && q;
  if (hostIs(p.host, 'bing.com')) return p.path === '/search' && q;
  if (hostIs(p.host, 'duckduckgo.com')) return q;
  if (hostIs(p.host, 'search.yahoo.com')) return p.path.startsWith('/search') && q;
  if (hostIs(p.host, 'search.brave.com')) return p.path === '/search' && q;
  return false;
}

/** The first junk reason that applies to a tab, or null. */
export function junkReason(tab: BrowserTab, now: number): SweepReason | null {
  const p = parse(tab.url);
  const title = tab.title ?? '';
  if (isBlank(tab.url, p)) return 'blank';
  if (isDownload(p, title)) return 'download';
  if (isError(p, title)) return 'error';
  if (!p || (p.protocol !== 'http:' && p.protocol !== 'https:')) return null;
  if (isMeetingLauncher(p, title)) return 'meeting';
  // Don't interrupt a sign-in or a search the user is looking at right now.
  if (!tab.active && isLogin(p, title)) return 'login';
  if (
    !tab.active &&
    isSearch(p) &&
    typeof tab.lastAccessed === 'number' &&
    now - tab.lastAccessed > HOUR
  ) {
    return 'oldSearch';
  }
  return null;
}

/** Which copy of a duplicated page to keep: pinned, then active, then most recently used. */
function keepScore(t: BrowserTab): number {
  return (t.pinned ? 4e15 : 0) + (t.active ? 2e15 : 0) + (t.lastAccessed ?? 0);
}

export function buildSweep(tabs: BrowserTab[], now: number): SweepItem[] {
  const items: SweepItem[] = [];
  const candidates: BrowserTab[] = [];

  for (const tab of tabs) {
    if (tab.pinned || tab.audible) {
      candidates.push(tab); // never closed, but may be the copy we keep
      continue;
    }
    const reason = junkReason(tab, now);
    if (reason) items.push({ tab, reason });
    else candidates.push(tab);
  }

  const groups = new Map<string, BrowserTab[]>();
  for (const tab of candidates) {
    if (!/^https?:/i.test(tab.url)) continue;
    const key = normalizeUrl(tab.url);
    groups.set(key, [...(groups.get(key) ?? []), tab]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => keepScore(b) - keepScore(a));
    const keep = sorted[0]!;
    for (const tab of sorted.slice(1)) {
      if (tab.pinned || tab.audible) continue;
      items.push({ tab, reason: 'duplicate', keep });
    }
  }

  const order = new Map(SWEEP_GROUPS.map((g, i) => [g.reason, i]));
  return items.sort((a, b) => order.get(a.reason)! - order.get(b.reason)!);
}
