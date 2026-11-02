// The ten first-release countries: dial code, trunk rule and the one IANA zone each uses (section 5a), and the emergency
// numbers of section 6.9. Keep this file free of imports: the pipeline and the Emergency card both read it.
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

export type EmergencyNumbers = {
  general: '112'; source: string; checked: string;
  /** A national mountain-rescue number, only where an official source gives one. `also` is the same service's other number. */
  mountain: { number: string; also?: string; name: string; note?: string; source: string; checked: string } | null;
};

// Every number below was read on the page named, on the date given, on 2 November 2026. None is from memory.
// Change a number only with a new reading of an official page, and with the owner (section 12.6).
//
// 112
//   DE https://verwaltung.bund.de/leistungsverzeichnis/en/rechte-und-pflichten/102837939
//      mountains, Bavaria only, also 112: https://bergwacht-bayern.de/notruf
//   FR https://www.service-public.gouv.fr/particuliers/vosdroits/F33953?lang=en
//   CZ https://mv.gov.cz/clanek/pojmy-tisnove-volani.aspx
//   DK https://politi.dk/en/about-the-police/contact-the-police/emergency-112
//   NL https://www.government.nl/themes/justice-security-and-defence/emergency-number-112
//   AT https://www.oesterreich.gv.at/themen/notfaelle_unfaelle_und_kriminalitaet/katastrophenfaelle/1/Seite.29500327.html
//   LU https://guichet.public.lu/en/citoyens/sante/services-urgence/appel-urgence.html
//   PL https://www.gov.pl/web/numer-alarmowy-112/numeralarmowy112 ; also https://topr.pl/
//   BE https://112.be/en/how-call/how-call-112
//   CH https://www.rega.ch/en/about-us/contact/emergency-numbers
// Mountain rescue
//   AT 140: https://www.oesterreich.gv.at/themen/notfaelle_unfaelle_und_kriminalitaet/katastrophenfaelle/1/Seite.29500327.html
//           https://bergrettung.at/tipps/notruf-absetzen/
//      Vorarlberg 144: https://www.bergrettung-vorarlberg.at/teaser-menue/tipps/alpin-notruf-140 ; https://vorarlberg.at/-/notrufnummern
//   CH 1414, also from a foreign SIM: https://www.rega.ch/en/about-us/contact/emergency-numbers
//      Valais 144: https://www.rega.ch/en/questions-and-answers ; https://www.vs.ch/de/web/ssp/urgences-et-secours
//   CZ +420 1210: https://www.horskasluzba.cz/cz/kontakty
//      with a foreign network: https://www.horskasluzba.cz/cz/aktualni-informace/aktualne/tiskove-zpravy/2903-volani-na-cislo-hs-1210-u-vodafone-zdarma
//   PL 985 and +48 601 100 300: https://www.gopr.pl/ ; https://topr.pl/
//      985 also serves sea rescue: https://bip.uke.gov.pl/numeracja/tablice-numerow-kierowania-alarmowego-nka,4,160.html
// No official page gave a national mountain-rescue number for DE, FR, DK, NL, LU or BE: those show 112.
const CHECKED = '2026-11-02';
/** For a card outside the table: the date of this table, and an official page saying 112 applies across Europe. */
export const EMERGENCY_CHECKED = CHECKED;
export const EUROPE_112_SOURCE = 'https://www.oesterreich.gv.at/themen/notfaelle_unfaelle_und_kriminalitaet/katastrophenfaelle/1/Seite.29500327.html';
const EMERGENCY: ReadonlyMap<string, EmergencyNumbers> = new Map<string, EmergencyNumbers>([
  ['DE', { general: '112', source: 'https://verwaltung.bund.de/leistungsverzeichnis/en/rechte-und-pflichten/102837939', checked: CHECKED, mountain: null }],
  ['FR', { general: '112', source: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33953?lang=en', checked: CHECKED, mountain: null }],
  ['CZ', {
    general: '112', source: 'https://mv.gov.cz/clanek/pojmy-tisnove-volani.aspx', checked: CHECKED,
    mountain: { number: '+420 1210', name: 'Czech mountain rescue (Horská služba), day and night', source: 'https://www.horskasluzba.cz/cz/kontakty', checked: CHECKED },
  }],
  ['DK', { general: '112', source: 'https://politi.dk/en/about-the-police/contact-the-police/emergency-112', checked: CHECKED, mountain: null }],
  ['NL', { general: '112', source: 'https://www.government.nl/themes/justice-security-and-defence/emergency-number-112', checked: CHECKED, mountain: null }],
  ['AT', {
    general: '112', source: 'https://www.oesterreich.gv.at/themen/notfaelle_unfaelle_und_kriminalitaet/katastrophenfaelle/1/Seite.29500327.html', checked: CHECKED,
    mountain: {
      number: '140', name: 'Austrian mountain rescue (Alpin-Notruf)', note: 'In Vorarlberg, 144 also reaches mountain rescue.',
      source: 'https://www.oesterreich.gv.at/themen/notfaelle_unfaelle_und_kriminalitaet/katastrophenfaelle/1/Seite.29500327.html', checked: CHECKED,
    },
  }],
  ['LU', { general: '112', source: 'https://guichet.public.lu/en/citoyens/sante/services-urgence/appel-urgence.html', checked: CHECKED, mountain: null }],
  ['PL', {
    general: '112', source: 'https://www.gov.pl/web/numer-alarmowy-112/numeralarmowy112', checked: CHECKED,
    mountain: { number: '985', also: '+48 601 100 300', name: 'Polish mountain rescue (GOPR, TOPR in the Tatras)', source: 'https://www.gopr.pl/', checked: CHECKED },
  }],
  ['BE', { general: '112', source: 'https://112.be/en/how-call/how-call-112', checked: CHECKED, mountain: null }],
  ['CH', {
    general: '112', source: 'https://www.rega.ch/en/about-us/contact/emergency-numbers', checked: CHECKED,
    mountain: {
      number: '1414', name: 'Swiss air rescue (Rega)', note: 'In Valais, call 144.',
      source: 'https://www.rega.ch/en/about-us/contact/emergency-numbers', checked: CHECKED,
    },
  }],
]);

/** A country code as the table knows it, or null. A code comes from outside: anything else, 'constructor' included, is no country. */
export function normalCountry(code: unknown): CountryCode | null {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  return EMERGENCY.has(c) ? (c as CountryCode) : null;
}

/** The numbers of a country, or null outside the table. */
export const emergencyTable = (code: unknown): EmergencyNumbers | null => {
  const c = normalCountry(code);
  return c ? EMERGENCY.get(c)! : null;
};
