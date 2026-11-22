import { useEffect, useState } from 'react';
import type { SavedTab } from '../main/ipc';
import { Favicon } from './Favicon';

/** Simple list of saved tabs by category. (The rolodex Library arrives in M5.) */
export function Saved({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<SavedTab[] | null>(null);
  const reload = () => void window.tabtamer.savedList().then(setItems);
  useEffect(reload, []);

  const byCategory = new Map<string, SavedTab[]>();
  for (const s of items ?? [])
    byCategory.set(s.category, [...(byCategory.get(s.category) ?? []), s]);

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-2 bg-brand px-3 py-3 text-white">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="rounded px-2 text-lg leading-none hover:bg-white/15"
        >
          ‹
        </button>
        <h1 className="text-sm font-semibold tracking-wide">Saved tabs ({items?.length ?? 0})</h1>
      </header>
      {items && items.length === 0 && (
        <p className="p-6 text-center text-gray-500">
          Nothing saved yet. Tabs you save show up here.
        </p>
      )}
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {[...byCategory].map(([category, list]) => (
          <section key={category} className="mt-4">
            <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              {category} ({list.length})
            </h2>
            <ul>
              {list.map((s) => (
                <li
                  key={s.id}
                  className="group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-white"
                >
                  <div className="mt-0.5">
                    <Favicon url={s.favIconUrl} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => void window.tabtamer.savedOpen(s.id)}
                      title={s.url}
                      className="block w-full truncate text-left text-sm font-medium hover:text-brand-dark hover:underline"
                    >
                      {s.title}
                    </button>
                    <div className="truncate text-xs text-gray-500">{s.summary}</div>
                    <div className="text-[11px] text-gray-400">
                      Saved {new Date(s.savedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void window.tabtamer.savedDelete(s.id).then(reload)}
                    aria-label={`Delete ${s.title}`}
                    title="Remove from saved"
                    className="rounded px-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
