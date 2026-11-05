'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseYmd } from '@/lib/dateRange';
import { type ReportPreset, daysBetween, longDay, reportPresetRange, shortDay, weekdayName } from '@/lib/reportRange';
import { type ConversationReport as Report, dayEndIso, dayStartIso, fetchConversationReport } from '@/lib/reports';
import { revalidateOnReturn } from '@/lib/revalidate';
import { addDays, dayKey } from '@/lib/time';
import { ReportDateRangePicker } from '../ReportDateRangePicker';

const PAGE_SIZE = 20;

// Conversation Reports: new customers in the chosen range (their first chat started then), and of those how many
// are won and lost now. Chart by day (by week or month for long ranges), then a day-by-day table by lifecycle stage.
export function ConversationReport() {
  const [range, setRange] = useState(() => reportPresetRange('monthToDate')!);
  const [preset, setPreset] = useState<ReportPreset>('monthToDate');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReport(await fetchConversationReport({ from: dayStartIso(range.from)!, to: dayEndIso(range.to)! }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
    return revalidateOnReturn(load);
  }, [load]);

  useEffect(() => setPage(1), [range]);

  const colors = report?.colors ?? { new: '#eab308', won: '#16a34a', lost: '#dc2626' };
  const labels = report?.labels ?? { won: 'Won', lost: 'Lost' };
  const stages = report?.stages ?? [];
  const pct = (n: number) => (report?.totalNew ? Math.round((n / report.totalNew) * 100) : 0);

  // Table: one row per day that had new customers (newest first): how many arrived that day, and how many of them
  // are on each lifecycle stage now
  const rows = useMemo(() => {
    if (!report) return [];
    const byDay = new Map<string, { day: string; total: number; stages: Record<string, number> }>();
    for (const c of report.customers) {
      const day = dayKey(c.createdAt);
      let row = byDay.get(day);
      if (!row) byDay.set(day, (row = { day, total: 0, stages: {} }));
      row.total++;
      if (c.stage) row.stages[c.stage] = (row.stages[c.stage] ?? 0) + 1;
    }
    return [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [report]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header: title, date range, refresh */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
          <div className="flex flex-wrap items-center gap-2.5">
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
              title="Refresh report data"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-body transition hover:bg-surface-strong disabled:opacity-50"
            >
              <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary' : 'text-muted'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>{loading ? 'Updating…' : 'Refresh'}</span>
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
        <Tile label="Total New Customers" value={report?.totalNew} color={colors.new} note={`${longDay(range.from)} – ${longDay(range.to)}`} />
        <Tile label={`Total ${labels.won}`} value={report?.totalWon} color={colors.won} note={`${pct(report?.totalWon ?? 0)}% of new customers`} />
        <Tile label={`Total ${labels.lost}`} value={report?.totalLost} color={colors.lost} note={`${pct(report?.totalLost ?? 0)}% of new customers`} />
        <Tile label="Still in progress" value={report?.totalOpen} note="Neither won nor lost yet" />
      </section>

      {/* Chart */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
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

      {/* Day-by-day table: new customers per day and where they are now, by lifecycle stage */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-3.5">
          <h3 className="text-sm font-bold text-ink">New customers by day</h3>
          <p className="text-[11px] text-muted">Each stage column counts that day&apos;s new customers who are on that stage now</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="whitespace-nowrap py-3 pl-5 pr-3">Day of week</th>
                <th className="whitespace-nowrap px-3 py-3">Date</th>
                <th className="whitespace-nowrap px-3 py-3 text-center">Total</th>
                {/* One column per lifecycle stage (Settings → Customer lifecycle) */}
                {stages.map((st, i) => (
                  <th key={st.value} className={`whitespace-nowrap py-3 text-center ${i === stages.length - 1 ? 'pl-3 pr-5' : 'px-3'}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: st.color }} />
                      {st.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {!report && !error && (
                <tr>
                  <td colSpan={3 + stages.length} className="py-12 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {report && rows.length === 0 && (
                <tr>
                  <td colSpan={3 + stages.length} className="py-12 text-center text-muted">
                    <p className="font-semibold text-ink">No new customers</p>
                    <p className="mt-1 text-[11px]">Nobody started a first chat in the selected dates.</p>
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.day} className="align-middle transition hover:bg-surface-muted/60">
                  <td className="whitespace-nowrap py-3 pl-5 pr-3 font-semibold text-ink">{weekdayName(r.day)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-ink">{longDay(r.day)}</td>
                  <td className="px-3 py-3 text-center text-sm font-bold text-ink tabular-nums">{r.total}</td>
                  {stages.map((st, i) => (
                    <td key={st.value} className={`py-3 text-center ${i === stages.length - 1 ? 'pl-3 pr-5' : 'px-3'}`}>
                      <StageCount n={r.stages[st.value] ?? 0} color={st.color} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {/* Totals for the whole range */}
            {report && rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-surface-muted/50">
                  <td colSpan={2} className="py-3 pl-5 pr-3 text-[11px] font-bold uppercase tracking-wider text-body">
                    Total ({rows.length} {rows.length === 1 ? 'day' : 'days'})
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-bold text-ink tabular-nums">{report.totalNew}</td>
                  {stages.map((st, i) => (
                    <td key={st.value} className={`py-3 text-center ${i === stages.length - 1 ? 'pl-3 pr-5' : 'px-3'}`}>
                      <StageCount n={st.count} color={st.color} />
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

// A stage's count in the table: the number in the stage's colour, or a dash for none
function StageCount({ n, color }: { n: number; color: string }) {
  if (!n) return <span className="text-line-strong">–</span>;
  return (
    <span
      className="inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{ color, backgroundColor: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}55` }}
    >
      {n}
    </span>
  );
}

function Tile({ label, value, color, note }: { label: string; value: number | undefined; color?: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <div className="flex items-center gap-1.5">
        {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
        <p className="text-[11px] font-medium text-muted">{label}</p>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums" style={{ color: color ?? 'var(--color-ink)' }}>
        {value ?? '–'}
      </p>
      <p className="mt-0.5 text-[10px] text-faint">{note}</p>
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
