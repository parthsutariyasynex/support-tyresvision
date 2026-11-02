import type { Vehicle } from '@prisma/client';
import { z } from 'zod';
import type { AuthPayload } from '../auth.js';
import { prisma } from '../prisma.js';
import { emitToWorkspace } from '../realtime.js';
import { requireContact } from './contacts.js';
import { notFound } from './errors.js';
import { getPermissions } from './permissions.js';
import { parse } from './validate.js';

// A customer's vehicles (chat header car button, contact profile "Add Vehicle"). Every member can list, add and
// delete them; deleting is a soft delete (deletedAt/deletedBy), so nothing is lost.

// Optional text: trimmed, empty → null
const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `The ${label} is too long (${max} characters max)`)
    .nullish()
    .transform((v) => v || null);

const requiredText = (max: number, label: string) =>
  z
    .string({ error: `Enter the ${label}` })
    .trim()
    .min(1, `Enter the ${label}`)
    .max(max, `The ${label} is too long (${max} characters max)`);

// The latest calendar day anywhere on Earth (UTC+14), so "today" in the user's own time zone is never refused
const latestToday = () => new Date(Date.now() + 14 * 3600_000).toISOString().slice(0, 10);

// Optional yyyy-mm-dd: a real date, not in the future; empty → null
const day = (label: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), `The ${label} must be a date like 2026-01-31`)
    .refine((v) => {
      if (v === null) return true;
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; // rejects 2026-02-30
    }, `The ${label} is not a real date`)
    .refine((v) => v === null || v <= latestToday(), `The ${label} can't be in the future`);

const vehicleSchema = z.object({
  contactId: z.string({ error: 'Choose a CRM customer' }).trim().min(1, 'Choose a CRM customer'),
  plateNumber: requiredText(20, 'plate number').transform((v) => v.toUpperCase()),
  make: requiredText(60, 'make'),
  model: requiredText(60, 'model'),
  year: z
    .number({ error: 'Enter the year' })
    .int('Enter the year')
    .min(1900, 'Enter the year')
    .refine((y) => y <= new Date().getUTCFullYear() + 1, 'Enter the year'),
  registrationDate: day('registration date'),
  lastServiceDate: day('last purchase / service date'),
  tireSize1: z.string({ error: 'Enter tire size 1' }).trim().min(1, 'Enter tire size 1').max(30, 'Tire size 1 is too long (30 characters max)'),
  tireSize2: text(30, 'tire size 2'),
});

const toDay = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);
const fromDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// API shape: dates as yyyy-mm-dd, no workspace or audit ids
function shape(v: Vehicle) {
  return {
    id: v.id,
    contactId: v.contactId,
    plateNumber: v.plateNumber,
    make: v.make,
    model: v.model,
    year: v.year,
    registrationDate: fromDay(v.registrationDate),
    lastServiceDate: fromDay(v.lastServiceDate),
    tireSize1: v.tireSize1,
    tireSize2: v.tireSize2,
    createdAt: v.createdAt,
  };
}

// Open vehicle lists of this contact reload
function announce(workspaceId: string, contactId: string) {
  emitToWorkspace(workspaceId, 'contact:vehicles', { contactId });
}

export async function listVehicles(auth: AuthPayload, contactId: string) {
  await getPermissions(auth);
  await requireContact(auth.workspaceId, contactId);
  const rows = await prisma.vehicle.findMany({
    where: { workspaceId: auth.workspaceId, contactId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map(shape);
}

// "CRM Customer" picker: contacts by name, first/last name, or the digits of their WhatsApp number
export async function searchVehicleCustomers(auth: AuthPayload, search: string | null | undefined) {
  await getPermissions(auth);
  const term = (search ?? '').trim().slice(0, 100);
  // Prisma's `contains` is LIKE '%...%' on MySQL without escaping
  const like = term.replace(/[\\%_]/g, '\\$&');
  const digits = term.replace(/\D/g, '');
  const rows = await prisma.contact.findMany({
    where: {
      workspaceId: auth.workspaceId,
      deletedAt: null,
      ...(term
        ? {
            OR: [
              { name: { contains: like } },
              { firstName: { contains: like } },
              { lastName: { contains: like } },
              ...(digits ? [{ waId: { contains: digits } }] : []),
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    select: { id: true, name: true, waId: true },
    take: 20,
  });
  return rows;
}

export async function addVehicle(auth: AuthPayload, rawInput: unknown) {
  await getPermissions(auth);
  const data = parse(vehicleSchema, rawInput);
  await requireContact(auth.workspaceId, data.contactId);
  const vehicle = await prisma.vehicle.create({
    data: {
      workspaceId: auth.workspaceId,
      contactId: data.contactId,
      plateNumber: data.plateNumber,
      make: data.make,
      model: data.model,
      year: data.year,
      registrationDate: toDay(data.registrationDate),
      lastServiceDate: toDay(data.lastServiceDate),
      tireSize1: data.tireSize1,
      tireSize2: data.tireSize2,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
  });
  announce(auth.workspaceId, vehicle.contactId);
  return shape(vehicle);
}

// Soft delete
export async function deleteVehicle(auth: AuthPayload, id: string) {
  await getPermissions(auth);
  const vehicle = await prisma.vehicle.findFirst({ where: { id, workspaceId: auth.workspaceId, deletedAt: null } });
  if (!vehicle) throw notFound('Vehicle');
  await prisma.vehicle.update({
    where: { id: vehicle.id },
    data: { deletedAt: new Date(), deletedBy: auth.userId, updatedBy: auth.userId },
  });
  announce(auth.workspaceId, vehicle.contactId);
  return true;
}
