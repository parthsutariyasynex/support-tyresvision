'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type ReportPreset, longDay } from '@/lib/reportRange';
import { type ContactReport as Report, NO_STAGE, dayEndIso, dayStartIso, downloadContactReportCsv, fetchContactReport } from '@/lib/reports';
import { revalidateOnReturn } from '@/lib/revalidate';
import { dayKey, formatTime } from '@/lib/time';
import { CountryFilter } from '../conversation-reports/CountryFilter';
import { ReportDateRangePicker } from '../ReportDateRangePicker';
import { CheckMenu } from './CheckMenu';

const PAGE_SIZE = 25;

// Contact Reports: every customer with their number, name, contacted date (added), status (lifecycle stage), labels
// and vehicles (tyre size 1 and 2, make, model). Filters narrow the list as you change them (typed ones shortly
// after you stop typing). Clicking a customer's name opens their chat.
export function ContactReport() {
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [preset, setPreset] = useState<ReportPreset | undefined>();
  const [countries, setCountries] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [tyreSize, setTyreSize] = useState('');
  const [page, setPage] = useState(1);

  // Typed filters wait until you stop typing
  const [typed, setTyped] = useState({ search: '', model: '', tyreSize: '' });
  useEffect(() => {
    const t = setTimeout(() => setTyped((cur) => (cur.search === search && cur.model === model && cur.tyreSize === tyreSize ? cur : { search, model, tyreSize })), 350);
    return () => clearTimeout(t);
  }, [search, model, tyreSize]);

  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Only the newest load may update the page (filters can change quickly)
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');
    try {
      const next = await fetchContactReport({
        ...typed,
        from: range ? dayStartIso(range.from) : null,
        to: range ? dayEndIso(range.to) : null,
        countries,
        stages,
        labelIds,
        make,
        page,
        pageSize: PAGE_SIZE,
      });
      if (seq === loadSeq.current) setReport(next);
    } catch (err) {
      if (seq === loadSeq.current) setError((err as Error).message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [typed, range, countries, stages, labelIds, make, page]);

  useEffect(() => {
    load();
    return revalidateOnReturn(load);
  }, [load]);

  // Export CSV: the same filters as the list on screen
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    setError('');
    try {
      await downloadContactReportCsv({
        ...typed,
        from: range ? dayStartIso(range.from) : null,
        to: range ? dayEndIso(range.to) : null,
        countries,
        stages,
        labelIds,
        make,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  // A new filter starts again on page 1
  useEffect(() => setPage(1), [typed, range, countries, stages, labelIds, make]);

  const filtered = !!(search || range || countries.length || stages.length || labelIds.length || make || model || tyreSize);
  const clearAll = () => {
    setSearch('');
    setRange(null);
    setPreset(undefined);
    setCountries([]);
    setStages([]);
    setLabelIds([]);
    setMake('');
    setModel('');
    setTyreSize('');
  };

  const total = report?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const contacts = report?.contacts ?? [];
  const stageOptions = [...(report?.stages ?? []), { value: NO_STAGE, label: 'No status', color: null }];
  const labelOptions = (report?.labels ?? []).map((l) => ({ value: l.id, label: l.name, color: l.color }));
  const input = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-faint outline-none focus:border-primary';

  return (
    <div className="space-y-6">
      {/* Header: title, country, contacted dates, refresh */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <h2 className="text-base font-bold text-ink">Contact Reports</h2>
            </div>
            <p className="mt-1 text-xs text-muted">Your customers with their status, labels and vehicles. Click a name to open the chat.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 xl:shrink-0 xl:flex-nowrap">
            <CountryFilter value={countries} onChange={setCountries} />
            <ReportDateRangePicker
              value={range}
              preset={preset}
              emptyLabel="All contacted dates"
              onApply={(r, p) => {
                setRange(r);
                setPreset(p);
              }}
            />
            {range && (
              <button
                type="button"
                onClick={() => {
                  setRange(null);
                  setPreset(undefined);
                }}
                title="Show all contacted dates"
                aria-label="Clear contacted dates"
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:bg-surface-strong"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
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
            {/* Every customer the filters match (not only this page), as a spreadsheet */}
            <button
              type="button"
              disabled={exporting || !report?.total}
              onClick={exportCsv}
              className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition hover:bg-primary-hover disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{exporting ? 'Exporting…' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        {/* One row on wide screens (search a little wider), three per row on laptops, two on tablets */}
        <div className="mt-5 grid grid-cols-1 gap-2.5 border-t border-line-soft pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.5fr_repeat(5,minmax(0,1fr))]">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or number" aria-label="Search customer name or number" maxLength={100} className={`${input} pl-8`} />
          </div>
          <CheckMenu
            label="Status"
            allLabel="All statuses"
            options={stageOptions}
            value={stages}
            onChange={setStages}
            icon={
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            }
          />
          <CheckMenu
            label="Label"
            allLabel="All labels"
            options={labelOptions}
            value={labelIds}
            onChange={setLabelIds}
            icon={
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" />
                <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
              </svg>
            }
          />
          <select value={make} onChange={(e) => setMake(e.target.value)} aria-label="Vehicle make" className={`${input} cursor-pointer ${make ? 'border-primary font-semibold text-primary' : ''}`}>
            <option value="">All makes</option>
            {(report?.makes ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" aria-label="Vehicle model" maxLength={60} className={input} />
          <input value={tyreSize} onChange={(e) => setTyreSize(e.target.value)} placeholder="Tyre size" title="Tyre size 1 or 2, e.g. 265/65R17 or just 265/65" aria-label="Tyre size" maxLength={30} className={input} />
          {filtered && (
            <div className="col-span-full flex justify-end">
              <button type="button" onClick={clearAll} className="text-xs font-semibold text-primary hover:underline">
                Clear all filters
              </button>
            </div>
          )}
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

      {/* Customers */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-5 py-3.5">
          <h3 className="text-sm font-bold text-ink">Customers</h3>
          <p className="text-[11px] text-muted">
            {report ? `${total.toLocaleString()} ${total === 1 ? 'customer' : 'customers'}${filtered ? ' match the filters' : ''}` : 'Loading…'}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-muted/50 text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="whitespace-nowrap py-3 pl-5 pr-3">Customer name</th>
                <th className="whitespace-nowrap px-3 py-3">Customer number</th>
                <th className="whitespace-nowrap px-3 py-3">City</th>
                <th className="whitespace-nowrap px-3 py-3">Contacted date</th>
                <th className="whitespace-nowrap px-3 py-3">Status</th>
                <th className="whitespace-nowrap px-3 py-3">Label</th>
                <th className="whitespace-nowrap px-3 py-3">Tyre size 1</th>
                <th className="whitespace-nowrap px-3 py-3">Tyre size 2</th>
                <th className="whitespace-nowrap px-3 py-3">Make</th>
                <th className="whitespace-nowrap py-3 pl-3 pr-5">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {!report && !error && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {report && contacts.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted">
                    <p className="font-semibold text-ink">No customers found</p>
                    <p className="mt-1 text-[11px]">{filtered ? 'No customer matches these filters.' : 'There are no customers yet.'}</p>
                  </td>
                </tr>
              )}
              {contacts.map((c) => {
                const name = c.name || `+${c.waId}`;
                // One line per vehicle in the vehicle columns (a dash when the customer has none)
                const vehicleCell = (pick: (v: Report['contacts'][number]['vehicles'][number]) => string | null) =>
                  c.vehicles.length ? (
                    <div className="space-y-1">
                      {c.vehicles.map((v, i) => (
                        <p key={i} className="whitespace-nowrap">
                          {pick(v) || <span className="text-line-strong">–</span>}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <span className="text-line-strong">–</span>
                  );
                return (
                  <tr key={c.id} className="align-top transition hover:bg-surface-muted/60">
                    <td className="py-3 pl-5 pr-3">
                      {c.conversationId ? (
                        <Link href={`/inbox?chat=${encodeURIComponent(c.conversationId)}`} title="Open chat" className="font-semibold text-primary hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink" title="This customer has no chat yet">
                          {name}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-body tabular-nums">+{c.waId}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-body">{c.city ?? <span className="text-faint">–</span>}</td>
                    {/* Date and time the customer was added (Dubai time, like the rest of the app) */}
                    <td className="whitespace-nowrap px-3 py-3 text-body">
                      {longDay(dayKey(c.createdAt))}
                      <span className="ml-1.5 text-muted tabular-nums">{formatTime(c.createdAt, 'en-US')}</span>
                    </td>
                    <td className="px-3 py-3">
                      {c.stageLabel ? (
                        <span
                          className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color: c.stageColor ?? undefined, backgroundColor: `${c.stageColor}1a`, boxShadow: `inset 0 0 0 1px ${c.stageColor}55` }}
                        >
                          {c.stageLabel}
                        </span>
                      ) : (
                        <span className="text-line-strong">–</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {c.labels.length ? (
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {c.labels.map((l) => (
                            <span key={l.id} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-body">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                              {l.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-line-strong">–</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium text-ink tabular-nums">{vehicleCell((v) => v.tireSize1)}</td>
                    <td className="px-3 py-3 font-medium text-ink tabular-nums">{vehicleCell((v) => v.tireSize2)}</td>
                    <td className="px-3 py-3 text-body">{vehicleCell((v) => v.make)}</td>
                    <td className="py-3 pl-3 pr-5 text-body">{vehicleCell((v) => [v.model, v.year].filter(Boolean).join(' '))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > PAGE_SIZE && (
          <div className="flex flex-col gap-3 border-t border-line-soft px-5 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing <span className="font-medium text-ink">{(page - 1) * PAGE_SIZE + 1}</span> to{' '}
              <span className="font-medium text-ink">{Math.min(page * PAGE_SIZE, total)}</span> of <span className="font-medium text-ink">{total.toLocaleString()}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-strong disabled:opacity-40">
                Previous
              </button>
              <span className="px-2 text-xs font-medium text-ink">
                {page} / {totalPages}
              </span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-strong disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
