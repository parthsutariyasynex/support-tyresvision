'use client';

import { useEffect, useRef, useState } from 'react';

// A filter button with a tick list (Contact Reports → Status, Label): "All statuses" / "Won" / "Won +2". Pick any
// number; empty = no filter. Closes on a click outside or Esc.
export function CheckMenu({
  label,
  allLabel,
  options,
  value,
  onChange,
  icon,
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string; color?: string | null }[];
  value: string[];
  onChange: (next: string[]) => void;
  icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chosen = options.filter((o) => value.includes(o.value));
  const text = chosen.length === 0 ? allLabel : chosen.length === 1 ? chosen[0].label : `${chosen[0].label} +${chosen.length - 1}`;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${text}`}
        className={`flex w-full items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
          chosen.length ? 'border-primary bg-primary-subtle text-primary' : 'border-line bg-surface text-body hover:bg-surface-strong'
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{text}</span>
        <svg className={`h-3 w-3 shrink-0 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-0 top-full z-30 mt-2 flex max-h-80 w-60 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {options.length === 0 && <li className="px-2.5 py-3 text-center text-xs text-muted">Nothing to choose yet</li>}
            {options.map((o) => {
              const on = value.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => toggle(o.value)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition ${on ? 'bg-primary-subtle' : 'hover:bg-surface-muted'}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color ?? 'var(--color-line-strong)' }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{o.label}</span>
                    <span className="w-3 shrink-0 text-xs font-bold text-primary">{on ? '✓' : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line-soft px-3 py-2">
            <button
              type="button"
              disabled={!value.length}
              onClick={() => onChange([])}
              className="rounded-lg px-2 py-1 text-xs font-medium text-body-soft hover:bg-surface-muted disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
