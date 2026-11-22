import { describe, expect, it } from 'vitest';
import {
  STARTER_CATEGORIES,
  STARTER_THEMES,
  UNSORTED,
  fallbackRecommendation,
  makeTheme,
  normalizeRecommendation,
  themeLabel,
  triageCandidates,
} from './triage';
import type { BrowserTab } from './types';

const base = { summary: 's', reason: 'r' };

describe('normalizeRecommendation', () => {
  it('turns an unsure "forget" into "save" so nothing important is lost', () => {
    const r = normalizeRecommendation(
      { ...base, action: 'forget', target: '', confidence: 'low' },
      STARTER_CATEGORIES,
      STARTER_THEMES,
    );
    expect(r).toMatchObject({ action: 'save', target: UNSORTED });
  });

  it('keeps a confident forget', () => {
    const r = normalizeRecommendation(
      { ...base, action: 'forget', target: 'x', confidence: 'high' },
      STARTER_CATEGORIES,
      STARTER_THEMES,
    );
    expect(r).toMatchObject({ action: 'forget', target: '' });
  });

  it('matches existing names case-insensitively and keeps new tidy names', () => {
    expect(
      normalizeRecommendation(
        { ...base, action: 'save', target: 'jobs', confidence: 'high' },
        STARTER_CATEGORIES,
        STARTER_THEMES,
      ).target,
    ).toBe('Jobs');
    expect(
      normalizeRecommendation(
        { ...base, action: 'save', target: '  Home   Projects ', confidence: 'high' },
        STARTER_CATEGORIES,
        STARTER_THEMES,
      ).target,
    ).toBe('Home Projects');
    expect(
      normalizeRecommendation(
        { ...base, action: 'theme', target: 'job search', confidence: 'medium' },
        STARTER_CATEGORIES,
        STARTER_THEMES,
      ).target,
    ).toBe('Job Search');
  });

  it('falls back to Unsorted when a theme or category is missing', () => {
    expect(
      normalizeRecommendation(
        { ...base, action: 'theme', target: '', confidence: 'high' },
        STARTER_CATEGORIES,
        STARTER_THEMES,
      ),
    ).toMatchObject({ action: 'save', target: UNSORTED });
  });
});

describe('themes', () => {
  it('labels theme windows and gives new themes unused colors', () => {
    expect(themeLabel(STARTER_THEMES[0]!)).toBe('💼 Job Search');
    const t = makeTheme('  Home renovation ', STARTER_THEMES);
    expect(t.name).toBe('Home renovation');
    expect(STARTER_THEMES.map((x) => x.color)).not.toContain(t.color);
  });
});

describe('triageCandidates', () => {
  const tab = (id: number, extra: Partial<BrowserTab> = {}): BrowserTab => ({
    browser: 'chrome',
    id,
    windowId: 1,
    url: `https://example.com/${id}`,
    title: `T${id}`,
    pinned: false,
    audible: false,
    active: false,
    ...extra,
  });

  it('skips pinned, audible and already-themed tabs', () => {
    const tabs = [
      tab(1),
      tab(2, { pinned: true }),
      tab(3, { audible: true }),
      tab(4, { groupTitle: '💼 Job Search' }),
      tab(5, { groupTitle: 'My own group' }),
    ];
    expect(triageCandidates(tabs, STARTER_THEMES).map((t) => t.id)).toEqual([1, 5]);
  });
});

describe('fallbackRecommendation', () => {
  it('saves to Unsorted', () => {
    expect(fallbackRecommendation({ title: 'A', url: 'u' })).toMatchObject({
      action: 'save',
      target: UNSORTED,
      source: 'fallback',
    });
  });
});
