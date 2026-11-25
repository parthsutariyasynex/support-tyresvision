import type { Prisma } from '@prisma/client';
import type { AuthPayload } from '../auth.js';
import { prisma } from '../prisma.js';
import { dubaiIso } from '../time.js';
import { csvCell } from './assignmentReports.js';
import { countryWhere } from './conversationReports.js';
import { CITY_KEY } from './customerCity.js';
import { AppError } from './errors.js';
import { listLeadStages } from './leadStages.js';
import { requireAdmin } from './permissions.js';

// Contact Reports (sidebar → Reports): every customer (contact, not deleted) with their number, name, when they were
// added (contacted date), lifecycle stage, labels, and vehicles (make, model, tyre size 1 and 2), newest first, one
// page at a time. Every filter narrows the list; empty filters are ignored:
//   search      name or number contains the text
//   from / to   contacted date (when the contact was created)
//   countries   WhatsApp number's country code (ISO codes, e.g. AE), as in Conversation Reports
//   stages      lifecycle stage values; NO_STAGE = contacts without a stage
//   labelIds    the customer's chat has any of these labels
//   make        a vehicle of that make (exact, any case)
//   model       a vehicle whose model contains the text
//   tyreSize    a vehicle whose tyre size 1 or 2 contains the text (e.g. "265/65")
// Owners and admins only; never crosses workspaces.

export const NO_STAGE = '__none';
export const CONTACT_REPORT_MAX_PAGE_SIZE = 100;

export type ContactReportFilter = {
  search?: string | null;
  from?: Date | null;
  to?: Date | null;
  countries?: string[] | null;
  stages?: string[] | null;
  labelIds?: string[] | null;
  make?: string | null;
  model?: string | null;
  tyreSize?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

const text = (s: string | null | undefined, max = 100) => {
  const t = (s ?? '').trim();
  if (t.length > max) throw new AppError('Search text is too long', 400, 'BAD_USER_INPUT');
  return t;
};
const validDate = (d: Date | null | undefined, name: string) => {
  if (d == null) return null;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new AppError(`Invalid ${name} date`, 400, 'BAD_USER_INPUT');
  return d;
};

// The filters as a database query (shared by the page and the CSV export)
function contactWhere(auth: AuthPayload, filter: ContactReportFilter): Prisma.ContactWhereInput {
  const from = validDate(filter.from, 'from');
  const to = validDate(filter.to, 'to');
  if (from && to && from > to) throw new AppError('"from" must be before "to"', 400, 'BAD_USER_INPUT');
  const search = text(filter.search);
  const make = text(filter.make, 60);
  const model = text(filter.model, 60);
  const tyreSize = text(filter.tyreSize, 30);
  if ((filter.stages?.length ?? 0) > 100 || (filter.labelIds?.length ?? 0) > 200) throw new AppError('Too many filters', 400, 'BAD_USER_INPUT');

  const and: Prisma.ContactWhereInput[] = [];
  if (search) {
    const digits = search.replace(/[^\d]/g, '');
    and.push({
      OR: [
        { name: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        ...(digits ? [{ waId: { contains: digits } }] : []),
      ],
    });
  }
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  if (filter.countries?.length) and.push(countryWhere(filter.countries));
  if (filter.stages?.length) {
    const values = filter.stages.filter((s) => s !== NO_STAGE);
    and.push({ OR: [...(values.length ? [{ leadStage: { in: values } }] : []), ...(filter.stages.includes(NO_STAGE) ? [{ leadStage: null }] : [])] });
  }
  if (filter.labelIds?.length) and.push({ conversations: { some: { labels: { some: { labelId: { in: filter.labelIds } } } } } });
  const vehicle: Prisma.VehicleWhereInput[] = [];
  if (make) vehicle.push({ make });
  if (model) vehicle.push({ model: { contains: model } });
  if (tyreSize) vehicle.push({ OR: [{ tireSize1: { contains: tyreSize } }, { tireSize2: { contains: tyreSize } }] });
  if (vehicle.length) and.push({ vehicles: { some: { deletedAt: null, AND: vehicle } } });

  return { workspaceId: auth.workspaceId, deletedAt: null, AND: and };
}

type Stage = Awaited<ReturnType<typeof listLeadStages>>[number];

// One page of customers (newest first), with their stage, the latest chat's labels and their vehicles
async function contactRows(where: Prisma.ContactWhereInput, skip: number, take: number, stages: Stage[]) {
  const rows = await prisma.contact.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip,
    take,
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      waId: true,
      leadStage: true,
      createdAt: true,
      // The customer's chat (the latest one, if somehow more than one): opened from the report, and its labels
      conversations: {
        orderBy: { lastMessageAt: 'desc' },
        take: 1,
        select: { id: true, labels: { select: { label: { select: { id: true, name: true, color: true, deletedAt: true } } } } },
      },
      vehicles: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { make: true, model: true, year: true, tireSize1: true, tireSize2: true },
      },
      // City: the City contact property (Customer City in the vehicle form, services/customerCity.ts)
      customValues: { where: { property: { key: CITY_KEY } }, select: { value: true }, take: 1 },
    },
  });
  const byStage = new Map(stages.map((s) => [s.value, s]));
  return rows.map((c) => {
    const stage = c.leadStage ? byStage.get(c.leadStage) : undefined;
    const chat = c.conversations[0];
    return {
      id: c.id,
      conversationId: chat?.id ?? null,
      name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || null,
      waId: c.waId,
      city: c.customValues[0]?.value ?? null,
      createdAt: c.createdAt,
      stage: stage?.value ?? null,
      stageLabel: stage?.label ?? null,
      stageColor: stage?.color ?? null,
      labels: (chat?.labels ?? []).map((l) => l.label).filter((l) => !l.deletedAt).map(({ id, name, color }) => ({ id, name, color })),
      vehicles: c.vehicles,
    };
  });
}

