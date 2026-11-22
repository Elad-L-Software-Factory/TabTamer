import type { BrowserKind, BrowserTab, TabSummary } from '@tabtamer/core';

/** Channels between the main process and the screens. */
export const IPC = {
  getState: 'tabtamer:get-state',
  state: 'tabtamer:state',
  closeTab: 'tabtamer:close-tab',
} as const;

export interface AppState {
  summary: TabSummary;
  tabs: BrowserTab[];
}

/** The API the preload script exposes to the screens as window.tabtamer. */
export interface TabTamerApi {
  getState(): Promise<AppState>;
  onState(listener: (state: AppState) => void): () => void;
  closeTab(browser: BrowserKind, tabId: number): Promise<boolean>;
}
