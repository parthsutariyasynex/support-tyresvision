import type { AuthPayload } from '../auth.js';
import { prisma } from '../prisma.js';
import { emitToWorkspace } from '../realtime.js';
import { requireContact, updateContact } from './contacts.js';
import { MAX_OPTIONS, setCustomValue } from './customProperties.js';
import { AppError } from './errors.js';
import { getPermissions } from './permissions.js';

// Customer City and Customer Email in the vehicle form (Add vehicle). Email is the contact's own Email property.
// City is a custom contact property, "City" (key `city`, an Options property: Settings → Contact properties), made
// the first time it's needed with the seven emirates; anyone adding a vehicle can add a city that isn't listed yet
// (like "+ Add New Tyre Size"), and admins can rename, reorder or remove cities in Settings. It shows in the chat's
// Contact property panel like every other property, so no database column is added.

export const CITY_KEY = 'city';
export const DEFAULT_CITIES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

const optionsOf = (json: string | null) => {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const cityKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// The workspace's City property, made (with the seven emirates) the first time it's needed
async function cityProperty(auth: AuthPayload) {
  const where = { workspaceId_key: { workspaceId: auth.workspaceId, key: CITY_KEY } };
  let p = await prisma.contactCustomProperty.findUnique({ where });
  if (!p) {
    try {
      p = await prisma.contactCustomProperty.create({
        data: { workspaceId: auth.workspaceId, name: 'City', key: CITY_KEY, type: 'options', options: JSON.stringify(DEFAULT_CITIES), createdBy: auth.userId, updatedBy: auth.userId },
      });
      emitToWorkspace(auth.workspaceId, 'contact:properties', {});
    } catch {
      // Made by someone else at the same moment
      p = await prisma.contactCustomProperty.findUnique({ where });
    }
  }
  if (!p) throw new AppError("Couldn't set up the City property", 500, 'INTERNAL');
  if (p.type !== 'options')
    throw new AppError('The "city" property in Settings → Contact properties must be an Options property to use it here', 400, 'BAD_USER_INPUT');
  return p;
}

// The vehicle form's Customer City and Customer Email: the customer's current values and the city list
export async function vehicleCustomerDetails(auth: AuthPayload, contactId: string) {
  await getPermissions(auth);
  const contact = await requireContact(auth.workspaceId, contactId);
  const p = await cityProperty(auth);
  const value = await prisma.contactCustomValue.findUnique({ where: { contactId_propertyId: { contactId, propertyId: p.id } } });
  return { email: contact.email ?? null, city: value?.value ?? null, cities: optionsOf(p.options) };
}

// "+ Add New City": added at the end of the list. Already listed (any case or spacing): DUPLICATE, and the message
// names the city as listed, so the form chooses it.
export async function addCity(auth: AuthPayload, raw: unknown) {
  await getPermissions(auth);
  const city = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!city) throw new AppError('Enter a city', 400, 'BAD_USER_INPUT');
  if (city.length > 60) throw new AppError('Keep the city to 60 characters or fewer', 400, 'BAD_USER_INPUT');
  if (!/\p{L}/u.test(city)) throw new AppError('Use letters in the city name', 400, 'BAD_USER_INPUT');
  const p = await cityProperty(auth);
  const cities = optionsOf(p.options);
  const existing = cities.find((c) => cityKey(c) === cityKey(city));
  if (existing) throw new AppError(`${existing} is already in the list`, 409, 'DUPLICATE');
  if (cities.length >= MAX_OPTIONS) throw new AppError(`The city list is full (${MAX_OPTIONS}); an admin can remove some in Settings → Contact properties`, 400, 'BAD_USER_INPUT');
  const next = [...cities, city];
  await prisma.contactCustomProperty.update({ where: { id: p.id }, data: { options: JSON.stringify(next), updatedBy: auth.userId } });
  emitToWorkspace(auth.workspaceId, 'contact:properties', {});
  return { city, cities: next };
}

// Saved with the vehicle: the city (required, one of the list) and the email (optional; empty clears it). Only what
// changed is written, with the usual change log and live update of the contact.
export async function saveVehicleCustomerDetails(auth: AuthPayload, contactId: string, rawCity: unknown, rawEmail: unknown) {
  await getPermissions(auth);
  const contact = await requireContact(auth.workspaceId, contactId);
  const p = await cityProperty(auth);
  const city = typeof rawCity === 'string' ? rawCity.trim() : '';
  if (!city) throw new AppError('Select the customer city', 400, 'BAD_USER_INPUT');
  const listed = optionsOf(p.options).find((c) => cityKey(c) === cityKey(city));
  if (!listed) throw new AppError('Choose a city from the list, or add it with "+ Add New City"', 400, 'BAD_USER_INPUT');
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  if (email !== (contact.email ?? '')) await updateContact(auth, contactId, { email }); // checks the address
  const current = await prisma.contactCustomValue.findUnique({ where: { contactId_propertyId: { contactId, propertyId: p.id } } });
  if (current?.value !== listed) await setCustomValue(auth, contactId, p.id, listed);
  return { email: email || null, city: listed, cities: optionsOf(p.options) };
}
