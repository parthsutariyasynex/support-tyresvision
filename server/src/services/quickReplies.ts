import { z } from 'zod';
import type { AuthPayload } from '../auth.js';
import { prisma } from '../prisma.js';
import { AppError, notFound } from './errors.js';
import { requireSupervisor } from './permissions.js';
import { parse } from './validate.js';

// Quick replies for the "/" menu in the message box: this workspace's enabled replies, optionally filtered by
// a case-insensitive partial match on shortcut, text or category (the columns use a case-insensitive collation).
const searchSchema = z.object({
  search: z.string().max(100, 'Search is too long').optional(),
  first: z.number().int().min(1).max(100).default(50),
});

// Returned by every query and mutation (audit fields included for Settings → Saved replies)
const select = { id: true, shortcut: true, description: true, category: true, sortOrder: true, createdAt: true, createdBy: true, updatedAt: true, updatedBy: true } as const;

export async function listQuickReplies(workspaceId: string, rawInput: unknown) {
  const { search, first } = parse(searchSchema, rawInput);
  const term = (search ?? '').trim();
  // Prisma's `contains` becomes LIKE '%...%' on MySQL without escaping, so % and _ would act as wildcards
  const escape = (v: string) => v.replace(/[\\%_]/g, '\\$&');
  const like = escape(term);
  // Categories are stored like "car_tyres" but shown as "car tyres": typing either finds them
  const categoryLike = escape(term.replace(/\s+/g, '_'));
  const rows = await prisma.quickReply.findMany({
    where: {
      workspaceId,
      status: 1,
      deletedAt: null,
      ...(term
        ? {
            OR: [
              { shortcut: { contains: like } },
              { description: { contains: like } },
              { category: { contains: like } },
              { category: { contains: categoryLike } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select,
    take: 500,
  });
  if (!term) return rows.slice(0, first);
  // Best matches first: the exact shortcut, then shortcuts starting with / containing the text, then text or category
  const t = term.toLowerCase();
  const rank = (r: (typeof rows)[number]) => {
    const s = r.shortcut.toLowerCase();
    return s === t ? 0 : s.startsWith(t) ? 1 : s.includes(t) ? 2 : 3;
  };
  return rows
    .map((r, i) => ({ r, i, k: rank(r) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .slice(0, first)
    .map(({ r }) => r);
}

// ---- Create / edit / delete (Settings → Saved replies). Everyone can use replies; managing them is for owners,
// admins and supervisors. Deleting is a soft delete (deletedAt/deletedBy), so imported rows are never lost.

// Typed after "/", so no spaces or the slash itself: letters, digits, _ and -
const shortcutSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^\/+/, ''))
  .pipe(
    z
      .string()
      .min(1, 'Shortcut is required')
      .max(50, 'Shortcut is too long (50 characters max)')
      .regex(/^[\p{L}\p{N}_-]+$/u, 'Shortcut can only use letters, numbers, _ and - (no spaces)'),
  );
const descriptionSchema = z.string().trim().min(1, 'Message text is required').max(4096, 'Message text is too long (4096 characters max)');
// Stored like the imported ones: "car tyres" → "car_tyres"; empty clears it
const categorySchema = z
  .string()
  .trim()
  .max(50, 'Category is too long')
  .transform((v) => (v ? v.toLowerCase().replace(/\s+/g, '_') : null))
  .nullable();
const sortOrderSchema = z.number().int().min(0).max(100000);

const createSchema = z.object({
  shortcut: shortcutSchema,
  description: descriptionSchema,
  category: categorySchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});
const updateSchema = z.object({
  shortcut: shortcutSchema.optional(),
  description: descriptionSchema.optional(),
  category: categorySchema.optional(),
  sortOrder: sortOrderSchema.optional(),
});

function toId(id: string) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw notFound('Saved reply');
  return n;
}

async function requireQuickReply(workspaceId: string, id: string) {
  const reply = await prisma.quickReply.findFirst({ where: { id: toId(id), workspaceId, deletedAt: null } });
  if (!reply) throw notFound('Saved reply');
  return reply;
}

// No unique index (imported data may hold duplicates), so check live replies here; case-insensitive collation
async function assertShortcutFree(workspaceId: string, shortcut: string, exceptId?: number) {
  const clash = await prisma.quickReply.findFirst({
    where: { workspaceId, shortcut, deletedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError(`A saved reply with the shortcut /${shortcut} already exists`, 409, 'QUICK_REPLY_EXISTS');
}

export async function createQuickReply(auth: AuthPayload, rawInput: unknown) {
  await requireSupervisor(auth, 'create saved replies');
  const { workspaceId } = auth;
  const data = parse(createSchema, rawInput);
  await assertShortcutFree(workspaceId, data.shortcut);
  // New ones go last unless a position is given
  const sortOrder =
    data.sortOrder ?? ((await prisma.quickReply.aggregate({ where: { workspaceId, deletedAt: null }, _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;
  return prisma.quickReply.create({
    data: {
      workspaceId,
      shortcut: data.shortcut,
      description: data.description,
      category: data.category ?? null,
      sortOrder,
      status: 1,
      createdAt: new Date(),
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
    select,
  });
}

export async function updateQuickReply(auth: AuthPayload, id: string, rawInput: unknown) {
  await requireSupervisor(auth, 'edit saved replies');
  const { workspaceId } = auth;
  const data = parse(updateSchema, rawInput);
  const reply = await requireQuickReply(workspaceId, id);
  if (data.shortcut !== undefined) await assertShortcutFree(workspaceId, data.shortcut, reply.id);
  return prisma.quickReply.update({ where: { id: reply.id }, data: { ...data, updatedBy: auth.userId }, select });
}

// Soft delete; returns the deleted id
export async function deleteQuickReply(auth: AuthPayload, id: string) {
  await requireSupervisor(auth, 'delete saved replies');
  const reply = await requireQuickReply(auth.workspaceId, id);
  await prisma.quickReply.update({ where: { id: reply.id }, data: { deletedAt: new Date(), deletedBy: auth.userId, updatedBy: auth.userId } });
  return String(reply.id);
}
