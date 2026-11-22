/** Data shapes shared by the main process and the screens (no Node imports here). */
import type { BrowserKind, Recommendation, Theme, TriageAction } from '@tabtamer/core';

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  summary: string;
  category: string;
  savedAt: string;
  browser: BrowserKind;
  favIconUrl?: string;
}

export interface TriageCard {
  key: string;
  browser: BrowserKind;
  tabId: number;
  title: string;
  site: string;
  url: string;
  favIconUrl?: string;
  rec?: Recommendation;
  done?: { action: TriageAction; target: string };
}

export type AiStatus = 'working' | 'done' | 'off' | 'error' | 'capped';

export interface TriageState {
  cards: TriageCard[];
  ai: {
    status: AiStatus;
    message?: string;
    model: string;
    sessionUsd: number;
    monthUsd: number;
    capUsd: number;
  };
  categories: string[];
  themes: Theme[];
  counts: { closed: number; saved: number; kept: number; themes: string[] };
  canUndo: boolean;
}
