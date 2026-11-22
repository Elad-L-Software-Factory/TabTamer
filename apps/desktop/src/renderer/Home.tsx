import { useEffect, useState } from 'react';
import type { BrowserKind, BrowserTab } from '@tabtamer/core';
import type { AppState } from '../main/ipc';

const LABEL: Record<BrowserKind, string> = { chrome: 'Chrome', edge: 'Edge' };
const ALL: BrowserKind[] = ['chrome', 'edge'];

export function Home() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    void window.tabtamer.getState().then(setState);
    return window.tabtamer.onState(setState);
  }, []);

  if (!state) return null;
  const { summary, tabs } = state;
  const noneConnected = summary.connected.length === 0;

  return (
    <main className="flex h-full flex-col">
      <header className="bg-brand px-5 py-3 text-white">
        <h1 className="text-sm font-semibold tracking-wide">TabTamer</h1>
      </header>

      <section className="px-5 pt-6 pb-4 text-center">
        <div className="text-6xl font-bold tabular-nums" aria-live="polite">
          {summary.total}
        </div>
        <div className="mt-1 text-lg text-gray-600">tabs open</div>
        <div className="mt-4 flex justify-center gap-2">
          {ALL.map((b) => {
            const on = summary.connected.includes(b);
            return (
              <span
                key={b}
                className={`rounded-full px-3 py-1 text-sm ${
                  on ? 'bg-blue-50 text-brand-dark' : 'bg-gray-100 text-gray-400'
                }`}
                title={on ? `${LABEL[b]} is connected` : `${LABEL[b]} is not connected`}
              >
                {LABEL[b]} {on ? summary.byBrowser[b] : '·'}
              </span>
            );
          })}
        </div>
        <button
          type="button"
          disabled
          className="mt-6 w-full rounded-xl bg-brand py-3 text-lg font-semibold text-white opacity-50"
          title="Coming in the next version"
        >
          Tame my tabs
        </button>
      </section>

      {noneConnected ? (
        <p className="mx-5 rounded-lg bg-orange-50 p-4 text-sm text-orange-800">
          Waiting for Chrome or Edge. Make sure the TabTamer browser helper is added and the browser
          is open.
        </p>
      ) : (
        <TabList tabs={tabs} />
      )}
    </main>
  );
}

function TabList({ tabs }: { tabs: BrowserTab[] }) {
  return (
    <ul className="flex-1 overflow-y-auto px-3 pb-3">
      {tabs.map((t) => (
        <li
          key={`${t.browser}-${t.id}`}
          className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white"
        >
          {t.favIconUrl?.startsWith('http') || t.favIconUrl?.startsWith('data:') ? (
            <img src={t.favIconUrl} alt="" className="h-4 w-4 shrink-0" />
          ) : (
            <span className="h-4 w-4 shrink-0 rounded bg-gray-200" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm" title={t.url}>
            {t.title || t.url}
          </span>
          <span className="text-xs text-gray-400">{LABEL[t.browser]}</span>
          <button
            type="button"
            onClick={() => void window.tabtamer.closeTab(t.browser, t.id)}
            className="rounded px-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
            aria-label={`Close ${t.title}`}
            title="Close this tab"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
