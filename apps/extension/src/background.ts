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

function toTabInfo(t: chrome.tabs.Tab): TabInfo | null {
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
  return info;
}

async function sendSnapshot(): Promise<void> {
  if (!port) return;
  const tabs = await chrome.tabs.query({});
  send({
    type: 'tabs',
    v: PROTOCOL_VERSION,
    browser: browserKind,
    tabs: tabs.map(toTabInfo).filter((t): t is TabInfo => t !== null),
  });
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
    switch (cmd.type) {
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
    send({ type: 'result', v: PROTOCOL_VERSION, requestId: cmd.requestId, ok: true });
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
    change.audible !== undefined
  ) {
    scheduleSnapshot();
  }
});

// Retry the connection every minute in case the app starts later.
chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) connect();
});
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.action.onClicked.addListener(connect);

connect();
