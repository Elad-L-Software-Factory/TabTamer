export const BROWSERS = ['chrome', 'edge'] as const;
export type BrowserKind = (typeof BROWSERS)[number];

/** One open browser tab, as reported by the browser helper. */
export interface TabInfo {
  id: number;
  windowId: number;
  /** Position in its window (used to reopen a tab in the same place on Undo). */
  index?: number;
  url: string;
  title: string;
  favIconUrl?: string;
  pinned: boolean;
  audible: boolean;
  active: boolean;
  /** Epoch milliseconds when the tab was last active, if the browser reports it. */
  lastAccessed?: number;
}

export interface BrowserTab extends TabInfo {
  browser: BrowserKind;
}

export interface TabSummary {
  total: number;
  byBrowser: Partial<Record<BrowserKind, number>>;
  connected: BrowserKind[];
}
