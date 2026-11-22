/**
 * TabTamer browser helper (Manifest V3 service worker).
 * The "hands" of TabTamer: reports tabs to the app and carries out its commands.
 * It contains no AI and makes no decisions.
 */
import {
  NATIVE_HOST_NAME,
  PROTOCOL_VERSION,
  parseAppCommand,
  type AppCommand,
  type BrowserKind,
  type HelperMessage,
  type TabInfo,
} from '@tabtamer/core';

const RECONNECT_ALARM = 'tabtamer-reconnect';
const SNAPSHOT_DEBOUNCE_MS = 300;
const MAX_FAVICON_DATA_URL = 2048;

const browserKind: BrowserKind = detectBrowser();
let port: chrome.runtime.Port | null = null;
let snapshotTimer: ReturnType<typeof setTimeout> | undefined;

function detectBrowser(): BrowserKind {
  const brands =
    (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData
      ?.brands ?? [];
  const isEdge = brands.some((b) => /edge/i.test(b.brand)) || /\bEdg\//.test(navigator.userAgent);
  return isEdge ? 'edge' : 'chrome';
}

// ---------- Connection ----------

function connect(): void {
  if (port) return;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  } catch (err) {
    port = null;
    setStatus(false, err instanceof Error ? err.message : String(err));
    return;
  }
  port.onMessage.addListener((raw: unknown) => void handleCommand(raw));
  port.onDisconnect.addListener(() => {
    // Reading lastError marks it as handled; keep the browser's reason for troubleshooting.
    const reason = chrome.runtime.lastError?.message;
    if (reason) console.warn('TabTamer: native connection closed:', reason);
    port = null;
    setStatus(false, reason);
  });
  send({
    type: 'hello',
    v: PROTOCOL_VERSION,
    browser: browserKind,
    extensionVersion: chrome.runtime.getManifest().version,
  });
  setStatus(true);
  void sendSnapshot();
}

function send(message: HelperMessage): void {
  try {
    port?.postMessage(message);
  } catch {
    port = null;
    setStatus(false);
  }
}

function setStatus(connected: boolean, reason?: string): void {
  void chrome.action.setBadgeText({ text: connected ? '' : '!' });
  void chrome.action.setBadgeBackgroundColor({ color: '#F08C00' });
  const offline = reason
    ? `TabTamer can't reach the app (${reason}). Click to retry.`
    : "TabTamer can't reach the app. Click to retry.";
  void chrome.action.setTitle({ title: connected ? 'TabTamer is connected' : offline });
}

// ---------- Tabs ----------

function toTabInfo(t: chrome.tabs.Tab, groups: Map<number, string>): TabInfo | null {
  if (t.id === undefined || t.id === chrome.tabs.TAB_ID_NONE) return null;
  const fav = t.favIconUrl;
  const info: TabInfo = {
    id: t.id,
    windowId: t.windowId,
    index: t.index,
    url: t.url ?? t.pendingUrl ?? '',
    title: t.title ?? '',
    pinned: t.pinned,
    audible: t.audible ?? false,
    active: t.active,
  };
  if (fav && !(fav.startsWith('data:') && fav.length > MAX_FAVICON_DATA_URL)) info.favIconUrl = fav;
  const lastAccessed = (t as chrome.tabs.Tab & { lastAccessed?: number }).lastAccessed;
  if (typeof lastAccessed === 'number') info.lastAccessed = lastAccessed;
  const groupTitle = t.groupId !== -1 ? groups.get(t.groupId) : undefined;
  if (groupTitle) info.groupTitle = groupTitle;
  if (t.discarded) info.discarded = true;
  return info;
}

async function sendSnapshot(): Promise<void> {
  if (!port) return;
  const [tabs, groupList] = await Promise.all([chrome.tabs.query({}), chrome.tabGroups.query({})]);
  const groups = new Map(groupList.map((g) => [g.id, g.title ?? '']));
  send({
    type: 'tabs',
    v: PROTOCOL_VERSION,
    browser: browserKind,
    tabs: tabs.map((t) => toTabInfo(t, groups)).filter((t): t is TabInfo => t !== null),
  });
}

// ---------- Page text (for AI summaries) ----------

const TEXT_LIMIT = 2000;
const TEXT_TIMEOUT_MS = 4000;
const TEXT_CONCURRENCY = 6;

/** Runs inside the page: description + the start of the visible text. */
function extractPageText(limit: number): string {
  const desc =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ??
    document.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
    '';
  const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
  return `${desc} ${body}`.trim().slice(0, limit);
}

async function readText(tabId: number): Promise<string | null> {
  const run = chrome.scripting
    .executeScript({ target: { tabId }, func: extractPageText, args: [TEXT_LIMIT] })
    .then((r) => (typeof r[0]?.result === 'string' ? r[0].result : null))
    .catch(() => null);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TEXT_TIMEOUT_MS));
  return Promise.race([run, timeout]);
}

async function readTexts(tabIds: number[]): Promise<{ tabId: number; text: string }[]> {
  const tabs = await chrome.tabs.query({});
  const readable = new Set(
    tabs
      .filter((t) => t.id !== undefined && !t.discarded && /^https?:/i.test(t.url ?? ''))
      .map((t) => t.id!),
  );
  const queue = tabIds.filter((id) => readable.has(id));
  const out: { tabId: number; text: string }[] = [];
  async function worker() {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const text = await readText(id);
      if (text) out.push({ tabId: id, text });
    }
  }
  await Promise.all(Array.from({ length: TEXT_CONCURRENCY }, worker));
  return out;
}

