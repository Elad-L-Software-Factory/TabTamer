import type { BrowserKind, BrowserTab, TabSummary, TriageAction } from '@tabtamer/core';
import type { SweepRow } from './sweepSession';
import type { SavedTab, TriageCard, TriageState } from './types';

export type { SavedTab, SweepRow, TriageCard, TriageState };

/** Channels between the main process and the screens. */
export const IPC = {
  getState: 'tabtamer:get-state',
  state: 'tabtamer:state',
  closeTab: 'tabtamer:close-tab',
  focusTab: 'tabtamer:focus-tab',
  sweepStart: 'tabtamer:sweep-start',
  sweepRun: 'tabtamer:sweep-run',
  sweepUndo: 'tabtamer:sweep-undo',
  triageStart: 'tabtamer:triage-start',
  triageState: 'tabtamer:triage-state',
  triageAct: 'tabtamer:triage-act',
  triageAcceptAll: 'tabtamer:triage-accept-all',
  triageUndo: 'tabtamer:triage-undo',
  savedList: 'tabtamer:saved-list',
  savedOpen: 'tabtamer:saved-open',
  savedDelete: 'tabtamer:saved-delete',
} as const;

export interface AppState {
  summary: TabSummary;
  tabs: BrowserTab[];
  savedCount: number;
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
  /** Start triage: cards appear at once, AI suggestions arrive through onTriage. */
  triageStart(): Promise<TriageState>;
  onTriage(listener: (state: TriageState) => void): () => void;
  triageAct(key: string, action: TriageAction, target?: string): Promise<boolean>;
  triageAcceptAll(): Promise<number>;
  triageUndo(): Promise<boolean>;
  savedList(): Promise<SavedTab[]>;
  savedOpen(id: string): Promise<boolean>;
  savedDelete(id: string): Promise<boolean>;
}
