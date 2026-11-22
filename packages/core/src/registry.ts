import {
  BROWSERS,
  type BrowserKind,
  type BrowserTab,
  type TabInfo,
  type TabSummary,
} from './types';

/** Holds the latest tab snapshot from each connected browser. */
export class TabRegistry {
  private snapshots = new Map<BrowserKind, TabInfo[]>();

  setTabs(browser: BrowserKind, tabs: TabInfo[]): void {
    this.snapshots.set(browser, tabs);
  }

  removeBrowser(browser: BrowserKind): void {
    this.snapshots.delete(browser);
  }

  allTabs(): BrowserTab[] {
    return BROWSERS.flatMap((browser) =>
      (this.snapshots.get(browser) ?? []).map((t) => ({ ...t, browser })),
    );
  }

  summary(): TabSummary {
    const byBrowser: TabSummary['byBrowser'] = {};
    const connected: BrowserKind[] = [];
    let total = 0;
    for (const browser of BROWSERS) {
      const tabs = this.snapshots.get(browser);
      if (!tabs) continue;
      connected.push(browser);
      byBrowser[browser] = tabs.length;
      total += tabs.length;
    }
    return { total, byBrowser, connected };
  }
}
