import fc from 'fast-check';
import { expect, test as plain } from 'vitest';
import { test } from '@fast-check/vitest';
import { COUNTRY_CODES } from '../../../../src/core/places/countries.ts';
import type { CountryCode } from '../../../../src/core/places/countries.ts';
import { callableForm, readPhones, readWebsite, telLink, websiteLink } from '../../../../src/core/places/contact.ts';

test.each([
  ['+49 7221 123456', 'DE', 'tel:+497221123456'], ['+49 (0)7221 123456', 'DE', 'tel:+497221123456'],
  ['0033 3 88 12 34 56', 'FR', 'tel:+33388123456'], ['07221/123456', 'DE', 'tel:+497221123456'],
  ['33 12 34 56', 'DK', 'tel:+4533123456'], ['Tel. 07221 123456', 'DE', null], ['123', 'DE', null],
])('[CA-PHONE] %s in %s gives %s', (v, c, out) => expect(telLink(v, c as CountryCode)).toBe(out));

plain('[CA-PHONE] the callable form has no prefix and keeps only digits and the plus', () => {
  expect(callableForm('+49 (0)7221 123456', 'DE')).toBe('+497221123456');
  expect(callableForm('+49-7221-123.456', 'AT')).toBe('+497221123456');
  expect(callableForm('7221123456', 'DE')).toBeNull();
  expect(callableForm('+49 12', 'DE')).toBeNull();
  expect(callableForm('+49 7221 1234567890123', 'DE')).toBeNull();
  expect(callableForm('123 456 789', 'PL')).toBe('+48123456789');
});

plain('[CA-PHONE] splits at ; and keeps at most two distinct', () => {
  expect(readPhones({ phone: '+49 7221 123456;+49 171 1234567;+49 30 1234567' }, 'DE')).toEqual(['+49 7221 123456', '+49 171 1234567']);
  expect(readPhones({ phone: '+49 7221 123456', 'contact:phone': '+49 7221 123456' }, 'DE')).toHaveLength(1);
  expect(readPhones({ phone: '+49 7221 123456', 'contact:phone': '07221/123456' }, 'DE')).toEqual(['+49 7221 123456']);
  expect(readPhones({ phone: 'Tel. nach Vereinbarung', 'contact:phone': ' Tel. nach Vereinbarung ' }, 'DE')).toEqual(['Tel. nach Vereinbarung']);
});

plain('[CA-PHONE] the order is phone, contact:phone, mobile, contact:mobile; over 40 characters is dropped', () => {
  expect(readPhones({ 'contact:mobile': '+49 171 1', mobile: '+49 172 2222222', 'contact:phone': '+49 30 3333333', phone: '+49 7221 123456' }, 'DE'))
    .toEqual(['+49 7221 123456', '+49 30 3333333']);
  expect(readPhones({ phone: `+49 ${'1'.repeat(40)}` }, 'DE')).toEqual([]);
  expect(readPhones({ phone: 'x'.repeat(40) }, 'DE')).toEqual(['x'.repeat(40)]);
  expect(readPhones({}, 'DE')).toEqual([]);
});

test.each([
  ['www.camping-beispiel.de', 'http://www.camping-beispiel.de'], ['https://camping-beispiel.de/de/', 'https://camping-beispiel.de/de/'],
  ['javascript:alert(1)', null], ['ftp://x.de', null], ['mailto:info@x.de', null], ['https://user:pw@x.de', null],
  ['  HTTP://X.DE ', 'HTTP://X.DE'], ['', null], ['http://', null], ['a b.de', null],
])('[CA-WEB] %s gives %s', (v, out) => expect(websiteLink(v)).toBe(out));

plain('[CA-WEB] over 255 characters is dropped; website comes before contact:website', () => {
  expect(websiteLink(`https://x.de/${'a'.repeat(242)}`)).toBe(`https://x.de/${'a'.repeat(242)}`);
  expect(websiteLink(`https://x.de/${'a'.repeat(243)}`)).toBeNull();
  expect(readWebsite({ website: 'https://a.de', 'contact:website': 'https://b.de' })).toBe('https://a.de');
  expect(readWebsite({ 'contact:website': 'https://b.de' })).toBe('https://b.de');
  expect(readWebsite({ website: 'javascript:alert(1)', 'contact:website': 'https://b.de' })).toBeNull();
  expect(readWebsite({})).toBeNull();
});

test.prop([fc.string(), fc.constantFrom(...COUNTRY_CODES)])('[FZ-04] a phone gives a callable tel: link or nothing', (s, c) => {
  const t = telLink(s, c);
  if (t !== null) expect(t).toMatch(/^tel:\+\d{7,15}$/);
});

test.prop([fc.oneof(fc.string(), fc.webUrl())])('[FZ-04] a website gives http or https or nothing', (s) => {
  const u = websiteLink(s);
  if (u !== null) {
    const p = new URL(u);
    expect(['http:', 'https:']).toContain(p.protocol);
    expect(p.username + p.password).toBe('');
    expect(u.length).toBeLessThanOrEqual(255);
  }
});
