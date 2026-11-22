import { useEffect, useRef, useState } from 'react';

/** Small pop-up list: pick an existing name or type a new one. */
export function Picker({
  options,
  suggested,
  newLabel,
  onPick,
  onClose,
}: {
  options: { name: string; badge?: string }[];
  suggested?: string;
  newLabel: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const sorted = [...options].sort((a, b) =>
    a.name === suggested ? -1 : b.name === suggested ? 1 : 0,
  );
  const filtered = text
    ? sorted.filter((o) => o.name.toLowerCase().includes(text.toLowerCase()))
    : sorted;
  const exact = filtered.some((o) => o.name.toLowerCase() === text.trim().toLowerCase());

  useEffect(() => {
    input.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  function onKey(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Enter') {
      const pick = filtered[active]?.name ?? text.trim();
      if (text.trim() && !exact && active >= filtered.length - 1 && filtered.length === 0) {
        onPick(text.trim());
      } else if (pick) onPick(pick);
    }
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
      onKeyDown={onKey}
    >
      <input
        ref={input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        placeholder={`Type to find or ${newLabel.toLowerCase()}`}
        className="mb-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-brand"
      />
      <ul className="max-h-56 overflow-y-auto">
        {filtered.map((o, i) => (
          <li key={o.name}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(o.name)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                i === active ? 'bg-blue-50 text-brand-dark' : ''
              }`}
            >
              {o.badge && <span>{o.badge}</span>}
              <span className="flex-1 truncate">{o.name}</span>
              {o.name === suggested && <span className="text-xs text-gray-400">suggested</span>}
            </button>
          </li>
        ))}
      </ul>
      {text.trim() && !exact && (
        <button
          type="button"
          onClick={() => onPick(text.trim())}
          className="mt-1 w-full rounded-lg bg-gray-50 px-2 py-1.5 text-left text-sm font-medium text-brand-dark hover:bg-blue-50"
        >
          + {newLabel}: “{text.trim()}”
        </button>
      )}
    </div>
  );
}
