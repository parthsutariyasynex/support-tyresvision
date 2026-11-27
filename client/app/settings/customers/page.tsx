'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { type ContactFieldOptions, type ContactProfile, type CustomProperty, countryOptions, fetchContactFieldOptions, fetchCustomProperties, fetchPropertyView, profileName } from '@/lib/contacts';
import { type ContactList, fetchContactLists } from '@/lib/contactLists';
import {
  CUSTOMERS_PAGE_SIZE,
  type CustomerInput,
  type CustomersPage,
  type ImportResult,
  createCustomer,
  deleteCustomer,
  digitsOnly,
  downloadCustomersCsv,
  fetchCustomers,
  importCustomers,
  importTemplate,
  updateCustomer,
} from '@/lib/customers';
import type { ReportPreset } from '@/lib/reportRange';
import { dayEndIso, dayStartIso } from '@/lib/reports';
import { isAdminRole } from '@/lib/roles';
import { formatDateTime } from '@/lib/time';
import { showToast } from '@/lib/toasts';
import { AppShell, type Me } from '../../AppShell';
import { ConfirmDialog } from '../../ConfirmDialog';
import { CheckMenu } from '../../contact-reports/CheckMenu';
import { CountryFilter } from '../../conversation-reports/CountryFilter';
import { ReportDateRangePicker } from '../../ReportDateRangePicker';
import { SettingsShell } from '../SettingsShell';
import { TableSkeleton } from '../Skeleton';

// Settings → Contacts and data → Customers: every customer in a grid (search, country, city and added-date filters),
// with Add, Edit and Delete, and Import / Export as CSV. Adding a customer only saves them: no chat is opened and
// nothing is sent. Every member can add and edit (as in the contact panel); Delete, Import and Export are for
// owners and admins (the server checks).
export default function CustomersSettingsPage() {
  return (
    <AppShell>
      {(me) => (
        <SettingsShell me={me} section="Contacts and data" title="Customers">
          <Customers me={me} />
        </SettingsShell>
      )}
    </AppShell>
  );
}

const CITY_KEY = 'city';
const input =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-surface-muted';
const toolbarButton =
  'flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 text-xs font-semibold text-body shadow-2xs transition hover:bg-surface-strong disabled:opacity-50';

type Editor = { mode: 'add' } | { mode: 'edit'; customer: ContactProfile };

