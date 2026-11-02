'use client';

import { numberCountry } from '@/lib/countryFlag';

// 🇦🇪 for a customer's WhatsApp number (country name on hover and for screen readers). Nothing when the number
// has no country. Flag emojis render on Windows too, through the app/FlagEmojis.tsx font polyfill.
export function CountryFlag({ waId, className = '' }: { waId: string | null | undefined; className?: string }) {
  const country = numberCountry(waId);
  if (!country) return null;
  return (
    <span role="img" aria-label={country.name} title={country.name} className={`shrink-0 leading-none ${className}`}>
      {country.flag}
    </span>
  );
}
