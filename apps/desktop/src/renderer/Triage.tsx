import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Theme, TriageAction } from '@tabtamer/core';
import type { TriageCard, TriageState } from '../main/ipc';
import { Favicon } from './Favicon';
import { Picker } from './Picker';

const COLOR: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-800',
  purple: 'bg-purple-50 text-purple-800',
  green: 'bg-green-50 text-green-800',
  orange: 'bg-orange-50 text-orange-800',
  pink: 'bg-pink-50 text-pink-800',
  cyan: 'bg-cyan-50 text-cyan-800',
  red: 'bg-red-50 text-red-800',
  yellow: 'bg-yellow-50 text-yellow-800',
  grey: 'bg-gray-100 text-gray-700',
};

const GROUPS: { action: TriageAction | 'pending'; title: string }[] = [
  { action: 'pending', title: 'Reading pages...' },
  { action: 'theme', title: 'Suggested: keep open in a theme window' },
  { action: 'save', title: 'Suggested: save for later' },
  { action: 'forget', title: 'Suggested: forget' },
];

const money = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`);

export function Triage({ onHome, onSaved }: { onHome: () => void; onSaved: () => void }) {
  const [s, setS] = useState<TriageState | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ key: string; kind: 'save' | 'theme' } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const off = window.tabtamer.onTriage(setS);
    void window.tabtamer.triageStart().then(setS);
    return off;
  }, []);

  const open = useMemo(() => (s ? s.cards.filter((c) => !c.done) : []), [s]);
  const ordered = useMemo(
    () =>
      GROUPS.flatMap((g) =>
        open.filter((c) => (g.action === 'pending' ? !c.rec : c.rec?.action === g.action)),
      ),
    [open],
  );
  const focused = ordered.find((c) => c.key === focus) ?? ordered[0];

  const act = useCallback(async (card: TriageCard, action: TriageAction, target?: string) => {
    setPicker(null);
    await window.tabtamer.triageAct(card.key, action, target);
  }, []);

  // Keyboard: Enter accept, F forget, S save, T theme, arrows move, Space peek, Ctrl+Z undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picker || !focused) return;
      const i = ordered.findIndex((c) => c.key === focused.key);
      if (e.key === 'ArrowDown')
        setFocus(ordered[Math.min(i + 1, ordered.length - 1)]?.key ?? null);
      else if (e.key === 'ArrowUp') setFocus(ordered[Math.max(i - 1, 0)]?.key ?? null);
      else if (e.key === 'Enter' && e.ctrlKey) void window.tabtamer.triageAcceptAll();
      else if (e.key === 'Enter' && focused.rec)
        void act(focused, focused.rec.action, focused.rec.target);
      else if (e.key.toLowerCase() === 'f') void act(focused, 'forget');
      else if (e.key.toLowerCase() === 's') setPicker({ key: focused.key, kind: 'save' });
      else if (e.key.toLowerCase() === 't') setPicker({ key: focused.key, kind: 'theme' });
      else if (e.key === ' ') void window.tabtamer.focusTab(focused.browser, focused.tabId);
      else if (e.key.toLowerCase() === 'z' && e.ctrlKey) void window.tabtamer.triageUndo();
      else if (e.key === 'Escape') onHome();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ordered, focused, picker, act, onHome]);

  if (!s) return <p className="p-6 text-center text-gray-500">Getting your tabs ready...</p>;

  const total = s.cards.length;
  const decided = total - open.length;
  const themeOf = (name: string): Theme | undefined => s.themes.find((t) => t.name === name);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-2 bg-brand px-3 py-3 text-white">
        <button
          type="button"
          onClick={onHome}
          aria-label="Back"
          className="rounded px-2 text-lg leading-none hover:bg-white/15"
        >
          ‹
        </button>
        <h1 className="flex-1 text-sm font-semibold tracking-wide">Step 2 of 2: Triage</h1>
        {s.ai.model && (
          <span
            className="text-xs text-white/80"
            title={`AI this month: ${money(s.ai.monthUsd)} of ${money(s.ai.capUsd)}`}
          >
            AI {money(s.ai.sessionUsd)}
          </span>
        )}
      </header>

      {total === 0 ? (
        <Done counts={s.counts} empty onHome={onHome} onSaved={onSaved} />
      ) : open.length === 0 ? (
        <Done counts={s.counts} onHome={onHome} onSaved={onSaved} canUndo={s.canUndo} />
      ) : (
        <>
          <section className="px-5 pt-4">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">
                {decided} of {total} decided
              </span>
              {s.ai.status === 'working' && <span className="text-gray-400">AI is reading...</span>}
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-brand transition-all"
                style={{ width: `${(decided / total) * 100}%` }}
              />
            </div>
            {s.ai.message && (
              <p className="mt-3 rounded-lg bg-orange-50 p-2.5 text-xs text-orange-800">
                {s.ai.message}
              </p>
            )}
          </section>

          <div className="flex-1 overflow-y-auto px-3 pb-28">
            {GROUPS.map((g) => {
              const cards = ordered.filter((c) =>
                g.action === 'pending' ? !c.rec : c.rec?.action === g.action,
              );
              if (!cards.length) return null;
              return (
                <section key={g.action} className="mt-4">
                  <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                    {g.title} ({cards.length})
                  </h2>
                  {cards.map((c) => (
                    <Card
                      key={c.key}
                      card={c}
                      focused={c.key === focused?.key}
                      themeOf={themeOf}
                      onFocus={() => setFocus(c.key)}
                      onAct={act}
                      picker={picker?.key === c.key ? picker.kind : null}
                      setPicker={(kind) => setPicker(kind ? { key: c.key, kind } : null)}
                      categories={s.categories}
                      themes={s.themes}
                    />
                  ))}
                </section>
              );
            })}
          </div>

          <footer className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3">
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !open.some((c) => c.rec)}
                onClick={async () => {
                  setBusy(true);
                  await window.tabtamer.triageAcceptAll();
                  setBusy(false);
                }}
                className="flex-1 rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Accept all remaining ({open.filter((c) => c.rec).length})
              </button>
              <button
                type="button"
                disabled={!s.canUndo}
                onClick={() => void window.tabtamer.triageUndo()}
                className="rounded-xl border border-gray-300 px-4 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Undo
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-gray-400">
              Enter accept · F forget · S save · T theme · Space peek · Ctrl+Z undo
            </p>
          </footer>
        </>
      )}
    </main>
  );
}

function Card({
  card,
  focused,
  themeOf,
  onFocus,
  onAct,
  picker,
  setPicker,
  categories,
  themes,
}: {
  card: TriageCard;
  focused: boolean;
  themeOf: (name: string) => Theme | undefined;
  onFocus: () => void;
  onAct: (card: TriageCard, action: TriageAction, target?: string) => Promise<void>;
  picker: 'save' | 'theme' | null;
  setPicker: (kind: 'save' | 'theme' | null) => void;
  categories: string[];
  themes: Theme[];
}) {
  const rec = card.rec;
  const theme = rec?.action === 'theme' ? themeOf(rec.target) : undefined;
  const pill =
    rec?.action === 'theme'
      ? {
          text: `Keep in ${theme ? `${theme.emoji} ` : ''}${rec.target}`,
          cls: COLOR[theme?.color ?? 'blue'],
        }
      : rec?.action === 'save'
        ? { text: `Save to ${rec.target}`, cls: 'bg-green-50 text-green-800' }
        : rec
          ? { text: 'Forget', cls: 'bg-red-50 text-red-700' }
          : null;

  return (
    <article
      onClick={onFocus}
      className={`relative mb-2 rounded-xl border bg-white p-3 ${
        focused ? 'border-brand shadow-sm ring-1 ring-brand/30' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5">
          <Favicon url={card.favIconUrl} />
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => void window.tabtamer.focusTab(card.browser, card.tabId)}
            title="Show this tab in the browser"
            className="block w-full truncate text-left text-sm font-semibold hover:text-brand-dark hover:underline"
          >
            {card.title}
          </button>
          <div className="truncate text-xs text-gray-400">{card.site}</div>
        </div>
      </div>

      {rec ? (
        <>
          <p className="mt-2 text-sm text-gray-700">{rec.summary}</p>
          <div className="mt-2 flex items-center gap-2">
            {pill && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`}>
                {pill.text}
              </span>
            )}
            <span className="truncate text-xs text-gray-400" title={rec.reason}>
              {rec.reason}
            </span>
          </div>
        </>
      ) : (
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-100" />
      )}

      <div className="relative mt-3 flex gap-1.5">
        <button
          type="button"
          disabled={!rec}
          onClick={() => rec && void onAct(card, rec.action, rec.target)}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
        >
          ✓ Accept
        </button>
        <button
          type="button"
          onClick={() => void onAct(card, 'forget')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Forget
        </button>
        <button
          type="button"
          onClick={() => setPicker(picker === 'save' ? null : 'save')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Save ▾
        </button>
        <button
          type="button"
          onClick={() => setPicker(picker === 'theme' ? null : 'theme')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Theme ▾
        </button>
        {picker === 'save' && (
          <Picker
            options={categories.map((name) => ({ name }))}
            suggested={rec?.action === 'save' ? rec.target : undefined}
            newLabel="New category"
            onPick={(name) => void onAct(card, 'save', name)}
            onClose={() => setPicker(null)}
          />
        )}
        {picker === 'theme' && (
          <Picker
            options={themes.map((t) => ({ name: t.name, badge: t.emoji }))}
            suggested={rec?.action === 'theme' ? rec.target : undefined}
            newLabel="New theme"
            onPick={(name) => void onAct(card, 'theme', name)}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </article>
  );
}

function Done({
  counts,
  empty,
  canUndo,
  onHome,
  onSaved,
}: {
  counts: TriageState['counts'];
  empty?: boolean;
  canUndo?: boolean;
  onHome: () => void;
  onSaved: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-5xl">{empty ? '✓' : '🎉'}</div>
      <h2 className="text-2xl font-bold">{empty ? 'Nothing left to triage' : 'Done!'}</h2>
      {!empty && (
        <p className="text-gray-600">
          Closed {counts.closed}, saved {counts.saved}, kept {counts.kept}
          {counts.themes.length > 0 &&
            ` in ${counts.themes.length} ${counts.themes.length === 1 ? 'theme' : 'themes'}`}
          .
        </p>
      )}
      {empty && (
        <p className="text-gray-600">
          Every open tab is pinned, playing, or already in a theme window.
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onHome}
          autoFocus
          className="rounded-xl bg-brand px-6 py-2.5 font-semibold text-white hover:bg-brand-dark"
        >
          Back to Home
        </button>
        <button
          type="button"
          onClick={onSaved}
          className="rounded-xl border border-gray-300 px-5 py-2.5 text-gray-700 hover:bg-gray-50"
        >
          See saved tabs
        </button>
      </div>
      {canUndo && (
        <button
          type="button"
          onClick={() => void window.tabtamer.triageUndo()}
          className="text-sm text-gray-500 underline"
        >
          Undo the last one
        </button>
      )}
    </section>
  );
}
