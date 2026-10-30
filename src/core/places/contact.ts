// The shared phone and website checks of spec section 6.13. The pipeline, Refresh this stretch and the app all use them.
import { COUNTRIES } from './countries.ts';
import type { CountryCode } from './countries.ts';

const MAX_PHONE_TEXT = 40;
const MAX_WEBSITE = 255;

/** "+" and 7-15 digits, or null when the value is text or cannot be made callable. */
export function callableForm(value: string, country: CountryCode): string | null {
  let s = value.trim();
  if (!/^[+\d\s\-./()]+$/.test(s)) return null;
  // "(0)" after the country code is dropped before the brackets go.
  if (/^(\+|00)/.test(s)) s = s.replace(/\(0\)/, '');
  s = s.replace(/[\s\-./()]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  let international: string;
  if (s.startsWith('+')) {
    international = s;
  } else if (/^\d+$/.test(s)) {
    const { dial, trunk } = COUNTRIES[country];
    if (trunk === 'replace-0') {
      if (!s.startsWith('0')) return null;
      international = `+${dial}${s.slice(1)}`;
    } else {
      international = `+${dial}${s}`;
    }
  } else {
    return null;
  }
  return /^\+\d{7,15}$/.test(international) ? international : null;
}

export function telLink(value: string, country: CountryCode): string | null {
  const c = callableForm(value, country);
  return c === null ? null : `tel:${c}`;
}

/** Up to two distinct numbers, as mapped, in the order phone, contact:phone, mobile, contact:mobile. */
export function readPhones(tags: Record<string, string>, country: CountryCode): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of ['phone', 'contact:phone', 'mobile', 'contact:mobile']) {
    const raw = tags[key];
    if (raw === undefined) continue;
    for (const part of raw.split(';')) {
      const text = part.trim();
      if (text === '' || text.length > MAX_PHONE_TEXT) continue;
      const identity = callableForm(text, country) ?? `text:${text}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      out.push(text);
      if (out.length === 2) return out;
    }
  }
  return out;
}

/** An http or https address without credentials and of at most 255 characters, or null. */
export function websiteLink(value: string): string | null {
  const v = value.trim();
  if (v === '' || /[\s\u0000-\u001f\u007f]/.test(v)) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `http://${v}`;
  if (candidate.length > MAX_WEBSITE) return null;
  try {
    const u = new URL(candidate);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username !== '' || u.password !== '') return null;
    return candidate;
  } catch {
    return null;
  }
}

/** `website`, else `contact:website`; one per place. */
export function readWebsite(tags: Record<string, string>): string | null {
  const raw = tags['website'] ?? tags['contact:website'];
  return raw === undefined ? null : websiteLink(raw);
}
