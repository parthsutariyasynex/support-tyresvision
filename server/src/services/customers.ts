import type { Prisma } from '@prisma/client';
import type { AuthPayload } from '../auth.js';
import { prisma } from '../prisma.js';
import { emitToWorkspace } from '../realtime.js';
import { dubaiIso } from '../time.js';
import { csvCell } from './assignmentReports.js';
import { addContactToList, listsOfContact, removeContactFromList } from './contactLists.js';
import { type ContactUpdate, phoneCountry, requireContact, updateContact, updateSchema } from './contacts.js';
import { countryWhere } from './conversationReports.js';
import { CITY_KEY } from './customerCity.js';
import { normalizeValue, setCustomValue } from './customProperties.js';
import { AppError } from './errors.js';
import { choicesOf, requireChoice } from './fieldChoices.js';
import { isWhatsAppNumber } from './inbox.js';
import { defaultStageValue, listLeadStages, requireStageValue } from './leadStages.js';
import { getPermissions, requireAdmin } from './permissions.js';
import { parse } from './validate.js';

// Settings → Contacts and data → Customers: every customer (contact, not deleted) in a grid, with Add, Edit, Delete,
// Import and Export. Adding a customer only saves them: no chat is opened and nothing is sent to WhatsApp (their
// chat starts when they message, or when someone starts one from the Inbox). Every member can list, add and edit,
// as in the contact panel; Delete, Import and Export are for owners and admins.

export const CUSTOMERS_PAGE_SIZE = 25;
export const CUSTOMERS_MAX_PAGE_SIZE = 100;

export type CustomerFilter = {
  search?: string | null;
  countries?: string[] | null;
  cities?: string[] | null;
  from?: Date | null;
  to?: Date | null;
  // Added date: 'newest' (default) or 'oldest' first
  sort?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

const bad = (message: string) => new AppError(message, 400, 'BAD_USER_INPUT');

// The filters as a database query (the grid and the export)
async function customerWhere(auth: AuthPayload, f: CustomerFilter): Promise<Prisma.ContactWhereInput> {
  const search = (f.search ?? '').trim();
  if (search.length > 100) throw bad('Search text is too long');
  for (const [d, name] of [[f.from, 'from'], [f.to, 'to']] as const)
    if (d != null && (!(d instanceof Date) || Number.isNaN(d.getTime()))) throw bad(`Invalid ${name} date`);
  if (f.from && f.to && f.from > f.to) throw bad('"from" must be before "to"');
  if ((f.cities?.length ?? 0) > 200) throw bad('Too many cities');

  const and: Prisma.ContactWhereInput[] = [];
  if (search) {
    const digits = search.replace(/\D/g, '');
    and.push({
      OR: [
        { name: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { companyName: { contains: search } },
        // "Shivam Patel": first and last name together
        ...(search.includes(' ') ? [{ AND: search.split(/\s+/).map((w) => ({ OR: [{ firstName: { contains: w } }, { lastName: { contains: w } }, { name: { contains: w } }] })) }] : []),
        ...(digits.length >= 3 ? [{ waId: { contains: digits } }] : []),
      ],
    });
  }
  if (f.countries?.length) and.push(countryWhere(f.countries));
  if (f.cities?.length) and.push({ customValues: { some: { property: { key: CITY_KEY }, value: { in: f.cities } } } });
  if (f.from || f.to) and.push({ createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } });
  return { workspaceId: auth.workspaceId, deletedAt: null, AND: and };
}

// Added date order (then id, so equal times keep a fixed order)
const orderOf = (sort: string | null | undefined): Prisma.ContactOrderByWithRelationInput[] => {
  const dir = sort === 'oldest' ? 'asc' : 'desc';
  return [{ createdAt: dir }, { id: dir }];
};

// One page, newest first (or oldest first)
export async function listCustomers(auth: AuthPayload, f: CustomerFilter) {
  await getPermissions(auth);
  const where = await customerWhere(auth, f);
  const pageSize = Math.min(Math.max(Math.trunc(f.pageSize ?? CUSTOMERS_PAGE_SIZE), 1), CUSTOMERS_MAX_PAGE_SIZE);
  const page = Math.max(Math.trunc(f.page ?? 1), 1);
  const [total, customers] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({ where, orderBy: orderOf(f.sort), skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, page, pageSize, customers };
}

// --- Add and Edit

// "+971 50 123 4567" → 971501234567; must be a real WhatsApp-able number with its country code
export function cleanWaId(raw: unknown) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) throw bad('Enter the WhatsApp number');
  if (digits.length < 8 || digits.length > 15) throw bad('Enter the WhatsApp number with its country code (8 to 15 digits, e.g. 971501234567)');
  if (!isWhatsAppNumber(digits)) throw bad(`+${digits} is not a valid WhatsApp number. Check the country code and the number.`);
  return digits;
}