export async function contactReport(auth: AuthPayload, filter: ContactReportFilter) {
  await requireAdmin(auth);
  const where = contactWhere(auth, filter);
  const pageSize = Math.min(Math.max(Math.trunc(filter.pageSize ?? 25), 1), CONTACT_REPORT_MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(filter.page ?? 1), 1);
  const stages = await listLeadStages(auth.workspaceId);

  const [total, contacts, labels, makes] = await Promise.all([
    prisma.contact.count({ where }),
    contactRows(where, (page - 1) * pageSize, pageSize, stages),
    prisma.label.findMany({ where: { workspaceId: auth.workspaceId, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    prisma.vehicle.findMany({
      where: { workspaceId: auth.workspaceId, deletedAt: null, make: { not: null }, contact: { deletedAt: null } },
      distinct: ['make'],
      orderBy: { make: 'asc' },
      select: { make: true },
      take: 500,
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    contacts,
    // For the filter menus
    stages: stages.map((s) => ({ value: s.value, label: s.label, color: s.color })),
    labels,
    makes: [...new Set(makes.map((m) => m.make!.trim()).filter(Boolean))],
  };
}

// Export CSV: every customer the filters match (not only the page on screen), newest first, one row per customer.
// A customer with several vehicles has them in the same order in each vehicle column, separated by " | ".
export const CONTACT_REPORT_CSV_MAX_ROWS = 50000;
const CONTACT_CSV_COLUMNS = ['Customer name', 'Customer number', 'City', 'Contacted date (Dubai time)', 'Status', 'Labels', 'Tyre size 1', 'Tyre size 2', 'Make', 'Model', 'Year'];

export async function contactReportCsv(auth: AuthPayload, filter: ContactReportFilter) {
  await requireAdmin(auth);
  const where = contactWhere(auth, filter);
  const stages = await listLeadStages(auth.workspaceId);
  const lines = [CONTACT_CSV_COLUMNS.map(csvCell).join(',')];
  const batch = 1000;
  for (let skip = 0; skip < CONTACT_REPORT_CSV_MAX_ROWS; skip += batch) {
    const rows = await contactRows(where, skip, Math.min(batch, CONTACT_REPORT_CSV_MAX_ROWS - skip), stages);
    for (const c of rows) {
      // Empty when no vehicle has it; "—" holds the place of a vehicle without it so the columns still line up
      const v = (pick: (x: (typeof c.vehicles)[number]) => string | number | null | undefined) => {
        const values = c.vehicles.map((x) => (pick(x) ?? '').toString().trim());
        return values.some(Boolean) ? values.map((s) => s || '—').join(' | ') : '';
      };
      lines.push(
        [
          c.name ?? '',
          c.waId, // digits with country code, as in the assignment export (a leading + would make spreadsheets read a formula)
          c.city ?? '',
          dubaiIso(c.createdAt).slice(0, 16).replace('T', ' '),
          c.stageLabel ?? '',
          c.labels.map((l) => l.name).join(', '),
          v((x) => x.tireSize1),
          v((x) => x.tireSize2),
          v((x) => x.make),
          v((x) => x.model),
          v((x) => x.year),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    if (rows.length < batch) break;
  }
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel opens UTF-8 names correctly
}
