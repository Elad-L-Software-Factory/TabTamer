import { BROWSERS, type BrowserKind, type TabInfo } from './types';

/** Bump when a message shape changes incompatibly. */
export const PROTOCOL_VERSION = 1;

/** Native messaging host name registered for Chrome and Edge. */
export const NATIVE_HOST_NAME = 'com.tabtamer.host';

/** Private Windows named pipe between the relay and the app (per Windows user session). */
export const PIPE_NAME = '\\\\.\\pipe\\tabtamer-v1';

// ---------- Helper (extension) -> App ----------

export interface HelloMessage {
  type: 'hello';
  v: number;
  browser: BrowserKind;
  extensionVersion: string;
}

export interface TabsMessage {
  type: 'tabs';
  v: number;
  browser: BrowserKind;
  tabs: TabInfo[];
}

export interface ResultMessage {
  type: 'result';
  v: number;
  requestId: string;
  ok: boolean;
  error?: string;
}

export type HelperMessage = HelloMessage | TabsMessage | ResultMessage;

// ---------- App -> Helper ----------

export interface ListTabsCommand {
  type: 'listTabs';
  v: number;
  requestId: string;
}

export interface CloseTabsCommand {
  type: 'closeTabs';
  v: number;
  requestId: string;
  tabIds: number[];
}

export type AppCommand = ListTabsCommand | CloseTabsCommand;

// ---------- Relay -> App (wraps helper messages with the connection id) ----------

export interface RelayEnvelope {
  relayId: string;
  message?: HelperMessage;
  /** Sent once when the browser closes the native connection. */
  disconnected?: true;
}

// ---------- Validation ----------

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const isBrowser = (x: unknown): x is BrowserKind => BROWSERS.includes(x as BrowserKind);

export function isTabInfo(x: unknown): x is TabInfo {
  return (
    isRec(x) &&
    typeof x.id === 'number' &&
    typeof x.windowId === 'number' &&
    typeof x.url === 'string' &&
    typeof x.title === 'string' &&
    typeof x.pinned === 'boolean' &&
    typeof x.audible === 'boolean' &&
    typeof x.active === 'boolean'
  );
}

/** Returns a typed command, or null if the input is not a valid app command. */
export function parseAppCommand(x: unknown): AppCommand | null {
  if (!isRec(x) || x.v !== PROTOCOL_VERSION || typeof x.requestId !== 'string') return null;
  switch (x.type) {
    case 'listTabs':
      return x as unknown as ListTabsCommand;
    case 'closeTabs':
      return Array.isArray(x.tabIds) && x.tabIds.every((id) => Number.isInteger(id))
        ? (x as unknown as CloseTabsCommand)
        : null;
    default:
      return null;
  }
}

/** Returns a typed message, or null if the input is not a valid helper message. */
export function parseHelperMessage(x: unknown): HelperMessage | null {
  if (!isRec(x) || x.v !== PROTOCOL_VERSION) return null;
  switch (x.type) {
    case 'hello':
      return isBrowser(x.browser) && typeof x.extensionVersion === 'string'
        ? (x as unknown as HelloMessage)
        : null;
    case 'tabs':
      return isBrowser(x.browser) && Array.isArray(x.tabs) && x.tabs.every(isTabInfo)
        ? (x as unknown as TabsMessage)
        : null;
    case 'result':
      return typeof x.requestId === 'string' && typeof x.ok === 'boolean'
        ? (x as unknown as ResultMessage)
        : null;
    default:
      return null;
  }
}