export type CustomerInput = ContactUpdate & {
  waId?: string | null;
  customValues?: { propertyId: string; value: string | null }[] | null;
  listIds?: string[] | null;
};

const FIELD_KEYS = ['firstName', 'lastName', 'email', 'companyName', 'jobTitle', 'leadStage', 'leadSource', 'priority', 'country', 'subscribed'] as const;
const fieldsOf = (input: CustomerInput) => Object.fromEntries(FIELD_KEYS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]])) as ContactUpdate;

// Every custom value checked before anything is saved: [propertyId, value or null to clear]
async function checkCustomValues(workspaceId: string, values: CustomerInput['customValues']) {
  if (!values?.length) return [];
  if (values.length > 200) throw bad('Too many properties');
  const props = await prisma.contactCustomProperty.findMany({ where: { workspaceId }, select: { id: true, name: true, type: true, options: true } });
  return values.map((v) => {
    const p = props.find((x) => x.id === v.propertyId);
    if (!p) throw bad('That property no longer exists. Reload the page.');
    let options: string[] = [];
    try {
      options = JSON.parse(p.options ?? '[]');
    } catch {
      // no options
    }
    try {
      return { propertyId: p.id, value: normalizeValue(p.type, options, v.value ?? '') };
    } catch (err) {
      throw bad(`${p.name}: ${(err as Error).message}`);
    }
  });
}

async function checkLists(workspaceId: string, ids: CustomerInput['listIds']) {
  if (ids == null) return null; // unchanged
  const unique = [...new Set(ids)];
  if (unique.length > 200) throw bad('Too many lists');
  const found = await prisma.contactList.count({ where: { workspaceId, id: { in: unique } } });
  if (found !== unique.length) throw bad('A list no longer exists. Reload the page.');
  return unique;
}

async function checkChoices(workspaceId: string, data: ContactUpdate) {
  if (data.leadStage) await requireStageValue(workspaceId, data.leadStage);
  if (data.leadSource) await requireChoice(workspaceId, 'leadSource', data.leadSource, 'lead source');
  if (data.priority) await requireChoice(workspaceId, 'priority', data.priority, 'priority');
}

