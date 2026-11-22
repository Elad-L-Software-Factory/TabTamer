/**
 * Triage: what to do with each tab that survived the Sweep.
 * Pure rules shared by the app (no AI calls here).
 */
import type { BrowserTab } from './types';

export type TriageAction = 'forget' | 'save' | 'theme';
export type Confidence = 'low' | 'medium' | 'high';

export interface Recommendation {
  action: TriageAction;
  /** Category (save) or theme (theme) name. Empty for forget. */
  target: string;
  summary: string;
  confidence: Confidence;
  reason: string;
  source: 'ai' | 'cache' | 'fallback';
}

/** Chrome/Edge tab group colors. */
export const GROUP_COLORS = [
  'blue',
  'purple',
  'green',
  'orange',
  'pink',
  'cyan',
  'red',
  'yellow',
  'grey',
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export interface Theme {
  name: string;
  emoji: string;
  color: GroupColor;
}

export const UNSORTED = 'Unsorted';

export const STARTER_CATEGORIES = [
  'Jobs',
  'Learning',
  'AI & Tech',
  'Work',
  'Shopping',
  'News & Reading',
  'Finance',
  'Personal',
];

export const STARTER_THEMES: Theme[] = [
  { name: 'Job Search', emoji: '💼', color: 'blue' },
  { name: 'Research', emoji: '🔬', color: 'purple' },
  { name: 'Daily Tasks', emoji: '✅', color: 'green' },
];

const EMOJI_POOL = ['📌', '🧭', '🛠️', '📚', '🎯', '🏠', '✈️', '💡', '🧾', '🎨'];

/** The label shown on the theme window's tab group, e.g. "💼 Job Search". */
export const themeLabel = (t: Theme) => `${t.emoji} ${t.name}`;

/** A new theme with an emoji and color that are not used yet. */
export function makeTheme(name: string, existing: Theme[]): Theme {
  const usedColors = new Set(existing.map((t) => t.color));
  const usedEmoji = new Set(existing.map((t) => t.emoji));
  const color =
    GROUP_COLORS.find((c) => !usedColors.has(c)) ??
    GROUP_COLORS[existing.length % GROUP_COLORS.length]!;
  const emoji = EMOJI_POOL.find((e) => !usedEmoji.has(e)) ?? '📌';
  return { name: cleanName(name), emoji, color };
}

/** Trim and tidy a user- or AI-provided name; at most 30 characters. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 30);
}

/** Case-insensitive lookup that returns the existing spelling. */
export function findName(list: string[], name: string): string | undefined {
  const n = cleanName(name).toLowerCase();
  return list.find((x) => x.toLowerCase() === n);
}

/**
 * Tabs that go to triage: open web pages the user hasn't already organized.
 * Skips pinned tabs, tabs playing audio, and tabs already in a theme window.
 */
export function triageCandidates(tabs: BrowserTab[], themes: Theme[]): BrowserTab[] {
  const labels = new Set(themes.map(themeLabel));
  return tabs.filter((t) => !t.pinned && !t.audible && !(t.groupTitle && labels.has(t.groupTitle)));
}

/**
 * Make an AI suggestion safe and consistent:
 * - never "forget" when unsure (low confidence becomes save, per the PRD),
 * - map names to existing categories/themes, keep sensible new ones,
 * - fill an empty target.
 */
export function normalizeRecommendation(
  raw: Omit<Recommendation, 'source'>,
  categories: string[],
  themes: Theme[],
  source: Recommendation['source'] = 'ai',
): Recommendation {
  let { action, target } = raw;
  if (action === 'forget' && raw.confidence === 'low') {
    action = 'save';
    target = '';
  }
  if (action === 'save') {
    target = findName(categories, target) ?? (cleanName(target) || UNSORTED);
  } else if (action === 'theme') {
    const names = themes.map((t) => t.name);
    target = findName(names, target) ?? cleanName(target);
    if (!target) {
      action = 'save';
      target = UNSORTED;
    }
  } else {
    target = '';
  }
  return { ...raw, action, target, source };
}

/** Used when the AI is not available: keep everything, nothing is lost. */
export function fallbackRecommendation(tab: Pick<BrowserTab, 'title' | 'url'>): Recommendation {
  return {
    action: 'save',
    target: UNSORTED,
    summary: tab.title || tab.url,
    confidence: 'low',
    reason: 'AI not available, saving to be safe',
    source: 'fallback',
  };
}
