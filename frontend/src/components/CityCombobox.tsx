import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { allCities, cityLabel } from '../lib/cities';
import type { City } from '../services/api';

/**
 * City search, following the WAI-ARIA 1.2 combobox pattern (editable input +
 * listbox popup, aria-activedescendant for the highlighted option).
 *
 * Type "Del", "delhi" or "DEL" and see "Delhi (DEL)". Matches the code, the
 * start of the city name, then anywhere in the name or state.
 *
 * Keys: ↓/↑ move (↓ also opens), Enter picks, Esc closes (a second Esc clears
 * the typing), Home/End jump. Leaving the field keeps a valid exact match and
 * otherwise restores the last chosen city — the value is never left invalid.
 */
export default function CityCombobox({
  label, value, onChange, options, hint, error, id: idProp,
}: {
  label: string;
  value: string;                   // selected airport code
  onChange: (code: string) => void;
  options: string[];               // codes that may be picked
  hint?: string;
  error?: string | null;
  id?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const [text, setText] = useState(value ? cityLabel(value) : '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the visible text in step when the value is changed from outside.
  useEffect(() => { setText(value ? cityLabel(value) : ''); }, [value]);

  const pool = useMemo<City[]>(() => {
    const allowed = new Set(options);
    return allCities().filter(c => allowed.has(c.code));
  }, [options]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    // While the field shows the current choice, list everything.
    if (!q || (value && text === cityLabel(value))) return pool;
    const score = (c: City) => {
      const name = c.city.toLowerCase();
      if (c.code.toLowerCase() === q) return 0;
      if (name.startsWith(q)) return 1;
      if (c.code.toLowerCase().startsWith(q)) return 2;
      if (name.includes(q) || (c.state ?? '').toLowerCase().includes(q) || c.label.toLowerCase().includes(q)) return 3;
      return 9;
    };
    return pool.map(c => [score(c), c] as const).filter(([s]) => s < 9)
      .sort((a, b) => a[0] - b[0] || a[1].city.localeCompare(b[1].city)).map(([, c]) => c);
  }, [text, pool, value]);

  useEffect(() => { setActive(0); }, [text]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (c: City) => {
    onChange(c.code);
    setText(c.label);
    setOpen(false);
  };

  const commitOrRevert = () => {
    const q = text.trim().toLowerCase();
    const exact = pool.find(c => c.code.toLowerCase() === q || c.city.toLowerCase() === q || c.label.toLowerCase() === q);
    if (exact) pick(exact);
    else setText(value ? cityLabel(value) : '');
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { setOpen(true); return; }
        setActive(a => Math.min(a + 1, matches.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(a => Math.max(a - 1, 0));
        break;
      case 'Home':
        if (open) { e.preventDefault(); setActive(0); }
        break;
      case 'End':
        if (open) { e.preventDefault(); setActive(matches.length - 1); }
        break;
      case 'Enter':
        if (open && matches[active]) { e.preventDefault(); pick(matches[active]); }
        break;
      case 'Escape':
        if (open) { e.preventDefault(); setOpen(false); setText(value ? cityLabel(value) : ''); }
        else if (text) { e.preventDefault(); setText(''); }
        break;
      case 'Tab':
        if (open && matches[active] && text !== (value ? cityLabel(value) : '')) pick(matches[active]);
        else setOpen(false);
        break;
    }
  };

  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const activeId = open && matches[active] ? `${id}-opt-${matches[active].code}` : undefined;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-[14px] font-medium text-ink-2">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          value={text}
          placeholder="Type a city or airport code"
          onChange={e => { setText(e.target.value); setOpen(true); }}
          onFocus={e => e.currentTarget.select()}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(commitOrRevert, 120)}
          className={`field pr-9 ${error ? '!border-bad focus:!ring-bad/25' : ''}`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Show all ${label.toLowerCase()} cities`}
          onMouseDown={e => { e.preventDefault(); setOpen(o => !o); inputRef.current?.focus(); }}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center text-ink-3 hover:text-ink"
        >
          <span aria-hidden className={`text-[11px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </button>
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={`${label} cities`}
        hidden={!open}
        className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-pop"
      >
        {matches.length === 0 && (
          <li role="option" aria-selected={false} aria-disabled className="px-3 py-2 text-[14px] text-ink-3">
            No matching city. Try a name like "Delhi" or a code like "DEL".
          </li>
        )}
        {matches.map((c, i) => (
          <li
            key={c.code}
            id={`${id}-opt-${c.code}`}
            data-index={i}
            role="option"
            aria-selected={c.code === value}
            onMouseDown={e => { e.preventDefault(); pick(c); }}
            onMouseEnter={() => setActive(i)}
            className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-[14px] ${
              i === active ? 'bg-accent-soft text-accent-ink' : 'text-ink'
            }`}
          >
            <span className="font-medium">{c.city} <span className="text-ink-3">({c.code})</span></span>
            {c.state && <span className="truncate text-[12px] text-ink-3">{c.state}</span>}
          </li>
        ))}
      </ul>

      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-[13px] text-ink-3">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-[13px] font-medium text-bad">{error}</p>}
    </div>
  );
}