// Add: saves only the customer. A number that's already a customer is refused (409); one deleted earlier comes back
// with the details entered.
export async function createCustomer(auth: AuthPayload, input: CustomerInput) {
  await getPermissions(auth);
  const workspaceId = auth.workspaceId;
  const waId = cleanWaId(input.waId);
  const data = parse(updateSchema, fieldsOf(input));
  await checkChoices(workspaceId, data);
  const custom = await checkCustomValues(workspaceId, input.customValues);
  const listIds = (await checkLists(workspaceId, input.listIds)) ?? [];

  const key = { workspaceId_waId: { workspaceId, waId } };
  const existing = await prisma.contact.findUnique({ where: key, select: { id: true, deletedAt: true } });
  if (existing && !existing.deletedAt) throw new AppError('This number is already a customer', 409, 'DUPLICATE');

  const fields = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const values = {
    ...fields,
    // New customers start on the workspace's default stage unless one was chosen ("Not set" = none)
    leadStage: data.leadStage !== undefined ? data.leadStage : await defaultStageValue(workspaceId),
    subscribed: data.subscribed ?? true,
    updatedBy: auth.userId,
  };
  const contact = await prisma.$transaction(async (tx) => {
    let row;
    if (existing) {
      // Brought back: the details entered replace the old ones, with its custom values and lists
      await tx.contactCustomValue.deleteMany({ where: { contactId: existing.id } });
      await tx.contactListMember.deleteMany({ where: { contactId: existing.id } });
      row = await tx.contact.update({
        where: { id: existing.id },
        data: { firstName: null, lastName: null, email: null, companyName: null, jobTitle: null, leadSource: null, priority: null, country: null, ...values, deletedAt: null, deletedBy: null },
      });
    } else {
      try {
        row = await tx.contact.create({ data: { workspaceId, waId, ...values, createdBy: auth.userId } });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') throw new AppError('This number is already a customer', 409, 'DUPLICATE');
        throw err;
      }
    }
    const set = custom.filter((c): c is { propertyId: string; value: string } => c.value !== null);
    if (set.length) await tx.contactCustomValue.createMany({ data: set.map((c) => ({ contactId: row.id, propertyId: c.propertyId, value: c.value, updatedBy: auth.userId })) });
    if (listIds.length) await tx.contactListMember.createMany({ data: listIds.map((listId) => ({ listId, contactId: row.id, addedById: auth.userId })) });
    return row;
  });
  if (existing) {
    const conversation = await prisma.conversation.findFirst({ where: { workspaceId, contactId: contact.id }, select: { id: true } });
    emitToWorkspace(workspaceId, 'contact:restored', { contactId: contact.id, conversationId: conversation?.id ?? null });
  }
  emitToWorkspace(workspaceId, 'contact:updated', { ...contact, customValues: await prisma.contactCustomValue.findMany({ where: { contactId: contact.id }, select: { propertyId: true, value: true } }) });
  return contact;
}

// Edit: the number can't change. Only what changed is saved (and logged in the customer's activity, as from the panel).
export async function updateCustomer(auth: AuthPayload, id: string, input: CustomerInput) {
  await getPermissions(auth);
  const workspaceId = auth.workspaceId;
  await requireContact(workspaceId, id);
  // Everything checked first, so a bad value saves nothing
  const data = parse(updateSchema, fieldsOf(input));
  await checkChoices(workspaceId, data);
  const custom = await checkCustomValues(workspaceId, input.customValues);
  const listIds = await checkLists(workspaceId, input.listIds);

  await updateContact(auth, id, data);
  if (custom.length) {
    const now = await prisma.contactCustomValue.findMany({ where: { contactId: id }, select: { propertyId: true, value: true } });
    for (const c of custom) {
      const before = now.find((v) => v.propertyId === c.propertyId)?.value ?? null;
      if (before !== c.value) await setCustomValue(auth, id, c.propertyId, c.value);
    }
  }
  if (listIds) {
    const current = (await listsOfContact(workspaceId, id)).map((l) => l.id);
    for (const listId of listIds.filter((l) => !current.includes(l))) await addContactToList(auth, id, listId);
    for (const listId of current.filter((l) => !listIds.includes(l))) await removeContactFromList(auth, id, listId);
  }
  return requireContact(workspaceId, id);
}

// --- Export and Import (owners and admins). The export's columns are the ones the import reads, so a file
// exported, changed and imported again works.

async function workspaceColumns(workspaceId: string) {
  const [stages, sources, priorities, props, labels] = await Promise.all([
    listLeadStages(workspaceId),
    choicesOf(workspaceId, 'leadSource'),
    choicesOf(workspaceId, 'priority'),
    prisma.contactCustomProperty.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, key: true, type: true, options: true } }),
    prisma.contactList.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ]);
  return { stages, sources, priorities, props, lists: labels };
}

