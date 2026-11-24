'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Left menu → Reports (owners and admins): a menu item like Inbox or Teams, with an arrow; clicking it shows or hides
// Activity Reports, Conversation Reports and Contact Reports underneath (like LIFECYCLE STAGES folds). Closed at
// first; open or closed is then remembered on this device. A menu search that matches a report shows it even while
// the section is closed.
const KEY = 'support:reportsMenuOpen';
let rememberedOpen: boolean | null = null;

const REPORT_PAGES = [
  { href: '/reports', label: 'Activity Reports' },
  { href: '/conversation-reports', label: 'Conversation Reports' },
  { href: '/contact-reports', label: 'Contact Reports' },
] as const;

const icons: Record<string, React.ReactNode> = {
  '/reports': (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 4 4 5-6" />
    </>
  ),
  '/conversation-reports': (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" />
      <rect x="12" y="7" width="3" height="10" />
      <rect x="17" y="13" width="3" height="4" />
    </>
  ),
  '/contact-reports': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
};

export function ReportsMenu({ matches, searching }: { matches: (label: string) => boolean; searching: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(() => {
    if (rememberedOpen === null) {
      try {
        rememberedOpen = localStorage.getItem(KEY) === '1';
      } catch {
        rememberedOpen = false;
      }
    }
    return rememberedOpen;
  });

  // Searching "reports" lists both; "activity" only Activity Reports; no match hides the section
  const shown = REPORT_PAGES.filter((p) => matches(p.label) || matches('Reports'));
  if (!shown.length) return null;
  const expanded = open || searching;

  const toggle = () => {
    const next = !open;
    rememberedOpen = next;
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // private mode: just not remembered
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-body transition hover:bg-surface-strong"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" />
          <path d="M14 2v6h6M8 17v-3M12 17v-6M16 17v-2" />
        </svg>
        <span className="flex-1 text-left">Reports</span>
        <svg className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform ${expanded ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>
      {expanded && (
        <nav aria-label="Reports" className="mt-0.5 ml-4 space-y-0.5 border-l border-line-soft pl-2">
          {shown.map((p) => {
            const active = pathname === p.href;
            return (
              <Link
                key={p.href}
                href={p.href}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition ${active ? 'bg-secondary text-on-primary shadow-2xs' : 'text-body hover:bg-surface-strong'}`}
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {icons[p.href]}
                </svg>
                <span className="truncate">{p.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
