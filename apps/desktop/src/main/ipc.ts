import type { BrowserKind, BrowserTab, TabSummary } from '@tabtamer/core';
import type { SweepRow } from './sweepSession';

export type { SweepRow };

/** Channels between the main process and the screens. */
export const IPC = {
  getState: 'tabtamer:get-state',
  state: 'tabtamer:state',
  closeTab: 'tabtamer:close-tab',
  focusTab: 'tabtamer:focus-tab',
  sweepStart: 'tabtamer:sweep-start',
  sweepRun: 'tabtamer:sweep-run',
  sweepUndo: 'tabtamer:sweep-undo',
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
  /** Bring a tab to the front so the user can peek at it. */
  focusTab(browser: BrowserKind, tabId: number): Promise<boolean>;
  /** Build the list of tabs that can close right away. */
  sweepStart(): Promise<SweepRow[]>;
  /** Close the approved rows (by key). Returns how many closed. */
  sweepRun(keys: string[]): Promise<number>;
  /** Reopen what the last sweep closed. Returns how many reopened. */
  sweepUndo(): Promise<number>;
}
