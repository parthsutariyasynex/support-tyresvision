// Helpers for the report date-range picker (Conversation Reports): presets, the two-month calendar grid and the
// labels. Days are Dubai calendar days as yyyy-mm-dd strings, like lib/dateRange.ts; the calendar is plain UTC date
// arithmetic so no device time zone shifts it.
import { parseYmd, todayYmd, ymd } from './dateRange';
import { addDays } from './time';

export type ReportPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisWeek'
  | 'lastWeek'
  | 'monthToDate'
  | 'lastMonth'
  | 'last3Months'
  | 'yearToDate'
  | 'lastYear'
  | 'custom';

export const REPORT_PRESETS: { key: ReportPreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'monthToDate', label: 'Month to date' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last3Months', label: 'Last 3 months' },
  { key: 'yearToDate', label: 'Year to date' },
  { key: 'lastYear', label: 'Last year' },
  { key: 'custom', label: 'Custom range' },
];

const firstOfMonth = (day: string, delta = 0) => {
  const d = parseYmd(day);
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));
};
const lastOfMonth = (day: string, delta = 0) => {
  const d = parseYmd(day);
  return ymd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta + 1, 0)));
};
// Weeks start on Sunday, as in the calendar
const weekStart = (day: string) => addDays(day, -parseYmd(day).getUTCDay());

// The from/to days a preset stands for, relative to `now` (custom: none)
export function reportPresetRange(p: ReportPreset, now: Date | number = new Date()): { from: string; to: string } | null {
  const today = todayYmd(now);
  const year = today.slice(0, 4);
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'thisWeek':
      return { from: weekStart(today), to: today };
    case 'lastWeek': {
      const start = addDays(weekStart(today), -7);
      return { from: start, to: addDays(start, 6) };
    }
    case 'monthToDate':
      return { from: firstOfMonth(today), to: today };
    case 'lastMonth':
      return { from: firstOfMonth(today, -1), to: lastOfMonth(today, -1) };
    case 'last3Months':
      return { from: firstOfMonth(today, -2), to: today };
    case 'yearToDate':
      return { from: `${year}-01-01`, to: today };
    case 'lastYear':
      return { from: `${Number(year) - 1}-01-01`, to: `${Number(year) - 1}-12-31` };
    default:
      return null;
  }
}

// Which preset a from/to pair matches; anything else is custom
export function matchReportPreset(from: string, to: string, now: Date | number = new Date()): ReportPreset {
  for (const { key } of REPORT_PRESETS) {
    if (key === 'custom') continue;
    const r = reportPresetRange(key, now)!;
    if (r.from === from && r.to === to) return key;
  }
  return 'custom';
}

// Month grid, weeks starting on Sunday. Every cell has its date; `inMonth` is false for the neighbouring months'
// days (shown blank, but still shaded when they are in the selected range).
export function fullMonthGrid(year: number, month: number): { day: string; inMonth: boolean }[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = addDays(ymd(first), -first.getUTCDay());
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const count = Math.ceil((first.getUTCDay() + days) / 7) * 7;
  const weeks: { day: string; inMonth: boolean }[][] = [];
  for (let i = 0; i < count; i++) {
    const day = addDays(start, i);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ day, inMonth: parseYmd(day).getUTCMonth() === month });
  }
  return weeks;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "2026-11-01" → "Nov 1, 2026"
export function longDay(day: string) {
  if (!day) return '';
  const d = parseYmd(day);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
// "2026-11-01" → "Nov 1"
export function shortDay(day: string) {
  const d = parseYmd(day);
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
// "2026-11" → "Nov 2026"
export const monthLabel = (year: number, month: number) => `${MONTHS_SHORT[month]} ${year}`;
// "2026-11-01" → "Sunday"
export const weekdayName = (day: string) => WEEKDAY_NAMES[parseYmd(day).getUTCDay()];
// Number of days from `from` to `to`, both included
export const daysBetween = (from: string, to: string) => Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000) + 1;
