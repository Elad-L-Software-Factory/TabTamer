/**
 * Local store for settings, saved tabs and the AI summary cache.
 * Temporary home until M4 moves all of this to the user's Google Drive.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  STARTER_CATEGORIES,
  STARTER_THEMES,
  findName,
  makeTheme,
  cleanName,
  type Recommendation,
  type Theme,
} from '@tabtamer/core';
import { DEFAULT_CLAUDE_MODEL } from '@tabtamer/llm';
import type { SavedTab } from './types';

export interface Settings {
  categories: string[];
  themes: Theme[];
  model: string;
  monthlyCapUsd: number;
  spend: { month: string; usd: number };
}

export type { SavedTab };

interface CacheEntry {
  rec: Recommendation;
  at: number;
}

const CACHE_DAYS = 90;
const DAY = 24 * 60 * 60 * 1000;

export class Store {
  settings: Settings;
  saved: SavedTab[];
  private cache: Record<string, CacheEntry>;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.settings = {
      categories: [...STARTER_CATEGORIES],
      themes: [...STARTER_THEMES],
      model: DEFAULT_CLAUDE_MODEL,
      monthlyCapUsd: 2,
      spend: { month: '', usd: 0 },
      ...this.read<Partial<Settings>>('settings.json', {}),
    };
    this.saved = this.read<SavedTab[]>('saved.json', []);
    this.cache = this.read<Record<string, CacheEntry>>('summary-cache.json', {});
  }

  private read<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(path.join(this.dir, file), 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  private write(file: string, data: unknown): void {
    const full = path.join(this.dir, file);
    writeFileSync(full + '.tmp', JSON.stringify(data, null, 2), 'utf8');
    renameSync(full + '.tmp', full);
  }

  saveSettings(): void {
    this.write('settings.json', this.settings);
  }

  /** Adds a category if it is new; returns the stored spelling. */
  ensureCategory(name: string): string {
    const existing = findName(this.settings.categories, name);
    if (existing) return existing;
    const clean = cleanName(name) || 'Unsorted';
    this.settings.categories.push(clean);
    this.saveSettings();
    return clean;
  }

  /** Adds a theme if it is new; returns the stored theme. */
  ensureTheme(name: string): Theme {
    const n = cleanName(name).toLowerCase();
    const existing = this.settings.themes.find((t) => t.name.toLowerCase() === n);
    if (existing) return existing;
    const theme = makeTheme(name, this.settings.themes);
    this.settings.themes.push(theme);
    this.saveSettings();
    return theme;
  }

  addSaved(tab: Omit<SavedTab, 'id' | 'savedAt'>): SavedTab {
    // Saving the same page again updates it instead of adding a duplicate.
    const existing = this.saved.find((s) => s.url === tab.url);
    const entry: SavedTab = {
      ...tab,
      id: existing?.id ?? randomUUID(),
      savedAt: new Date().toISOString(),
    };
    this.saved = [entry, ...this.saved.filter((s) => s.url !== tab.url)];
    this.write('saved.json', this.saved);
    return entry;
  }

  removeSaved(id: string): SavedTab | undefined {
    const entry = this.saved.find((s) => s.id === id);
    this.saved = this.saved.filter((s) => s.id !== id);
    this.write('saved.json', this.saved);
    return entry;
  }

  cached(key: string, now = Date.now()): Recommendation | undefined {
    const e = this.cache[key];
    return e && now - e.at < CACHE_DAYS * DAY ? e.rec : undefined;
  }

  putCache(entries: [string, Recommendation][], now = Date.now()): void {
    for (const [k, rec] of entries) this.cache[k] = { rec, at: now };
    for (const [k, e] of Object.entries(this.cache)) {
      if (now - e.at >= CACHE_DAYS * DAY) delete this.cache[k];
    }
    this.write('summary-cache.json', this.cache);
  }
}
