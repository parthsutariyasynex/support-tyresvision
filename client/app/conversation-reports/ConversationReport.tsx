'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseYmd } from '@/lib/dateRange';
import { type ReportPreset, daysBetween, longDay, reportPresetRange, shortDay, weekdayName } from '@/lib/reportRange';
import { type ConversationReport as Report, dayEndIso, dayStartIso, fetchConversationReport } from '@/lib/reports';
import { contactCountry } from '@/lib/profileOptions';
import { revalidateOnReturn } from '@/lib/revalidate';
import { addDays, dayKey } from '@/lib/time';
import { ReportDateRangePicker } from '../ReportDateRangePicker';
import { CountryFilter } from './CountryFilter';

const PAGE_SIZE = 50;
type TableView = 'country' | 'stage' | 'city' | 'label' | 'agent';
// By city: the 7 UAE emirates always get their own column (as in the vehicle form's city list); any other city
// is counted under Other Cities
const UAE_CITIES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const OTHER_CITIES = 'Other Cities';
// "New customers by day" table: Day of week, Date and Total stay on the left and Won and Others on the right while the
// columns between them scroll sideways (on wider screens; on phones only the heading row stays). The heading row stays
// on top and the totals row at the bottom while the days scroll. Fixed widths, so each pinned column knows its offset.
const STICKY = {
  day: 'w-[120px] min-w-[120px] md:sticky md:left-0',
  date: 'w-[130px] min-w-[130px] md:sticky md:left-[120px]',
  total: 'w-[80px] min-w-[80px] md:sticky md:left-[250px] md:border-r md:border-r-line',
  won: 'w-[96px] min-w-[96px] md:sticky md:right-[96px]',
  others: 'w-[96px] min-w-[96px] md:sticky md:right-0',
};
// Every heading cell stays on top; a pinned one (left or right) also stays above the scrolling ones
const TH = 'sticky top-0 z-20 border-b border-b-line bg-surface-muted';
const TH_PIN = 'md:z-30';
// Day rows: cells carry the row line and background (so pinned cells cover what scrolls under them)
const TD = 'border-b border-b-line-soft bg-surface transition group-last:border-b-0 group-hover:bg-surface-muted';
const TD_PIN = 'md:z-10';
// Totals row: stays at the bottom
const TF = 'sticky bottom-0 z-20 border-t-2 border-t-line bg-surface-muted';
const TF_PIN = 'md:z-30';
const DIVIDER = 'border-l border-l-line';

