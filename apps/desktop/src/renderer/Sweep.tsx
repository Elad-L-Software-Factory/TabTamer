import { useEffect, useMemo, useState } from 'react';
import { SWEEP_GROUPS, type BrowserKind } from '@tabtamer/core';
import type { SweepRow } from '../main/ipc';
import { Favicon } from './Favicon';

const LABEL: Record<BrowserKind, string> = { chrome: 'Chrome', edge: 'Edge' };

export function Sweep({
  onDone,
  onCancel,
}: {
  onDone: (closed: number) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<SweepRow[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.tabtamer.sweepStart().then((r) => {
      setRows(r);
      setChecked(new Set(r.map((x) => x.key)));
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const groups = useMemo(
    () =>
      SWEEP_GROUPS.map((g) => ({
        ...g,
        rows: (rows ?? []).filter((r) => r.reason === g.reason),
      })).filter((g) => g.rows.length > 0),
    [rows],
  );

  const toggle = (keys: string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });

  async function closeChecked() {
    setBusy(true);
    const closed = await window.tabtamer.sweepRun([...checked]);
    onDone(closed);
  }

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-2 bg-brand px-3 py-3 text-white">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Back"
          className="rounded px-2 text-lg leading-none hover:bg-white/15"
        >
          ‹
        </button>
        <h1 className="text-sm font-semibold tracking-wide">Step 1 of 2: Sweep</h1>
      </header>

      {rows === null ? (
        <p className="p-6 text-center text-gray-500">Looking for tabs that can go...</p>
      ) : rows.length === 0 ? (
        <section className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-5xl">✓</div>
          <h2 className="text-xl font-semibold">Nothing to sweep</h2>
          <p className="text-gray-600">No junk or duplicate tabs right now. Nice and tidy!</p>
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 rounded-xl bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark"
          >
            Back
          </button>
        </section>
      ) : (
        <>
          <section className="px-5 pt-5 pb-2">
            <h2 className="text-lg font-bold">
              I found {rows.length} {rows.length === 1 ? 'tab' : 'tabs'} that can close right away
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Everything is checked. Uncheck anything you want to keep. Click a title to peek.
            </p>
          </section>

          <div className="flex-1 overflow-y-auto px-3 pb-28">
            {groups.map((g) => {
              const keys = g.rows.map((r) => r.key);
              const allOn = keys.every((k) => checked.has(k));
              const isCollapsed = collapsed.has(g.reason);
              return (
                <section key={g.reason} className="mt-3">
                  <div className="flex items-center gap-2 px-2 py-1">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={(e) => toggle(keys, e.target.checked)}
                      aria-label={`Select all ${g.title}`}
                      className="h-4 w-4 accent-brand"
                    />
                    <button
                      type="button"
                      className="flex-1 text-left text-sm font-semibold text-gray-700"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.reason)) next.delete(g.reason);
                          else next.add(g.reason);
                          return next;
                        })
                      }
                    >
                      {isCollapsed ? '▸' : '▾'} {g.title} ({g.rows.length})
                    </button>
                  </div>
                  {!isCollapsed && (
                    <ul>
                      {g.rows.map((r) => (
                        <li
                          key={r.key}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={checked.has(r.key)}
                            onChange={(e) => toggle([r.key], e.target.checked)}
                            aria-label={`Close ${r.title}`}
                            className="h-4 w-4 shrink-0 accent-brand"
                          />
                          <Favicon url={r.favIconUrl} />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => void window.tabtamer.focusTab(r.browser, r.tabId)}
                              title="Show this tab in the browser"
                              className="block w-full truncate text-left text-sm hover:text-brand-dark hover:underline"
                            >
                              {r.title}
                            </button>
                            <div
                              className="truncate text-xs text-gray-400"
                              title={
                                r.keepTitle ? `The copy that stays open: ${r.keepTitle}` : undefined
                              }
                            >
                              {r.site} · {g.why}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-gray-400">{LABEL[r.browser]}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          <footer className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-gray-200 bg-white/95 p-4">
            <button
              type="button"
              disabled={checked.size === 0 || busy}
              onClick={() => void closeChecked()}
              className="flex-1 rounded-xl bg-brand py-3 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Close these ({checked.size})
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-gray-300 px-5 text-gray-700 hover:bg-gray-50"
            >
              Skip
            </button>
          </footer>
        </>
      )}
    </main>
  );
}
