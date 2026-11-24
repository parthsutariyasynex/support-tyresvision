'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Reminders,
  REMINDERS_EVENT,
  fetchMyReminders,
  reminderReason,
  waitingFor,
} from '@/lib/reminders';
import { revalidateOnReturn } from '@/lib/revalidate';

// Header clock (next to the notifications bell on the chat pages, in the header on every other page): the chats
// waiting for you. Reminders are shown only here, never as pop-ups. The badge counts them; the list opens a chat.
// Reloaded when a reminder arrives or chats change (REMINDERS_EVENT), when you open a chat, and when you come back
// to the tab.
export function ReminderClock({ activeId, onSelect }: { activeId: string | null; onSelect: (conversationId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Reminders | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await fetchMyReminders();
      if (mine === seq.current) {
        setData(next);
        setNow(Date.now());
      }
    } catch {
      // keep the last list; the next event or tab return tries again
    }
  }, []);

  // Many events can arrive together (a burst of messages): one reload shortly after
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 600);
  }, [load]);

  useEffect(() => {
    void load();
    window.addEventListener(REMINDERS_EVENT, loadSoon);
    const stop = revalidateOnReturn(() => void load());
    return () => {
      window.removeEventListener(REMINDERS_EVENT, loadSoon);
      stop();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, loadSoon]);

  // Opening a chat can settle it (opened / read)
  useEffect(() => {
    if (activeId) loadSoon();
  }, [activeId, loadSoon]);

  // "waiting N min" stays current while the list is open
  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chats = data?.chats ?? [];
  const count = chats.length;
  const off = data?.minutes === 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count ? `Reminders, ${count} ${count === 1 ? 'chat' : 'chats'} waiting` : 'Reminders'}
        title="Reminders"
        className={`relative flex h-7.5 w-7.5 cursor-pointer items-center justify-center rounded-full border bg-surface transition hover:bg-surface-muted ${open ? 'border-primary text-primary' : 'border-line text-muted'}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-on-primary">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Reminders"
          className="absolute right-0 top-11 z-50 flex max-h-[70vh] w-80 max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-xs shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
            <span className="font-semibold text-ink">Reminders</span>
            {count > 0 && <span className="text-[11px] text-muted">{count === 1 ? '1 chat waiting' : `${count} chats waiting`}</span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {chats.map((c) => (
              <li key={c.conversationId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelect(c.conversationId);
                  }}
                  className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition hover:bg-surface-muted ${c.conversationId === activeId ? 'bg-primary-subtle' : ''}`}
                >
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c.kind === 'unassigned' ? 'bg-warning' : 'bg-accent'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{c.contactName || `+${c.contactWaId}`}</span>
                    <span className="block truncate text-body">{reminderReason(c)}</span>
                    <span className="mt-0.5 block text-[10px] text-faint">{waitingFor(c.waitingSince, now)}</span>
                  </span>
                </button>
              </li>
            ))}
            {data && count === 0 && (
              <li className="px-4 py-6 text-center text-muted">
                {off ? 'Reminders are turned off for this workspace.' : "You're all caught up: no chats are waiting for you."}
              </li>
            )}
            {!data && <li className="px-4 py-6 text-center text-muted">Loading…</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
