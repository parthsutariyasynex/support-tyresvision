import type { Prisma } from '@prisma/client';
import type { AuthPayload } from '../auth.js';
import { prisma } from '../prisma.js';
import { countryWhere } from './conversationReports.js';
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

export async function contactReport(auth: AuthPayload, filter: ContactReportFilter) {
  await requireAdmin(auth);
  const from = validDate(filter.from, 'from');
  const to = validDate(filter.to, 'to');
  if (from && to && from > to) throw new AppError('"from" must be before "to"', 400, 'BAD_USER_INPUT');
  const pageSize = Math.min(Math.max(Math.trunc(filter.pageSize ?? 25), 1), CONTACT_REPORT_MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(filter.page ?? 1), 1);
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

  const where: Prisma.ContactWhereInput = { workspaceId: auth.workspaceId, deletedAt: null, AND: and };

  const [total, rows, stages, labels, makes] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
      },
    }),
    listLeadStages(auth.workspaceId),
    prisma.label.findMany({ where: { workspaceId: auth.workspaceId, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, color: true } }),
    prisma.vehicle.findMany({
      where: { workspaceId: auth.workspaceId, deletedAt: null, make: { not: null }, contact: { deletedAt: null } },
      distinct: ['make'],
      orderBy: { make: 'asc' },
      select: { make: true },
      take: 500,
    }),
  ]);

  const byStage = new Map(stages.map((s) => [s.value, s]));
  const contacts = rows.map((c) => {
    const stage = c.leadStage ? byStage.get(c.leadStage) : undefined;
    const chat = c.conversations[0];
    return {
      id: c.id,
      conversationId: chat?.id ?? null,
      name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.name || null,
      waId: c.waId,
      createdAt: c.createdAt,
      stage: stage?.value ?? null,
      stageLabel: stage?.label ?? null,
      stageColor: stage?.color ?? null,
      labels: (chat?.labels ?? []).map((l) => l.label).filter((l) => !l.deletedAt).map(({ id, name, color }) => ({ id, name, color })),
      vehicles: c.vehicles,
    };
  });

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
