import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { flagOf } from './profileOptions';

// The country of a customer's WhatsApp number (chat list, chat header, contact profile). Shared calling codes
// (+1 US/CA, +7 RU/KZ, +44 GB/GG/JE/IM) are told apart by the number itself, not the calling code. null for an
// empty, invalid or non-geographic number (+800, +882). Nothing hand-written: libphonenumber and the platform's
// own country names.

export type NumberCountry = { code: string; flag: string; name: string };

const cache = new Map<string, NumberCountry | null>();
let names: Intl.DisplayNames | null = null;

function regionName(code: string) {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export function numberCountry(waId: string | null | undefined): NumberCountry | null {
  const digits = (waId ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const hit = cache.get(digits);
  if (hit !== undefined) return hit;
  let result: NumberCountry | null = null;
  const parsed = parsePhoneNumberFromString(`+${digits}`);
  if (parsed?.isValid() && parsed.country) {
    const code = parsed.country;
    result = { code, flag: flagOf(code), name: regionName(code) };
  }
  cache.set(digits, result);
  return result;
}