const STANDARD_HEADERS = ['WhatsApp number', 'First name', 'Last name', 'Email', 'Company name', 'Job title', 'Lead stage', 'Lead source', 'Priority', 'Country', 'Subscriber'];
export const CUSTOMERS_CSV_MAX_ROWS = 50000;

export async function customersCsv(auth: AuthPayload, f: CustomerFilter) {
  await requireAdmin(auth);
  const where = await customerWhere(auth, f);
  const { stages, sources, priorities, props } = await workspaceColumns(auth.workspaceId);
  const label = (list: { value: string; label: string }[], v: string | null) => (v ? (list.find((o) => o.value === v)?.label ?? v) : '');
  const header = [...STANDARD_HEADERS, ...props.map((p) => p.name), 'Lists', 'Profile name', 'Added (Dubai time)'];
  const lines = [header.map(csvCell).join(',')];
  const batch = 1000;
  for (let skip = 0; skip < CUSTOMERS_CSV_MAX_ROWS; skip += batch) {
    const rows = await prisma.contact.findMany({
      where,
      orderBy: orderOf(f.sort),
      skip,
      take: batch,
      include: { customValues: { select: { propertyId: true, value: true } }, listMembers: { select: { list: { select: { name: true } } } } },
    });
    for (const c of rows) {
      const custom = props.map((p) => {
        const v = c.customValues.find((x) => x.propertyId === p.id)?.value ?? '';
        return p.type === 'boolean' && v ? (v === 'true' ? 'Yes' : 'No') : v;
      });
      lines.push(
        [
          c.waId, // digits with country code (a leading + would make spreadsheets read a formula)
          c.firstName ?? '',
          c.lastName ?? '',
          c.email ?? '',
          c.companyName ?? '',
          c.jobTitle ?? '',
          label(stages, c.leadStage),
          label(sources, c.leadSource),
          label(priorities, c.priority),
          c.country ?? phoneCountry(c.waId) ?? '',
          c.subscribed ? 'Yes' : 'No',
          ...custom,
          c.listMembers.map((l) => l.list.name).sort((a, b) => a.localeCompare(b)).join('; '),
          c.name ?? '',
          dubaiIso(c.createdAt).slice(0, 16).replace('T', ' '),
        ]
          .map(csvCell)
          .join(','),
      );
    }
    if (rows.length < batch) break;
  }
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel opens UTF-8 names correctly
}

// A CSV file as rows of cells: quoted cells, "" inside quotes, commas, CRLF or LF line ends; a leading BOM is dropped
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_MAX_CHARS = 5_000_000;
const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
const NUMBER_HEADERS = ['whatsapp number', 'phone number', 'phone', 'number', 'mobile', 'whatsapp', 'wa id', 'waid'];