// ---------- Theme windows ----------

type NonEmpty = [number, ...number[]];

async function windowExists(windowId: number | undefined): Promise<boolean> {
  if (windowId === undefined) return false;
  try {
    await chrome.windows.get(windowId);
    return true;
  } catch {
    return false;
  }
}

/** Move tabs into the theme window (creating it if needed) and label them with a tab group. */
async function moveToGroup(
  tabIds: number[],
  windowId: number | undefined,
  title: string,
  color: string,
): Promise<number> {
  let target = windowId;
  let toMove = tabIds;
  if (!(await windowExists(target))) {
    const win = await chrome.windows.create({ tabId: tabIds[0], focused: false });
    target = win!.id!;
    toMove = tabIds.slice(1);
  }
  if (toMove.length) {
    const ids = toMove as NonEmpty;
    await chrome.tabs.ungroup(ids).catch(() => undefined);
    await chrome.tabs.move(ids, { windowId: target!, index: -1 });
  }
  const [existing] = await chrome.tabGroups.query({ windowId: target!, title });
  const all = tabIds as NonEmpty; // the app never sends an empty list (validated by the protocol)
  const groupId: number = existing
    ? await chrome.tabs.group({ tabIds: all, groupId: existing.id })
    : await chrome.tabs.group({ tabIds: all, createProperties: { windowId: target! } });
  await chrome.tabGroups.update(groupId, {
    title,
    color: color as chrome.tabGroups.Color,
  });
  return target!;
}

/** Undo a move: ungroup and put each tab back in its old window and position. */
async function restoreTabs(moves: { tabId: number; windowId: number; index: number }[]) {
  if (moves.length === 0) return;
  await chrome.tabs.ungroup(moves.map((m) => m.tabId) as NonEmpty).catch(() => undefined);
  for (const m of [...moves].sort((a, b) => a.index - b.index)) {
    const windowId = (await windowExists(m.windowId)) ? m.windowId : undefined;
    if (windowId === undefined) continue; // old window is gone: leave the tab where it is
    await chrome.tabs.move(m.tabId, { windowId, index: m.index }).catch(() => undefined);
  }
}

function scheduleSnapshot(): void {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => void sendSnapshot(), SNAPSHOT_DEBOUNCE_MS);
}

// ---------- Commands from the app ----------

async function openTab(url: string, windowId?: number, index?: number): Promise<void> {
  // Browser pages like chrome://newtab cannot be opened by extensions; a new tab is the same thing.
  const safeUrl = /^(chrome|edge):\/\/(newtab|new-tab-page)/i.test(url) ? undefined : url;
  const props: chrome.tabs.CreateProperties = { active: false };
  if (safeUrl) props.url = safeUrl;
  try {
    await chrome.tabs.create({ ...props, windowId, index });
  } catch {
    await chrome.tabs.create(props); // original window was closed
  }
}

async function handleCommand(raw: unknown): Promise<void> {
  const cmd: AppCommand | null = parseAppCommand(raw);
  if (!cmd) return;
  try {
    let windowId: number | undefined;
    switch (cmd.type) {
      case 'getPageTexts': {
        const texts = await readTexts(cmd.tabIds);
        send({ type: 'pageTexts', v: PROTOCOL_VERSION, requestId: cmd.requestId, texts });
        return;
      }
      case 'moveToGroup':
        windowId = await moveToGroup(cmd.tabIds, cmd.windowId, cmd.groupTitle, cmd.groupColor);
        break;
      case 'restoreTabs':
        await restoreTabs(cmd.moves);
        break;
      case 'listTabs':
        await sendSnapshot();
        break;
      case 'closeTabs':
        // One by one, so a tab the user already closed doesn't stop the rest.
        await Promise.allSettled(cmd.tabIds.map((id) => chrome.tabs.remove(id)));
        break;
      case 'focusTab': {
        const tab = await chrome.tabs.update(cmd.tabId, { active: true });
        if (tab?.windowId !== undefined)
          await chrome.windows.update(tab.windowId, { focused: true });
        break;
      }
      case 'openTabs':
        // In original order so saved positions stay correct.
        for (const t of [...cmd.tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
          await openTab(t.url, t.windowId, t.index);
        }
        break;
    }
    send({
      type: 'result',
      v: PROTOCOL_VERSION,
      requestId: cmd.requestId,
      ok: true,
      ...(windowId !== undefined ? { windowId } : {}),
    });
  } catch (err) {
    send({
      type: 'result',
      v: PROTOCOL_VERSION,
      requestId: cmd.requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------- Wiring ----------

chrome.tabs.onCreated.addListener(scheduleSnapshot);
chrome.tabs.onRemoved.addListener(scheduleSnapshot);
chrome.tabs.onReplaced.addListener(scheduleSnapshot);
chrome.tabs.onAttached.addListener(scheduleSnapshot);
chrome.tabs.onDetached.addListener(scheduleSnapshot);
chrome.tabs.onActivated.addListener(scheduleSnapshot);
chrome.tabs.onMoved.addListener(scheduleSnapshot);
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (
    change.url !== undefined ||
    change.title !== undefined ||
    change.pinned !== undefined ||
    change.audible !== undefined ||
    change.groupId !== undefined ||
    change.discarded !== undefined
  ) {
    scheduleSnapshot();
  }
});
chrome.tabGroups.onUpdated.addListener(scheduleSnapshot);

// Retry the connection every minute in case the app starts later.
chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.action.onClicked.addListener(connect);

connect();
