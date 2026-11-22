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
  /** moveToGroup: the window the tabs ended up in. */
  windowId?: number;
}

/** Reply to getPageTexts. Tabs whose text could not be read are left out. */
export interface PageTextsMessage {
  type: 'pageTexts';
  v: number;
  requestId: string;
  texts: { tabId: number; text: string }[];
}

export type HelperMessage = HelloMessage | TabsMessage | ResultMessage | PageTextsMessage;

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

/** Bring a tab to the front so the user can peek at it. */
export interface FocusTabCommand {
  type: 'focusTab';
  v: number;
  requestId: string;
  tabId: number;
}

export interface TabToOpen {
  url: string;
  windowId?: number;
  index?: number;
}

/** Reopen tabs (Undo). Falls back to the current window if the original one is gone. */
export interface OpenTabsCommand {
  type: 'openTabs';
  v: number;
  requestId: string;
  tabs: TabToOpen[];
}

/** Read the first part of each page's visible text (for the AI summary). */
export interface GetPageTextsCommand {
  type: 'getPageTexts';
  v: number;
  requestId: string;
  tabIds: number[];
}

/**
 * Move tabs into a theme window and label them with a tab group.
 * If windowId is missing or that window is gone, a new window is created.
 */
export interface MoveToGroupCommand {
  type: 'moveToGroup';
  v: number;
  requestId: string;
  tabIds: number[];
  windowId?: number;
  groupTitle: string;
  groupColor: string;
}

/** Undo a move: take tabs out of their group and put them back where they were. */
export interface RestoreTabsCommand {
  type: 'restoreTabs';
  v: number;
  requestId: string;
  moves: { tabId: number; windowId: number; index: number }[];
}

export type AppCommand =
  | ListTabsCommand
  | CloseTabsCommand
  | FocusTabCommand
  | OpenTabsCommand
  | GetPageTextsCommand
  | MoveToGroupCommand
  | RestoreTabsCommand;

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
const isIntArray = (x: unknown): x is number[] =>
  Array.isArray(x) && x.every((n) => Number.isInteger(n));

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
    case 'focusTab':
      return Number.isInteger(x.tabId) ? (x as unknown as FocusTabCommand) : null;
    case 'getPageTexts':
      return isIntArray(x.tabIds) ? (x as unknown as GetPageTextsCommand) : null;
    case 'moveToGroup':
      return isIntArray(x.tabIds) &&
        x.tabIds.length > 0 &&
        (x.windowId === undefined || Number.isInteger(x.windowId)) &&
        typeof x.groupTitle === 'string' &&
        typeof x.groupColor === 'string'
        ? (x as unknown as MoveToGroupCommand)
        : null;
    case 'restoreTabs':
      return Array.isArray(x.moves) &&
        x.moves.every(
          (m) =>
            isRec(m) &&
            Number.isInteger(m.tabId) &&
            Number.isInteger(m.windowId) &&
            Number.isInteger(m.index),
        )
        ? (x as unknown as RestoreTabsCommand)
        : null;
    case 'openTabs':
      return Array.isArray(x.tabs) && x.tabs.every(isTabToOpen)
        ? (x as unknown as OpenTabsCommand)
        : null;
    default:
      return null;
  }
}

function isTabToOpen(x: unknown): x is TabToOpen {
  return (
    isRec(x) &&
    typeof x.url === 'string' &&
    /^(https?|about|chrome|edge):/i.test(x.url) &&
    (x.windowId === undefined || Number.isInteger(x.windowId)) &&
    (x.index === undefined || Number.isInteger(x.index))
  );
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
    case 'pageTexts':
      return typeof x.requestId === 'string' &&
        Array.isArray(x.texts) &&
        x.texts.every((t) => isRec(t) && Number.isInteger(t.tabId) && typeof t.text === 'string')
        ? (x as unknown as PageTextsMessage)
        : null;
    default:
      return null;
  }
}
