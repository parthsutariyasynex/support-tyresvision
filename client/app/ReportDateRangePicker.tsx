'use client';

import { useEffect, useRef, useState } from 'react';
import { inRange, parseYmd, pickDay, todayYmd } from '@/lib/dateRange';
import {
  type ReportPreset,
  REPORT_PRESETS,
  fullMonthGrid,
  longDay,
  matchReportPreset,
  monthLabel,
  reportPresetRange,
} from '@/lib/reportRange';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

type Range = { from: string; to: string };
type View = { year: number; month: number };

const shift = (v: View, delta: number): View => {
  const d = new Date(Date.UTC(v.year, v.month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
};
// The left month to show for a range: its start month, unless that would push the right month past this month
function viewFor(from: string, today: string): View {
  const d = parseYmd(from || today);
  const v = { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  const t = parseYmd(today);
  const latest = shift({ year: t.getUTCFullYear(), month: t.getUTCMonth() }, -1);
  return v.year * 12 + v.month > latest.year * 12 + latest.month ? latest : v;
}

// Date-range picker for reports: a green button showing the range; it opens two months side by side with month and
// year menus, a preset menu, the from/to days, and Cancel / Apply. Nothing changes until Apply. Future days can't
// be picked. Days are Dubai days (yyyy-mm-dd).
// `preset`: the preset that produced `value`, when known (two presets can give the same days, e.g. "This week" and
// "Month to date" when the month starts on a Sunday); the panel shows it instead of guessing.
export function ReportDateRangePicker({ value, preset, onApply }: { value: Range; preset?: ReportPreset; onApply: (range: Range, preset: ReportPreset) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-on-primary shadow-2xs transition hover:bg-primary-hover"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span className="tabular-nums">
          {value.from === value.to ? longDay(value.from) : `${longDay(value.from)} – ${longDay(value.to)}`}
        </span>
      </button>

      {open && (
        <RangePanel
          initial={value}
          initialPreset={preset}
          onCancel={() => setOpen(false)}
          onApply={(r, p) => {
            setOpen(false);
            onApply(r, p);
          }}
        />
      )}
    </div>
  );
}

function RangePanel({
  initial,
  initialPreset,
  onCancel,
  onApply,
}: {
  initial: Range;
  initialPreset?: ReportPreset;
  onCancel: () => void;
  onApply: (r: Range, preset: ReportPreset) => void;
}) {
  const today = todayYmd();
  const [draft, setDraft] = useState<Range>(initial);
  const [preset, setPreset] = useState<ReportPreset>(() => {
    const known = initialPreset && reportPresetRange(initialPreset);
    return known && known.from === initial.from && known.to === initial.to ? initialPreset : matchReportPreset(initial.from, initial.to);
  });
  const [view, setView] = useState<View>(() => viewFor(initial.from, today));
  const [hover, setHover] = useState('');

  const t = parseYmd(today);
  const thisYear = t.getUTCFullYear();
  const latest = shift({ year: thisYear, month: t.getUTCMonth() }, -1); // the right-hand month is at most this month
  const atLatest = view.year * 12 + view.month >= latest.year * 12 + latest.month;
  const ready = !!draft.from && !!draft.to;
  // While picking the end day, shade up to the day under the mouse
  const shownTo = draft.to || (draft.from && hover ? (hover < draft.from ? draft.from : hover) : '');
  const shownFrom = !draft.to && draft.from && hover && hover < draft.from ? hover : draft.from;

  function choosePreset(p: ReportPreset) {
    setPreset(p);
    const r = reportPresetRange(p);
    if (!r) return; // custom: keep the days, pick on the calendar
    setDraft(r);
    setView(viewFor(r.from, today));
  }

  function setMonthYear(next: View) {
    const capped = next.year * 12 + next.month > latest.year * 12 + latest.month ? latest : next;
    setView(capped);
  }

  const selectBox =
    'cursor-pointer appearance-none rounded-md border border-line bg-surface py-2 pl-3.5 pr-8 text-sm text-body outline-none transition hover:border-line-strong focus:border-primary';
  const chevrons = (
    <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7 9 5-5 5 5M7 15l5 5 5-5" />
    </svg>
  );

  return (
    <div
      role="dialog"
      aria-label="Choose a date range"
      className="fixed inset-x-2 top-16 z-50 max-h-[calc(100vh-5rem)] overflow-auto rounded-xl border border-line bg-surface p-4 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1.5 sm:max-h-none sm:w-max sm:max-w-[calc(100vw-2rem)] sm:p-5"
    >
      <div className="flex flex-col gap-5 xl:flex-row">
        {/* Calendars */}
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button type="button" aria-label="Previous month" onClick={() => setView((v) => shift(v, -1))} className="rounded-md p-1.5 text-body hover:bg-surface-muted">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="flex items-center gap-4">
              <div className="relative">
                <select aria-label="Month" value={view.month} onChange={(e) => setMonthYear({ ...view, month: Number(e.target.value) })} className={`${selectBox} w-36`}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i} disabled={view.year * 12 + i > latest.year * 12 + latest.month}>
                      {m}
                    </option>
                  ))}
                </select>
                {chevrons}
              </div>
              <div className="relative">
                <select aria-label="Year" value={view.year} onChange={(e) => setMonthYear({ ...view, year: Number(e.target.value) })} className={`${selectBox} w-24`}>
                  {Array.from({ length: 8 }, (_, i) => thisYear - 7 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                {chevrons}
              </div>
            </div>
            <button type="button" aria-label="Next month" disabled={atLatest} onClick={() => setView((v) => shift(v, 1))} className="rounded-md p-1.5 text-body hover:bg-surface-muted disabled:opacity-30">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {[view, shift(view, 1)].map((m) => (
              <MonthTable
                key={`${m.year}-${m.month}`}
                year={m.year}
                month={m.month}
                today={today}
                from={shownFrom}
                to={shownTo}
                edges={[draft.from, draft.to]}
                onPick={(day) => {
                  setPreset('custom');
                  setDraft((r) => pickDay(r, day));
                }}
                onHover={setHover}
              />
            ))}
          </div>
        </div>

        {/* Preset, chosen days, actions */}
        <div className="flex min-w-0 flex-col gap-5 xl:w-72 2xl:w-[30rem]">
          <div className="relative">
            <select aria-label="Preset range" value={preset} onChange={(e) => choosePreset(e.target.value as ReportPreset)} className={`${selectBox} w-full`}>
              {REPORT_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {chevrons}
          </div>

          <div className="flex items-center gap-3 rounded-md bg-surface-strong p-3">
            <div className="flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-center text-sm text-body tabular-nums">
              {draft.from ? longDay(draft.from) : <span className="text-faint">Start date</span>}
            </div>
            <span className="text-muted">–</span>
            <div className="flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-center text-sm text-body tabular-nums">
              {draft.to ? longDay(draft.to) : <span className="text-faint">End date</span>}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onCancel} className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-body transition hover:bg-surface-muted">
              Cancel
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => onApply(draft, preset)}
              className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-on-primary transition hover:bg-primary-hover disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthTable({
  year,
  month,
  today,
  from,
  to,
  edges,
  onPick,
  onHover,
}: {
  year: number;
  month: number;
  today: string;
  from: string;
  to: string;
  edges: string[];
  onPick: (day: string) => void;
  onHover: (day: string) => void;
}) {
  return (
    <div className="w-[17rem] max-w-full">
      <p className="mb-1.5 text-center text-[13px] font-bold text-ink">{monthLabel(year, month)}</p>
      <table className="w-full table-fixed border-collapse text-center text-[13px]" onMouseLeave={() => onHover('')}>
        <thead>
          <tr className="text-muted">
            {WEEKDAYS.map((d) => (
              <th key={d} className="pb-1.5 text-[12px] font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fullMonthGrid(year, month).map((week, i) => (
            <tr key={i}>
              {week.map(({ day, inMonth }, j) => {
                const selected = (from && to && inRange(day, from, to)) || (!!from && !to && day === from);
                const shade = selected ? 'bg-range border-range-border' : 'border-line-soft';
                if (!inMonth) return <td key={j} className={`h-10 border ${shade}`} />;
                const future = day > today;
                const weekend = j === 0 || j === 6;
                const edge = edges.includes(day);
                return (
                  <td key={j} className={`h-10 border p-0 ${shade}`}>
                    <button
                      type="button"
                      disabled={future}
                      aria-label={longDay(day)}
                      aria-pressed={!!selected}
                      onClick={() => onPick(day)}
                      onMouseEnter={() => onHover(day)}
                      className={`flex h-full w-full items-center justify-center transition ${
                        future ? 'cursor-default text-faint/70' : `${weekend ? 'text-danger' : 'text-body'} ${selected ? '' : 'hover:bg-surface-muted'}`
                      } ${edge ? 'font-bold' : ''} ${day === today ? 'underline decoration-2 underline-offset-4' : ''}`}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
