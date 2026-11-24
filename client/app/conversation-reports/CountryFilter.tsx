'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { type PhoneCountry, phoneCountries } from '@/lib/profileOptions';
import { CountryPanel } from '../inbox/CountryPanel';

// Conversation Reports → "Country code" filter: the same country list as the chat list's Filter menu (search, Gulf
// countries first, pick one or more). Empty = all countries.
export function CountryFilter({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const byCode = useMemo(() => new Map<string, PhoneCountry>(phoneCountries().map((c) => [c.code, c])), []);
  const chosen = value.map((code) => byCode.get(code)).filter((c): c is PhoneCountry => !!c);

  // Close on a click outside or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // "All countries" · "🇦🇪 United Arab Emirates" · "🇦🇪 🇸🇦 🇶🇦" · "🇦🇪 🇸🇦 🇶🇦 +2"
  const label =
    chosen.length === 0
      ? 'All countries'
      : chosen.length === 1
        ? `${chosen[0].flag} ${chosen[0].name}`
        : `${chosen
            .slice(0, 3)
            .map((c) => c.flag)
            .join(' ')}${chosen.length > 3 ? ` +${chosen.length - 3}` : ''}`;
  const title = chosen.length ? `Country code: ${chosen.map((c) => `${c.name} (+${c.dial})`).join(', ')}` : 'Filter by country code';

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={`flex w-56 max-w-full items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
          chosen.length ? 'border-primary bg-primary-subtle text-primary' : 'border-line bg-surface text-body hover:bg-surface-strong'
        }`}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10" />
        </svg>
        {/* Fixed-width button: the label changes as countries are picked, the button (and the list under it) stays put */}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <svg className={`h-3 w-3 shrink-0 transition ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-2 -ml-1 lg:left-auto lg:right-0">
          <CountryPanel selected={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