function Customers({ me }: { me: Me }) {
  const router = useRouter();
  const admin = isAdminRole(me.role);
  // Filters (any change goes back to page 1)
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [preset, setPreset] = useState<ReportPreset | undefined>();
  // Added column: newest first (default) or oldest first; sorted on the server, so every page and Export follow it
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  // Data
  const [data, setData] = useState<CustomersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opts, setOpts] = useState<ContactFieldOptions | null>(null);
  const [props, setProps] = useState<CustomProperty[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [labels, setLabels] = useState<{ key: string; name: string }[]>([]);
  // Dialogs
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState<ContactProfile | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // The search waits 300 ms after typing
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchText.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // What the grid, dialog and filters need from the workspace
  useEffect(() => {
    fetchContactFieldOptions().then(setOpts).catch(() => {});
    fetchCustomProperties().then(setProps).catch(() => {});
    fetchContactLists().then(setLists).catch(() => {});
    fetchPropertyView()
      .then((v) => setLabels(v.labels ?? []))
      .catch(() => {});
  }, []);

  const filter = useMemo(
    () => ({ search, countries, cities, from: range ? dayStartIso(range.from) : null, to: range ? dayEndIso(range.to) : null, sort }),
    [search, countries, cities, range, sort],
  );
  // Only the newest request may update the grid (filters can change faster than the server answers)
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    fetchCustomers({ ...filter, page, pageSize: CUSTOMERS_PAGE_SIZE })
      .then((r) => {
        if (mine !== seq.current) return;
        setData(r);
        setError('');
      })
      .catch((e) => mine === seq.current && setError((e as Error).message))
      .finally(() => mine === seq.current && setLoading(false));
  }, [filter, page, reload]);

  const refresh = useCallback((toFirstPage = false) => {
    if (toFirstPage) setPage(1);
    setReload((n) => n + 1);
  }, []);

  const cityProp = props.find((p) => p.key === CITY_KEY) ?? null;
  const otherProps = props.filter((p) => p.key !== CITY_KEY);
  const stageOf = (v: string | null) => (v ? opts?.leadStages.find((s) => s.value === v) : undefined);
  const valueOf = (c: ContactProfile, p: CustomProperty) => {
    const v = c.customValues?.find((x) => x.propertyId === p.id)?.value ?? '';
    if (!v) return '';
    if (p.type === 'boolean') return v === 'true' ? 'Yes' : 'No';
    if (p.type === 'datetime') return v.replace('T', ' ');
    return v;
  };
  const filtered = !!(search || countries.length || cities.length || range);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE));

  async function exportCsv() {
    setExporting(true);
    setError('');
    try {
      await downloadCustomersCsv(filter);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteCustomer(deleting.id);
      showToast(`customer:${Date.now()}`, '', `${profileName(deleting)} deleted`, 'Customers');
      setDeleting(null);
      // The last one on a page: go back a page
      if (data && data.customers.length === 1 && page > 1) setPage(page - 1);
      else refresh();
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const colCount = 7 + (cityProp ? 1 : 0) + otherProps.length;

  return (
    <div className="w-full">
      {/* Top bar: search and filters on the left, Import / Export / Add on the right (wraps on narrow screens) */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-72">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search name, number, email or company"
            aria-label="Search name, number, email or company"
            maxLength={100}
            className={`${input} h-[34px] py-0 pl-8 text-xs`}
          />
        </div>
        <CountryFilter
          value={countries}
          onChange={(v) => {
            setCountries(v);
            setPage(1);
          }}
        />
        {cityProp && (
          <CheckMenu
            label="City"
            allLabel="All cities"
            options={cityProp.options.map((o) => ({ value: o, label: o }))}
            value={cities}
            onChange={(v) => {
              setCities(v);
              setPage(1);
            }}
            icon={
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            }
          />
        )}
        <ReportDateRangePicker
          value={range}
          preset={preset}
          emptyLabel="All dates"
          onApply={(r, p) => {
            setRange(r);
            setPreset(p);
            setPage(1);
          }}
        />
        {range && (
          <button
            type="button"
            onClick={() => {
              setRange(null);
              setPreset(undefined);
              setPage(1);
            }}
            title="Show all dates"
            aria-label="Clear the added dates"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted transition hover:bg-surface-strong"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {admin && (
            <>
              <button type="button" onClick={() => setImporting(true)} className={toolbarButton}>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Import
              </button>
              <button
                type="button"
                onClick={exportCsv}
                disabled={exporting || !total}
                aria-busy={exporting}
                title={exporting ? 'Exporting…' : 'Every customer these filters match, as a CSV file'}
                className={toolbarButton}
              >
                {/* Same size while exporting (the icon spins; the text stays), so the buttons don't move */}
                {exporting ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                Export
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setEditor({ mode: 'add' })}
            className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary shadow-2xs transition hover:bg-primary-hover"
          >
            + Add customer
          </button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {/* The grid */}
      {!data && loading ? (
        <TableSkeleton rows={8} />
      ) : (
        <div className={`mt-5 overflow-x-auto rounded-xl border border-line bg-surface transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-left text-[13px]" aria-label="Customers">
            <thead>
              <tr className="border-b border-line bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="whitespace-nowrap px-3 py-2.5">Name</th>
                <th className="whitespace-nowrap px-3 py-2.5">Phone number</th>
                <th className="whitespace-nowrap px-3 py-2.5">{labelOf(labels, 'email', 'Email')}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{labelOf(labels, 'leadStage', 'Lead stage')}</th>
                {cityProp && <th className="whitespace-nowrap px-3 py-2.5">{cityProp.name}</th>}
                <th className="whitespace-nowrap px-3 py-2.5">{labelOf(labels, 'country', 'Country')}</th>
                {otherProps.map((p) => (
                  <th key={p.id} className="whitespace-nowrap px-3 py-2.5">
                    {p.name}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2.5" aria-sort={sort === 'newest' ? 'descending' : 'ascending'}>
                  <button
                    type="button"
                    onClick={() => {
                      setSort((s) => (s === 'newest' ? 'oldest' : 'newest'));
                      setPage(1);
                    }}
                    title={sort === 'newest' ? 'Newest first: click for oldest first' : 'Oldest first: click for newest first'}
                    className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink"
                  >
                    Added
                    <svg className={`h-3 w-3 transition-transform ${sort === 'oldest' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14M19 12l-7 7-7-7" />
                    </svg>
                  </button>
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data && data.customers.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-[13px] text-muted">
                    {filtered ? 'No customer matches these filters.' : 'No customers yet. Add one, or they appear when they message you.'}
                  </td>
                </tr>
              )}
              {data?.customers.map((c) => {
                const stage = stageOf(c.leadStage);
                return (
                  <tr key={c.id} className="align-middle transition hover:bg-surface-muted/60">
                    <td className="max-w-[220px] px-3 py-2.5">
                      <Link href={`/contacts/${c.id}`} className="block truncate font-semibold text-ink hover:text-primary hover:underline" title={profileName(c)}>
                        {profileName(c)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-body">+{c.waId}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-body" title={c.email ?? undefined}>
                      {c.email ?? ''}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {c.leadStage && (
                        <span className="inline-flex items-center gap-1.5 text-body">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage?.color ?? 'var(--color-faint)' }} />
                          {stage?.label ?? c.leadStage}
                        </span>
                      )}
                    </td>
                    {cityProp && <td className="whitespace-nowrap px-3 py-2.5 text-body">{valueOf(c, cityProp)}</td>}
                    <td className="whitespace-nowrap px-3 py-2.5 text-body">{c.country ?? c.phoneCountry ?? ''}</td>
                    {otherProps.map((p) => {
                      const v = valueOf(c, p);
                      return (
                        <td key={p.id} className="max-w-[220px] truncate px-3 py-2.5 text-body" title={v || undefined}>
                          {v}
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap px-3 py-2.5 text-body-soft">{formatDateTime(c.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-3 text-[12px] font-semibold">
                        <button type="button" onClick={() => setEditor({ mode: 'edit', customer: c })} className="text-primary hover:underline">
                          Edit
                        </button>
                        {c.conversationId && (
                          <button type="button" onClick={() => router.push(`/inbox?chat=${encodeURIComponent(c.conversationId!)}`)} className="text-body hover:text-ink hover:underline">
                            Open chat
                          </button>
                        )}
                        {admin && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError('');
                              setDeleting(c);
                            }}
                            className="text-danger hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Count and pages */}
      {data && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p>
            {total} {total === 1 ? 'customer' : 'customers'}
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="px-2 font-medium text-ink">
                Page {Math.min(page, pages)} of {pages}
              </span>
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-strong disabled:opacity-40">
                Previous
              </button>
              <button type="button" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-body hover:bg-surface-strong disabled:opacity-40">
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {editor && (
        <CustomerDialog
          editor={editor}
          opts={opts}
          props={props}
          lists={lists}
          labels={labels}
          onClose={() => setEditor(null)}
          onSaved={(c, added) => {
            setEditor(null);
            showToast(`customer:${Date.now()}`, '', added ? `${profileName(c)} added` : `${profileName(c)} saved`, 'Customers');
            refresh(added);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete customer?"
          body={`${profileName(deleting)} (+${deleting.waId}) will be deleted for good, with their chat and messages. This can't be undone.`}
          yes={deleteBusy ? 'Deleting…' : 'Delete'}
          no="Cancel"
          danger
          busy={deleteBusy}
          error={deleteError}
          onYes={confirmDelete}
          onNo={() => setDeleting(null)}
        />
      )}
      {importing && (
        <ImportDialog
          propertyNames={props.map((p) => p.name)}
          onClose={() => setImporting(false)}
          onImported={(r) => {
            if (r.added) refresh(true);
            fetchContactLists().then(setLists).catch(() => {}); // Import can add lists
          }}
        />
      )}
    </div>
  );
}

// A standard field's name, as the workspace renamed it in Settings → Contact properties
function labelOf(labels: { key: string; name: string }[], key: string, fallback: string) {
  return labels.find((l) => l.key === key)?.name || fallback;
}

// --- Add / Edit dialog

const STANDARD = ['firstName', 'lastName', 'email', 'companyName', 'jobTitle', 'leadStage', 'leadSource', 'priority', 'country'] as const;
type Standard = (typeof STANDARD)[number];
const MAX: Partial<Record<Standard, number>> = { firstName: 100, lastName: 100, email: 191, companyName: 150, jobTitle: 100 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CustomerDialog({
  editor,
  opts,
  props,
  lists,
  labels,
  onClose,
  onSaved,
}: {
  editor: Editor;
  opts: ContactFieldOptions | null;
  props: CustomProperty[];
  lists: ContactList[];
  labels: { key: string; name: string }[];
  onClose: () => void;
  onSaved: (c: ContactProfile, added: boolean) => void;
}) {
  const adding = editor.mode === 'add';
  const c = editor.mode === 'edit' ? editor.customer : null;
  const titleId = useId();
  const defaultStage = opts?.leadStages.find((s) => s.isDefault)?.value ?? '';
  const [waId, setWaId] = useState('');
  const [fields, setFields] = useState<Record<Standard, string>>(() => ({
    firstName: c?.firstName ?? '',
    lastName: c?.lastName ?? '',
    email: c?.email ?? '',
    companyName: c?.companyName ?? '',
    jobTitle: c?.jobTitle ?? '',
    leadStage: c ? (c.leadStage ?? '') : defaultStage,
    leadSource: c?.leadSource ?? '',
    priority: c?.priority ?? '',
    country: c?.country ?? '',
  }));
  const [subscribed, setSubscribed] = useState(c ? c.subscribed : true);
  const [custom, setCustom] = useState<Record<string, string>>(() => Object.fromEntries((c?.customValues ?? []).map((v) => [v.propertyId, v.value])));
  const [listIds, setListIds] = useState<string[]>(() => (c?.lists ?? []).map((l) => l.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The field options can arrive after the dialog opened: a new customer then still starts on the default stage
  const stageTouched = useRef(false);
  useEffect(() => {
    if (adding && !stageTouched.current && defaultStage) setFields((f) => (f.leadStage ? f : { ...f, leadStage: defaultStage }));
  }, [adding, defaultStage]);

  // Escape closes (not while saving)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = (k: Standard, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const label = (k: string, fallback: string) => labelOf(labels, k, fallback);
  const countries = useMemo(() => countryOptions().slice(1), []);
  const stage = opts?.leadStages.find((s) => s.value === fields.leadStage);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const digits = digitsOnly(waId);
    if (adding && !digits) return setError('Enter the WhatsApp number');
    if (adding && (digits.length < 8 || digits.length > 15)) return setError('Enter the WhatsApp number with its country code (8 to 15 digits, e.g. 971501234567)');
    if (fields.email.trim() && !EMAIL_RE.test(fields.email.trim())) return setError('Enter a valid email address');
    const values: CustomerInput = { subscribed };
    for (const k of STANDARD) {
      const v = fields[k].trim();
      // Adding: only what's filled in (Lead stage always, so "Not set" stays not set). Editing: everything, '' clears.
      if (!adding || v || k === 'leadStage') values[k] = v;
    }
    values.customValues = props.map((p) => ({ propertyId: p.id, value: (custom[p.id] ?? '').trim() })).filter((v) => !adding || v.value);
    values.listIds = listIds;
    setBusy(true);
    try {
      const saved = adding ? await createCustomer({ ...values, waId: digits }) : await updateCustomer(c!.id, values);
      onSaved(saved, adding);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const text = (k: Standard, fallback: string, type = 'text') => (
    <Field label={label(k, fallback)}>
      <input type={type} value={fields[k]} maxLength={MAX[k]} onChange={(e) => set(k, e.target.value)} disabled={busy} className={input} />
    </Field>
  );
  const select = (k: Standard, fallback: string, options: { value: string; label: string }[]) => (
    <Field label={label(k, fallback)}>
      <select value={fields[k]} onChange={(e) => set(k, e.target.value)} disabled={busy} className={`${input} cursor-pointer`}>
        <option value="">– Not set</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {/* A value that's no longer a choice stays visible until it's changed */}
        {fields[k] && !options.some((o) => o.value === fields[k]) && <option value={fields[k]}>{fields[k]}</option>}
      </select>
    </Field>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-shadow/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={save} className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <h2 id={titleId} className="text-base font-bold text-ink">
            {adding ? 'Add customer' : `Edit ${profileName(c!)}`}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-body-soft hover:bg-surface-muted">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="WhatsApp number" required={adding} group={!adding}>
                {adding ? (
                  <>
                    <input
                      value={waId}
                      onChange={(e) => setWaId(e.target.value)}
                      disabled={busy}
                      inputMode="tel"
                      autoFocus
                      maxLength={25}
                      placeholder="971501234567"
                      className={`${input} font-mono`}
                    />
                    <p className="mt-1 text-[11px] text-muted">No chat is opened and nothing is sent. The number can&apos;t be changed later.</p>
                  </>
                ) : (
                  <p className="py-2 font-mono text-[13px] text-body">+{c!.waId} <span className="font-sans text-muted">(can&apos;t be changed)</span></p>
                )}
              </Field>
            </div>
            {text('firstName', 'First name')}
            {text('lastName', 'Last name')}
            {text('email', 'Email', 'email')}
            {text('companyName', 'Company name')}
            {text('jobTitle', 'Job title')}
            <Field label={label('leadStage', 'Lead stage')}>
              <div className="relative">
                {stage?.color && <span className="pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ backgroundColor: stage.color }} />}
                <select
                  value={fields.leadStage}
                  onChange={(e) => {
                    stageTouched.current = true;
                    set('leadStage', e.target.value);
                  }}
                  disabled={busy}
                  className={`${input} cursor-pointer ${stage?.color ? 'pl-7' : ''}`}
                >
                  <option value="">– Not set</option>
                  {(opts?.leadStages ?? []).map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            {select('leadSource', 'Lead source', opts?.leadSources ?? [])}
            {select('priority', 'Priority', opts?.priorities ?? [])}
            <Field label={label('country', 'Country')}>
              <select value={fields.country} onChange={(e) => set('country', e.target.value)} disabled={busy} className={`${input} cursor-pointer`}>
                <option value="">{c?.phoneCountry ? `– Not set (number: ${c.phoneCountry})` : '– Not set'}</option>
                {countries.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
                {fields.country && !countries.some((o) => o.value === fields.country) && <option value={fields.country}>{fields.country}</option>}
              </select>
            </Field>
            <Field label={label('subscribed', 'Subscriber')}>
              <select value={String(subscribed)} onChange={(e) => setSubscribed(e.target.value === 'true')} disabled={busy} className={`${input} cursor-pointer`}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>

            {/* Custom properties (Settings → Contact properties), each with the input its type needs */}
            {props.map((p) => (
              <div key={p.id} className={p.type === 'multiline' ? 'sm:col-span-2' : ''}>
                <Field label={p.name}>
                  <CustomInput prop={p} value={custom[p.id] ?? ''} disabled={busy} onChange={(v) => setCustom((m) => ({ ...m, [p.id]: v }))} />
                </Field>
              </div>
            ))}

            {lists.length > 0 && (
              <div className="sm:col-span-2">
                <Field label="Lists" group>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {lists.map((l) => {
                      const on = listIds.includes(l.id);
                      return (
                        <label
                          key={l.id}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition ${
                            on ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-body hover:bg-surface-muted'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy}
                            onChange={() => setListIds((ids) => (on ? ids.filter((x) => x !== l.id) : [...ids, l.id]))}
                            className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                          />
                          {l.name}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </div>
            )}
          </div>
          {c && <p className="mt-4 text-[11px] text-muted">Added {formatDateTime(c.createdAt)}</p>}
        </div>

        <div className="border-t border-line-soft px-6 py-4">
          {error && <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-body hover:bg-surface-strong disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
              {busy ? 'Saving…' : adding ? 'Add customer' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// group: several inputs (the Lists chips, the read-only number), so not one <label>
function Field({ label, required, group, children }: { label: string; required?: boolean; group?: boolean; children: React.ReactNode }) {
  const title = (
    <span className="mb-1 block text-[12px] font-semibold text-ink">
      {label}
      {required && <span className="text-danger"> *</span>}
    </span>
  );
  return group ? (
    <div role="group" aria-label={label}>
      {title}
      {children}
    </div>
  ) : (
    <label className="block">
      {title}
      {children}
    </label>
  );
}

// The right input for a custom property's type; dropdowns have "– Not set"
function CustomInput({ prop, value, disabled, onChange }: { prop: CustomProperty; value: string; disabled: boolean; onChange: (v: string) => void }) {
  if (prop.type === 'options' || prop.type === 'boolean') {
    const options = prop.type === 'boolean' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] : prop.options.map((o) => ({ value: o, label: o }));
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`${input} cursor-pointer`}>
        <option value="">– Not set</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {value && !options.some((o) => o.value === value) && <option value={value}>{value}</option>}
      </select>
    );
  }
  if (prop.type === 'multiline') return <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={3} maxLength={5000} className={`${input} resize-y`} />;
  const type = ({ number: 'number', date: 'date', datetime: 'datetime-local', url: 'url', email: 'email' } as Record<string, string>)[prop.type] ?? 'text';
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={type === 'text' || type === 'url' ? 500 : undefined} className={input} />;
}

// --- Import (owners and admins): a CSV file, first row = the column headings

function ImportDialog({ propertyNames, onClose, onImported }: { propertyNames: string[]; onClose: () => void; onImported: (r: ImportResult) => void }) {
  const titleId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([importTemplate(propertyNames)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customers-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function run() {
    if (!file) return setError('Choose a CSV file');
    if (file.size > 5_000_000) return setError('The file is too big (max 5 MB)');
    setBusy(true);
    setError('');
    try {
      const r = await importCustomers(await file.text());
      setResult(r);
      onImported(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-shadow/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <h2 id={titleId} className="text-base font-bold text-ink">
            Import customers
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-body-soft hover:bg-surface-muted">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-6 py-5 text-[13px] text-body">
          <p>
            A CSV file with one customer per row. The first row has the column headings; <span className="font-semibold text-ink">WhatsApp number</span> is required (with the country
            code). Numbers that are already customers are skipped. No chat is opened and nothing is sent.
          </p>
          <p className="text-[12px] text-muted">
            Lead stage, source and priority by their names; Subscriber Yes or No; Lists by name, separated by &quot;;&quot;. The Export file works too.
          </p>
          <button type="button" onClick={downloadTemplate} className="text-[12px] font-semibold text-primary hover:underline">
            Download the template
          </button>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError('');
            }}
            className="block w-full text-[12px] text-body file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface-muted file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink"
          />
          {result && (
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-[12px]">
              <p className="font-semibold text-ink">
                {result.added} added · {result.skipped} already customers · {result.failed} couldn&apos;t be added
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto text-danger">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="border-t border-line-soft px-6 py-4">
          {error && <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-body hover:bg-surface-strong disabled:opacity-50">
              {result ? 'Close' : 'Cancel'}
            </button>
            <button type="button" onClick={run} disabled={busy || !file} className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60">
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