// Import: one customer per row. New numbers are added (as with Add customer, nothing is sent); numbers that are
// already customers are skipped, not changed. Columns are matched by their heading (any case); unknown ones are
// ignored. Lead stage, source and priority accept the name or the value; Subscriber Yes/No; Lists by name, separated
// by ";" (a list that doesn't exist is created).
export async function importCustomers(auth: AuthPayload, text: string) {
  await requireAdmin(auth);
  if (typeof text !== 'string' || !text.trim()) throw bad('The file is empty');
  if (text.length > IMPORT_MAX_CHARS) throw bad('The file is too big (max 5 MB)');
  const rows = parseCsv(text);
  if (rows.length < 2) throw bad('The file has no customers: the first row must be the column headings, then one customer per row');
  if (rows.length - 1 > IMPORT_MAX_ROWS) throw bad(`Up to ${IMPORT_MAX_ROWS} customers per file`);
  const headers = rows[0].map(norm);
  const col = (...names: string[]) => headers.findIndex((h) => names.includes(h));
  const numberCol = col(...NUMBER_HEADERS);
  if (numberCol === -1) throw bad('The file needs a "WhatsApp number" column');

  const { stages, sources, priorities, props, lists } = await workspaceColumns(auth.workspaceId);
  const pick = (list: { value: string; label: string }[], raw: string, what: string) => {
    const v = raw.trim();
    if (!v) return '';
    const hit = list.find((o) => o.value.toLowerCase() === v.toLowerCase() || o.label.toLowerCase() === v.toLowerCase());
    if (!hit) throw bad(`Unknown ${what} "${v}"`);
    return hit.value;
  };
  const yesNo = (raw: string, what: string) => {
    const v = raw.trim().toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(v)) return true;
    if (['no', 'n', 'false', '0'].includes(v)) return false;
    throw bad(`${what} must be Yes or No`);
  };
  const cols = {
    firstName: col('first name', 'firstname'),
    lastName: col('last name', 'lastname'),
    email: col('email', 'email address'),
    companyName: col('company name', 'company'),
    jobTitle: col('job title', 'title'),
    leadStage: col('lead stage', 'stage', 'status'),
    leadSource: col('lead source', 'source'),
    priority: col('priority'),
    country: col('country'),
    subscribed: col('subscriber', 'subscribed'),
    lists: col('lists', 'list'),
  };
  const propCols = props.map((p) => ({ p, i: col(norm(p.name), norm(p.key)) })).filter((x) => x.i !== -1);
  const listByName = new Map(lists.map((l) => [l.name.toLowerCase(), l.id]));

  let added = 0;
  let skipped = 0;
  const errors: { row: number; message: string }[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const at = (i: number) => (i === -1 ? undefined : (cells[i] ?? '').trim());
    try {
      const input: CustomerInput = { waId: at(numberCol) };
      for (const k of ['firstName', 'lastName', 'email', 'companyName', 'jobTitle', 'country'] as const) {
        const v = at(cols[k]);
        if (v) input[k] = v;
      }
      const stage = at(cols.leadStage);
      if (stage) input.leadStage = pick(stages, stage, 'lead stage');
      const source = at(cols.leadSource);
      if (source) input.leadSource = pick(sources, source, 'lead source');
      const priority = at(cols.priority);
      if (priority) input.priority = pick(priorities, priority, 'priority');
      const sub = at(cols.subscribed);
      if (sub) input.subscribed = yesNo(sub, 'Subscriber');
      input.customValues = propCols
        .map(({ p, i }) => {
          let v = at(i) ?? '';
          if (p.type === 'boolean' && v) v = String(yesNo(v, p.name));
          return { propertyId: p.id, value: v };
        })
        .filter((c) => c.value);
      const listNames = (at(cols.lists) ?? '').split(';').map((s) => s.trim()).filter(Boolean);
      if (listNames.length) {
        // Checked before a missing list is made, so a row that can't be added creates nothing
        const waId = cleanWaId(input.waId);
        if (await prisma.contact.findFirst({ where: { workspaceId: auth.workspaceId, waId, deletedAt: null }, select: { id: true } }))
          throw new AppError('This number is already a customer', 409, 'DUPLICATE');
        await checkChoices(auth.workspaceId, parse(updateSchema, fieldsOf(input)));
        await checkCustomValues(auth.workspaceId, input.customValues);
        input.listIds = [];
        for (const name of listNames) {
          let id = listByName.get(name.toLowerCase());
          if (!id) {
            if (name.length > 100) throw bad(`List name "${name.slice(0, 30)}…" is too long`);
            id = (await prisma.contactList.create({ data: { workspaceId: auth.workspaceId, name, createdById: auth.userId }, select: { id: true } })).id;
            listByName.set(name.toLowerCase(), id);
          }
          input.listIds.push(id);
        }
      }
      await createCustomer(auth, input);
      added++;
    } catch (err) {
      if (err instanceof AppError && err.code === 'DUPLICATE') skipped++;
      else errors.push({ row: r + 1, message: err instanceof AppError ? err.message : 'Could not be saved' });
    }
  }
  return { added, skipped, failed: errors.length, errors: errors.slice(0, 50) };
}