// Conversation Reports: new customers in the chosen range (their first chat started then), and of those how many
// are won and lost now. Chart by day (by week or month for long ranges), then a day-by-day table by lifecycle stage.
export function ConversationReport() {
  const [range, setRange] = useState(() => reportPresetRange('monthToDate')!);
  const [preset, setPreset] = useState<ReportPreset>('monthToDate');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const dragScroll = useDragScroll();
  // The "New customers, won and lost" graph: hidden until opened from the Total New Customers card
  const [showChart, setShowChart] = useState(false);
  // "New customers by day" table: columns by lifecycle stage (shown first, every time the page opens) or by country
  const [view, setView] = useState<TableView>('stage');
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');
  // Country code filter (ISO codes); empty = all countries
  const [countries, setCountries] = useState<string[]>([]);

  // Ticking several countries quickly starts several loads: only the newest one may update the page
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');
    try {
      const next = await fetchConversationReport({ from: dayStartIso(range.from)!, to: dayEndIso(range.to)!, countries });
      if (seq === loadSeq.current) setReport(next);
    } catch (err) {
      if (seq === loadSeq.current) setError((err as Error).message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [range, countries]);

  useEffect(() => {
    load();
    return revalidateOnReturn(load);
  }, [load]);

  useEffect(() => setPage(1), [range, countries]);

  const colors = report?.colors ?? { new: '#eab308', won: '#16a34a', lost: '#dc2626' };
  const labels = report?.labels ?? { won: 'Won', lost: 'Lost' };
  const pct = (n: number) => (report?.totalNew ? Math.round((n / report.totalNew) * 100) : 0);

  // Table: one row per day that had new customers (newest first): how many arrived that day, how many from each
  // country (by their WhatsApp number), and how many of them are won now / anything else (Others = Total − Won).
  // Only countries with customers in the range get a column, most customers first.
  const { rows, countryCols, cityCols, labelCols, agentCols, totalOthers } = useMemo(() => {
    if (!report) return { rows: [], countryCols: [], cityCols: [], labelCols: [], agentCols: [], totalOthers: 0 };
    const byDay = new Map<string, { day: string; total: number; won: number; countries: Record<string, number>; stages: Record<string, number>; cities: Record<string, number>; labels: Record<string, number>; agents: Record<string, number> }>();
    // By label: the chat's labels now ('' = none; a customer with two labels counts under both). By agent: the chat's
    // assignee now ('' = unassigned).
    const labelTotals = new Map<string, { key: string; name: string; color: string | null; count: number }>();
    const agentTotals = new Map<string, { key: string; name: string; count: number }>();
    // By city: the City contact property (Customer City in the vehicle form); '' = no city set
    const cityTotals = new Map<string, number>();
    const cols = new Map<string, { key: string; name: string; flag: string | null; count: number }>();
    for (const c of report.customers) {
      const day = dayKey(c.createdAt);
      let row = byDay.get(day);
      if (!row) byDay.set(day, (row = { day, total: 0, won: 0, countries: {}, stages: {}, cities: {}, labels: {}, agents: {} }));
      row.total++;
      if (c.outcome === 'won') row.won++;
      if (c.stage) row.stages[c.stage] = (row.stages[c.stage] ?? 0) + 1;
      const country = contactCountry(null, c.waId);
      const key = country?.name ?? '';
      let col = cols.get(key);
      if (!col) cols.set(key, (col = { key, name: country?.name ?? 'Unknown', flag: country?.flag ?? null, count: 0 }));
      col.count++;
      row.countries[key] = (row.countries[key] ?? 0) + 1;
      // One of the 7 emirates (any case), else "Other Cities"; '' = no city set
      const rawCity = c.city?.trim() ?? '';
      const city = rawCity ? (UAE_CITIES.find((u) => u.toLowerCase() === rawCity.toLowerCase()) ?? OTHER_CITIES) : '';
      row.cities[city] = (row.cities[city] ?? 0) + 1;
      cityTotals.set(city, (cityTotals.get(city) ?? 0) + 1);
      const customerLabels = c.labels.length ? c.labels : [{ id: '', name: 'No label', color: '' }];
      for (const l of customerLabels) {
        row.labels[l.id] = (row.labels[l.id] ?? 0) + 1;
        const t = labelTotals.get(l.id) ?? { key: l.id, name: l.name, color: l.color || null, count: 0 };
        t.count++;
        labelTotals.set(l.id, t);
      }
      const agent = c.agentId ?? '';
      row.agents[agent] = (row.agents[agent] ?? 0) + 1;
      const at = agentTotals.get(agent) ?? { key: agent, name: c.agentName ?? (agent ? 'Unknown' : 'Unassigned'), count: 0 };
      at.count++;
      agentTotals.set(agent, at);
    }
    return {
      rows: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
      // Most customers first; Unknown (a number no country matches) last
      countryCols: [...cols.values()].sort((a, b) => Number(a.key === '') - Number(b.key === '') || b.count - a.count || a.name.localeCompare(b.name)),
      // Always the 7 emirates in that order (0 when none), then Other Cities, then "No city" when some have none
      cityCols: [...UAE_CITIES, OTHER_CITIES, ...(cityTotals.has('') ? [''] : [])].map((key) => ({ key, name: key || 'No city', count: cityTotals.get(key) ?? 0 })),
      // Labels and agents with customers in these dates, most customers first; "No label" / "Unassigned" last
      labelCols: [...labelTotals.values()].sort((a, b) => Number(a.key === '') - Number(b.key === '') || b.count - a.count || a.name.localeCompare(b.name)),
      agentCols: [...agentTotals.values()].sort((a, b) => Number(a.key === '') - Number(b.key === '') || b.count - a.count || a.name.localeCompare(b.name)),
      totalOthers: report.totalNew - report.totalWon,
    };
  }, [report]);
  // The table's columns after Day / Date / Total: by country (then Won and Others), or by lifecycle stage (every
  // stage in Settings order, each in its colour). Both come from the same data, so switching is instant.
  type Row = (typeof rows)[number];
  // sticky: classes that pin the column to the right edge while the middle columns scroll (Won and Others)
  type Col = { key: string; header: React.ReactNode; csv: string; title?: string; cell: (r: Row) => number; total: number; color?: string; divider?: boolean; sticky?: string };
  const wonAndOthers: Col[] = [
    {
      key: 'won',
      header: (
        <>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.won }} />
          {labels.won}
        </>
      ),
      csv: labels.won,
      cell: (r: Row) => r.won,
      total: report?.totalWon ?? 0,
      color: colors.won,
      divider: true,
      sticky: STICKY.won,
    },
    { key: 'others', header: 'Others', csv: 'Others', title: 'Every other lifecycle stage (and no stage): Total minus Won', cell: (r: Row) => r.total - r.won, total: totalOthers, sticky: STICKY.others },
  ];
  const columns: Col[] =
    view === 'label'
      ? [
          ...labelCols.map((col) => ({
            key: `label:${col.key}`,
            header: col.key ? (
              <>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color ?? undefined }} />
                {col.name}
              </>
            ) : (
              <span className="normal-case italic text-faint">No label</span>
            ),
            title: col.key ? undefined : "Customers whose chat has no label",
            csv: col.name,
            cell: (r: Row) => r.labels[col.key] ?? 0,
            total: col.count,
          })),
          ...wonAndOthers,
        ]
      : view === 'agent'
      ? [
          ...agentCols.map((col) => ({
            key: `agent:${col.key}`,
            header: col.key ? col.name : <span className="normal-case italic text-faint">Unassigned</span>,
            title: col.key ? `Chats assigned to ${col.name} now` : 'Chats with no assignee now',
            csv: col.name,
            cell: (r: Row) => r.agents[col.key] ?? 0,
            total: col.count,
          })),
          ...wonAndOthers,
        ]
      : view === 'city'
      ? [
          ...cityCols.map((col) => ({
            key: `city:${col.key}`,
            header: col.key ? col.name : <span className="normal-case italic text-faint">No city</span>,
            title:
              col.key === OTHER_CITIES
                ? 'Customers whose City is outside the 7 UAE emirates'
                : col.key
                  ? undefined
                  : 'Customers with no City set (Customer City in the vehicle form, or the Contact property panel)',
            csv: col.name,
            cell: (r: Row) => r.cities[col.key] ?? 0,
            total: col.count,
          })),
          ...wonAndOthers,
        ]
      : view === 'country'
      ? [
          ...countryCols.map((col) => ({
            key: `c:${col.key}`,
            // The country's flag only; its name on hover (and for screen readers). No flag (unknown country): "Unknown"
            header: col.flag ? (
              <span className="text-base leading-none normal-case" role="img" aria-label={col.name}>
                {col.flag}
              </span>
            ) : (
              col.name
            ),
            title: col.name,
            csv: col.name,
            cell: (r: Row) => r.countries[col.key] ?? 0,
            total: col.count,
          })),
          ...wonAndOthers,
        ]
      : (report?.stages ?? []).map((st) => ({
          key: `s:${st.value}`,
          header: (
            <>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: st.color }} />
              {st.label}
            </>
          ),
          csv: st.label,
          cell: (r: Row) => r.stages[st.value] ?? 0,
          total: st.count,
          color: st.color,
        }));
  const tableCols = 3 + columns.length;
  const cellPad = (i: number) => (i === columns.length - 1 ? 'pl-3 pr-5' : 'px-3');
  // Date column: newest first, or oldest first (click the heading)
  const sortedRows = dateSort === 'desc' ? rows : [...rows].reverse();
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Export CSV: the table as it's shown (this view's columns, every day of the range in the chosen order, all pages)
  // and its Total row
  function exportCsv() {
    if (!report) return;
    const head = ['Day of week', 'Date', 'Total', ...columns.map((c) => c.csv)];
    const lines = [head, ...sortedRows.map((r) => [weekdayName(r.day), r.day, r.total, ...columns.map((c) => c.cell(r))]), ['Total', `${rows.length} days`, report.totalNew, ...columns.map((c) => c.total)]];
    const csv = '\uFEFF' + lines.map((l) => l.map((v) => csvCell(String(v))).join(',')).join('\r\n') + '\r\n'; // BOM: Excel reads UTF-8
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `conversation-report-${view === 'stage' ? 'by-lifecycle-stage' : view === 'country' ? 'by-country' : `by-${view}`}-${range.from}-to-${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="space-y-6">
      {/* Header: title, date range, refresh */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <rect x="7" y="11" width="3" height="6" />
                  <rect x="12" y="7" width="3" height="10" />
                  <rect x="17" y="13" width="3" height="4" />
                </svg>
              </span>
              <h2 className="text-base font-bold text-ink">Conversation Reports</h2>
            </div>
            <p className="mt-1 text-xs text-muted">New customers whose first chat started in the selected dates, and how many of them were won or lost.</p>
          </div>
          {/* One line on wide screens: country, dates, refresh (the description on the left wraps instead) */}
          <div className="flex flex-wrap items-center gap-2.5 xl:shrink-0 xl:flex-nowrap">
            <CountryFilter value={countries} onChange={setCountries} />
            <ReportDateRangePicker
              value={range}
              preset={preset}
              onApply={(r, p) => {
                setRange(r);
                setPreset(p);
              }}
            />
            <button
              type="button"
              disabled={loading}
              onClick={load}
              title={loading ? 'Updating…' : 'Refresh report data'}
              aria-label={loading ? 'Updating report data' : 'Refresh report data'}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-body transition hover:bg-surface-strong disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${loading ? 'animate-spin text-primary' : 'text-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </button>
            {/* The day table below, as shown (current view, every day of the range) */}
            <button
              type="button"
              disabled={!report || rows.length === 0}
              onClick={exportCsv}
              className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition hover:bg-primary-hover disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center justify-between rounded-xl border border-danger-border bg-danger-soft p-3 text-xs text-danger">
          <p>{error}</p>
          <button type="button" onClick={load} className="font-semibold underline hover:no-underline">
            Retry
          </button>
        </div>
      )}
      {report?.truncated && (
        <p className="rounded-xl border border-warning-border bg-warning-soft p-3 text-xs text-warning">
          More than 10,000 new customers in these dates: only the first 10,000 are counted. Choose a shorter range for exact numbers.
        </p>
      )}

      {/* Totals */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Total New Customers"
          value={report?.totalNew}
          color={colors.new}
          note={`${longDay(range.from)} – ${longDay(range.to)}`}
          action={
            <button
              type="button"
              onClick={() => setShowChart((v) => !v)}
              aria-expanded={showChart}
              aria-controls="outcome-chart"
              title={showChart ? 'Hide the graph' : 'Show the graph of new customers, won and lost by day'}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                showChart ? 'border-primary bg-primary text-on-primary hover:bg-primary-hover' : 'border-line bg-surface text-body hover:bg-surface-strong'
              }`}
            >
              {/* Small line-chart icon */}
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 2v12h12" />
                <path d="M4.5 10.5 7 7.5l2 2 4-5" />
              </svg>
              {showChart ? 'Hide graph' : 'Show graph'}
              <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${showChart ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 6 4 4 4-4" />
              </svg>
            </button>
          }
        />
        <Tile label={`Total ${labels.won}`} value={report?.totalWon} color={colors.won} note={`${pct(report?.totalWon ?? 0)}% of new customers`} />
        <Tile label={`Total ${labels.lost}`} value={report?.totalLost} color={colors.lost} note={`${pct(report?.totalLost ?? 0)}% of new customers`} />
        <Tile label="Still in progress" value={report?.totalOpen} note="Neither won nor lost yet" />
      </section>

      {/* Chart: only when opened with Show graph on the Total New Customers card */}
      {showChart && (
        <section id="outcome-chart" className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">New customers, {labels.won.toLowerCase()} and {labels.lost.toLowerCase()}</h3>
            <div className="flex flex-wrap items-center gap-4 text-xs text-body">
              <Legend color={colors.new} label="Total" />
              <Legend color={colors.won} label={labels.won} />
              <Legend color={colors.lost} label={labels.lost} />
            </div>
          </div>
          {report ? (
            <OutcomeChart report={report} from={range.from} to={range.to} labels={labels} />
          ) : (
            <div className="flex h-72 items-center justify-center text-xs text-muted">{error ? 'No data' : 'Loading chart…'}</div>
          )}
        </section>
      )}

      {/* Day-by-day table: new customers per day, by country (with Won and Others) or by lifecycle stage */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-soft px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold text-ink">New customers by day</h3>
            <div role="group" aria-label="Show the table" className="flex rounded-lg border border-line bg-surface-muted p-0.5 text-[11px] font-semibold">
              {(
                [
                  ['stage', 'By lifecycle stage'],
                  ['country', 'By country'],
                  ['city', 'By city'],
                  ['label', 'By label'],
                  ['agent', 'By agent'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 transition ${view === v ? 'bg-surface text-primary shadow-2xs' : 'text-body-soft hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted">
            {view === 'country'
              ? `Country columns count that day's new customers by their number's country; ${labels.won} and Others are where they are now`
              : view === 'city'
                ? `City columns count that day's new customers by their City; ${labels.won} and Others are where they are now`
                : view === 'label'
                  ? `Label columns count that day's new customers by their chat's labels now (a customer with two labels counts under both); ${labels.won} and Others are where they are now`
                  : view === 'agent'
                    ? `Agent columns count that day's new customers by who their chat is assigned to now; ${labels.won} and Others are where they are now`
                : "Each stage column counts that day's new customers who are on that stage now"}
          </p>
        </div>
        <div {...dragScroll} className="max-h-[70vh] cursor-grab overflow-auto">
          {/* Drag with the mouse to scroll the table (sideways and up/down) */}
          {/* border-separate: borders stay with pinned cells while scrolling (collapsed borders don't) */}
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className={`whitespace-nowrap py-3 pl-5 pr-3 ${TH} ${TH_PIN} ${STICKY.day}`}>Day of week</th>
                <th className={`whitespace-nowrap px-3 py-3 ${TH} ${TH_PIN} ${STICKY.date}`} aria-sort={dateSort === 'desc' ? 'descending' : 'ascending'}>
                  <button
                    type="button"
                    onClick={() => {
                      setDateSort((d) => (d === 'desc' ? 'asc' : 'desc'));
                      setPage(1);
                    }}
                    title={dateSort === 'desc' ? 'Newest first: click for oldest first' : 'Oldest first: click for newest first'}
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink"
                  >
                    Date
                    <svg className={`h-3 w-3 transition-transform ${dateSort === 'asc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                  </button>
                </th>
                <th className={`whitespace-nowrap px-3 py-3 text-center ${TH} ${TH_PIN} ${STICKY.total}`}>Total</th>
                {/* By country: countries with new customers in these dates, then Won and Others; by stage: every stage */}
                {columns.map((col, i) => (
                  <th key={col.key} title={col.title} className={`whitespace-nowrap py-3 text-center ${cellPad(i)} ${TH} ${col.divider ? DIVIDER : ''} ${col.sticky ? `${TH_PIN} ${col.sticky}` : ''}`}>
                    <span className="inline-flex items-center gap-1.5">{col.header}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!report && !error && (
                <tr>
                  <td colSpan={tableCols} className="py-12 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {report && rows.length === 0 && (
                <tr>
                  <td colSpan={tableCols} className="py-12 text-center text-muted">
                    <p className="font-semibold text-ink">No new customers</p>
                    <p className="mt-1 text-[11px]">Nobody started a first chat in the selected dates.</p>
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.day} className="group align-middle">
                  <td className={`whitespace-nowrap py-1.5 pl-5 pr-3 font-semibold text-ink ${TD} ${TD_PIN} ${STICKY.day}`}>{weekdayName(r.day)}</td>
                  <td className={`whitespace-nowrap px-3 py-1.5 font-medium text-ink ${TD} ${TD_PIN} ${STICKY.date}`}>{longDay(r.day)}</td>
                  <td className={`px-3 py-1.5 text-center text-sm font-bold text-ink tabular-nums ${TD} ${TD_PIN} ${STICKY.total}`}>{r.total}</td>
                  {columns.map((col, i) => (
                    <td key={col.key} className={`py-1.5 text-center ${cellPad(i)} ${TD} ${col.divider ? DIVIDER : ''} ${col.sticky ? `${TD_PIN} ${col.sticky}` : ''}`}>
                      <Count n={col.cell(r)} color={col.color} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {/* Totals for the whole range */}
            {report && rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} className={`whitespace-nowrap py-3 pl-5 pr-3 text-[11px] font-bold uppercase tracking-wider text-body ${TF} ${TF_PIN} md:left-0`}>
                    Total ({rows.length} {rows.length === 1 ? 'day' : 'days'})
                  </td>
                  <td className={`px-3 py-3 text-center text-sm font-bold text-ink tabular-nums ${TF} ${TF_PIN} ${STICKY.total}`}>{report.totalNew}</td>
                  {columns.map((col, i) => (
                    <td key={col.key} className={`py-3 text-center ${cellPad(i)} ${TF} ${col.divider ? DIVIDER : ''} ${col.sticky ? `${TF_PIN} ${col.sticky}` : ''}`}>
                      <Count n={col.total} color={col.color} />
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-line-soft px-5 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing days <span className="font-medium text-ink">{(currentPage - 1) * PAGE_SIZE + 1}</span> to{' '}
              <span className="font-medium text-ink">{Math.min(currentPage * PAGE_SIZE, rows.length)}</span> of{' '}
              <span className="font-medium text-ink">{rows.length}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-strong disabled:opacity-40">
                Previous
              </button>
              <span className="px-2 text-xs font-medium text-ink">
                {currentPage} / {totalPages}
              </span>
              <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-strong disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// A count in the table: a pill (in the Won stage's colour for Won, neutral otherwise), or a dash for none
// Drag to scroll: hold the mouse button on the table and move it to scroll the box (drag left to see the columns
// on the right, like a map). Mouse only: touch and pens already scroll natively. A press that barely moves is still
// a normal click (the Date heading's sort button keeps working); after a real drag the click is swallowed.
function useDragScroll() {
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = e.currentTarget;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.cursor = 'grabbing';
      e.currentTarget.style.userSelect = 'none';
    }
    e.currentTarget.scrollLeft = d.left - dx;
    e.currentTarget.scrollTop = d.top - dy;
  };
  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.style.cursor = '';
    e.currentTarget.style.userSelect = '';
    if (!d.moved) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // Swallow the click that follows the drag, so letting go over a button doesn't press it
    const el = e.currentTarget;
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    el.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 0);
  };
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}

function Count({ n, color }: { n: number; color?: string }) {
  if (!n) return <span className="text-line-strong">–</span>;
  if (!color)
    return (
      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-surface-muted px-1.5 py-px text-xs font-bold text-ink tabular-nums ring-1 ring-line ring-inset">
        {n}
      </span>
    );
  return (
    <span
      className="inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-px text-xs font-bold tabular-nums"
      style={{ color, backgroundColor: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}55` }}
    >
      {n}
    </span>
  );
}

function Tile({ label, value, color, note, action }: { label: string; value: number | undefined; color?: string; note: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
          <p className="text-[11px] font-medium text-muted">{label}</p>
        </div>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums" style={{ color: color ?? 'var(--color-ink)' }}>
          {value ?? '–'}
        </p>
        <p className="mt-0.5 text-[10px] text-faint">{note}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

// --- Chart

// new: all new customers that bucket (the Total); fresh: those still on the New stage; won / lost: those won or lost now
type Bucket = { key: string; label: string; title: string; new: number; fresh: number; won: number; lost: number };

// By day up to two months, by week up to ~6 months, then by month
function bucketsFor(report: Report, from: string, to: string): Bucket[] {
  const span = daysBetween(from, to);
  const unit: 'day' | 'week' | 'month' = span <= 62 ? 'day' : span <= 186 ? 'week' : 'month';
  const keyOf = (day: string) => {
    if (unit === 'day') return day;
    if (unit === 'month') return day.slice(0, 7);
    const k = addDays(day, -parseYmd(day).getUTCDay()); // week starting Sunday
    return k < from ? from : k;
  };
  const newStage = report.stages.find((s) => s.isDefault);
  const buckets = new Map<string, Bucket>();
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const key = keyOf(day);
    if (buckets.has(key)) continue;
    const [mon] = shortDay(`${key.slice(0, 7)}-01`).split(' ');
    const label = unit === 'month' ? `${mon} ${key.slice(0, 4)}` : `${key.slice(8, 10)} ${shortDay(key).split(' ')[0]}, ${key.slice(0, 4)}`;
    const title =
      unit === 'day'
        ? `${weekdayName(key)}, ${longDay(key)}`
        : unit === 'week'
          ? `Week of ${longDay(key)}`
          : `${shortDay(`${key}-01`).split(' ')[0]} ${key.slice(0, 4)}`;
    buckets.set(key, { key, label, title, new: 0, fresh: 0, won: 0, lost: 0 });
  }
  for (const c of report.customers) {
    const b = buckets.get(keyOf(dayKey(c.createdAt)));
    if (!b) continue;
    b.new++;
    if (newStage && c.stage === newStage.value) b.fresh++;
    if (c.outcome === 'won') b.won++;
    if (c.outcome === 'lost') b.lost++;
  }
  return [...buckets.values()];
}

// Top of the y axis: four equal whole-number steps (1, 2, 3, 4, 5, 6, 8, 10, 20, 25, … per step)
function niceMax(n: number) {
  const raw = Math.max(1, n) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((s) => s >= raw && Number.isInteger(s)) ?? Math.ceil(raw);
  return Math.max(1, step) * 4;
}

// Smooth curve through the points (monotone cubic, so it never dips below 0 or overshoots a day's value)
function smoothPath(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + h * t[i]} ${pts[i + 1].x - h},${pts[i + 1].y - h * t[i + 1]} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

// Area chart: New customers, Won and Lost as smooth filled curves (each in its lifecycle stage colour), a dot on
// every point, and a tooltip with the day's numbers on hover
function OutcomeChart({ report, from, to, labels }: { report: Report; from: string; to: string; labels: { won: string; lost: string } }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const buckets = useMemo(() => bucketsFor(report, from, to), [report, from, to]);
  const height = 320;
  const pad = { top: 14, right: 44, bottom: 34, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...buckets.map((b) => b.new)));
  const steps = Math.min(max, 8); // up to 8 grid lines, whole numbers
  const ticks = Array.from({ length: steps + 1 }, (_, i) => (max / steps) * i).filter((v) => Number.isInteger(v));
  const n = buckets.length;
  const x = (i: number) => (n === 1 ? pad.left + plotW / 2 : pad.left + (plotW * i) / (n - 1));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const base = y(0);
  const labelEvery = Math.max(1, Math.ceil(110 / (n === 1 ? plotW : plotW / (n - 1)))); // keep date labels apart
  // Which points get a date label: every labelEvery-th, and always the last one (dropping the one before it if
  // the two would touch)
  const labelIdx: number[] = [];
  for (let i = 0; i < n; i += labelEvery) labelIdx.push(i);
  if (n > 1 && labelIdx[labelIdx.length - 1] !== n - 1) {
    if (n - 1 - labelIdx[labelIdx.length - 1] < labelEvery * 0.6) labelIdx.pop();
    labelIdx.push(n - 1);
  }
  const showDots = n <= 62;
  // Drawn largest first, so the smaller Won / Lost areas sit on top of New customers
  const series = [
    { key: 'new' as const, color: report.colors.new, label: 'Total' },
    { key: 'won' as const, color: report.colors.won, label: labels.won },
    { key: 'lost' as const, color: report.colors.lost, label: labels.lost },
  ];
  const tip = hover !== null ? buckets[hover] : null;
  const newLabel = report.stages.find((s) => s.isDefault)?.label ?? 'New';

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n === 1 ? 0 : Math.round((px / rect.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label="New, won and lost customers by date" className="block">
        {/* Grid and y axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text x={pad.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-body-soft)">
              {t}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={base} stroke="var(--color-line)" />
        <line x1={pad.left} x2={width - pad.right} y1={base} y2={base} stroke="var(--color-line-strong)" />

        {/* Areas (New customers underneath), then lines and dots with New customers on top, so its line stays visible
            where Won / Lost are 0 along the bottom. Won / Lost dots only where there is something to show. */}
        {series.map((s) => {
          if (!n || buckets.every((b) => b[s.key] === 0)) return null;
          const pts = buckets.map((b, i) => ({ x: x(i), y: y(b[s.key]) }));
          const line = smoothPath(pts);
          return <path key={s.key} d={`${line} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z`} fill={s.color} fillOpacity={0.2} />;
        })}
        {[...series].reverse().map((s) => {
          if (!n || (s.key !== 'new' && buckets.every((b) => b[s.key] === 0))) return null;
          const pts = buckets.map((b, i) => ({ x: x(i), y: y(b[s.key]), v: b[s.key] }));
          return (
            <g key={s.key}>
              <path d={smoothPath(pts)} fill="none" stroke={s.color} strokeWidth={s.key === 'new' ? 2 : 1.5} strokeLinejoin="round" />
              {pts.map((p, i) =>
                (showDots || hover === i) && (s.key === 'new' || p.v > 0) ? (
                  <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3.5} fill={s.color} stroke="var(--color-surface)" strokeWidth={hover === i ? 2 : 0} />
                ) : null,
              )}
            </g>
          );
        })}

        {/* Date labels */}
        {labelIdx.map((i) => (
          <text key={buckets[i].key} x={x(i)} y={height - pad.bottom + 20} textAnchor="middle" fontSize="11" fill="var(--color-body-soft)">
            {buckets[i].label}
          </text>
        ))}

        {/* Hover guide */}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={base} stroke="var(--color-line-strong)" strokeDasharray="3 3" />}
        <rect x={pad.left - 8} y={pad.top} width={plotW + 16} height={plotH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {report.totalNew === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">No new customers in the selected dates</div>
      )}
      {tip && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(hover) - 80, 0), width - 168) }}
        >
          <p className="mb-1 font-semibold text-ink">{tip.title}</p>
          {/* Total = everyone whose first chat was then (the yellow area); New / Won / Lost = where they are now,
              as in the table below */}
          {(
            [
              { key: 'total', label: 'Total', value: tip.new, dot: { backgroundColor: report.colors.new } },
              { key: 'fresh', label: newLabel, value: tip.fresh, dot: { boxShadow: `inset 0 0 0 2px ${report.colors.new}` } },
              { key: 'won', label: labels.won, value: tip.won, dot: { backgroundColor: report.colors.won } },
              { key: 'lost', label: labels.lost, value: tip.lost, dot: { backgroundColor: report.colors.lost } },
            ] as const
          ).map((row) => (
            <p key={row.key} className={`flex items-center justify-between gap-4 ${row.key === 'total' ? 'mb-0.5 border-b border-line-soft pb-1 font-semibold text-ink' : 'text-body'}`}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={row.dot} />
                {row.label}
              </span>
              <span className="font-semibold tabular-nums">{row.value}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// A CSV cell: quoted when needed; a leading =, +, -, @ gets a ' so spreadsheets don't run it as a formula
function csvCell(value: string) {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
