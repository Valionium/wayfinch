// The ten first-release countries: dial code, trunk rule and the one IANA zone each uses (section 5a).
export type CountryCode = 'DE' | 'AT' | 'CH' | 'FR' | 'BE' | 'NL' | 'DK' | 'PL' | 'CZ' | 'LU';

export const COUNTRIES: Record<CountryCode, { dial: string; trunk: 'replace-0' | 'prefix'; timeZone: string }> = {
  DE: { dial: '49', trunk: 'replace-0', timeZone: 'Europe/Berlin' },
  AT: { dial: '43', trunk: 'replace-0', timeZone: 'Europe/Vienna' },
  CH: { dial: '41', trunk: 'replace-0', timeZone: 'Europe/Zurich' },
  FR: { dial: '33', trunk: 'replace-0', timeZone: 'Europe/Paris' },
  BE: { dial: '32', trunk: 'replace-0', timeZone: 'Europe/Brussels' },
  NL: { dial: '31', trunk: 'replace-0', timeZone: 'Europe/Amsterdam' },
  DK: { dial: '45', trunk: 'prefix', timeZone: 'Europe/Copenhagen' },
  PL: { dial: '48', trunk: 'prefix', timeZone: 'Europe/Warsaw' },
  CZ: { dial: '420', trunk: 'prefix', timeZone: 'Europe/Prague' },
  LU: { dial: '352', trunk: 'prefix', timeZone: 'Europe/Luxembourg' },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];
