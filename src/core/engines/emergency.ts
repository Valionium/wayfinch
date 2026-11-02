// The Emergency card and Share my location (spec section 6.9). The numbers and the fallback line show in every state: each
// part is read on its own and a part that fails is left out, so nothing else failing can keep the numbers off the screen.
// It measures from the position itself (section 6.1), and imports nothing lazy and none of the other engines.
import { makeAnswer } from '../answers/index.ts';
import { formatHm, isKnownZone } from '../answers/time.ts';
import { COUNTRIES, EMERGENCY_CHECKED, emergencyTable, EUROPE_112_SOURCE, normalCountry, type CountryCode, type EmergencyNumbers } from '../places/countries.ts';
import type { Answer, AnswerItem, Missing, Place, Position, RescuePoint } from '../types.ts';
import { shortMapDate, showKm, W } from '../wording/en.ts';
import { nearestRescue, realCoordinates, realKm, whereFrom, type RescueLine } from './rescue.ts';

export type EmergencyFacts = {
  position: Position | null; now: Date; country: string | null; settlements: Place[]; shelters: Place[];
  rescuePoints: RescuePoint[]; thunderNear: boolean; dataDate: string;
  /** The place's zone, for a country outside the table. Without one the time says UTC. */
  timeZone?: string | null;
};

export type EmergencyCard = Answer & {
  largeText: true; numbers: string[]; coords: string | null; share: string | null;
  rescue: RescueLine | null; notes: string[]; updatePosition: boolean; routeKm: number | null;
};

const MIN = 60_000;
const OLD_OVER_MIN = 15;
const APPROXIMATE_OVER_M = 500;
const SHELTERS_WITHIN_M = 3000;
const SETTLEMENTS_FAR_OVER_M = 5000;

/** One part of the card: if it throws, that part is left out and the rest stays. */
function safely<T>(read: () => T, otherwise: T): T {
  try {
    return read();
  } catch {
    return otherwise;
  }
}

const SHELTER_WORDS = new Map<string, string>([
  ['weather_shelter', W.shelterWordWeather], ['wetterpilz', W.shelterWordWetterpilz], ['picnic_shelter', W.shelterWordPicnic],
  ['lean_to', W.shelterWordLeanTo], ['basic_hut', W.shelterWordHut],
]);

const listOf = <T>(list: T[]): T[] => (Array.isArray(list) ? list : []);

/** What reads 0.00000 once shown. */
const ZERO_AT_5_DECIMALS = 5e-6;
/** Whether the position is one at all. 0, 0 is what a phone gives for no fix, so it invents no coordinates. */
const usable = (p: Position | null | undefined): p is Position => realCoordinates(p) && !(Math.abs(p.lat) < ZERO_AT_5_DECIMALS && Math.abs(p.lon) < ZERO_AT_5_DECIMALS);

function numberItems(table: EmergencyNumbers | null): { numbers: string[]; items: AnswerItem[] } {
  const items: AnswerItem[] = [{ label: '112', stamp: null, status: 'action', detail: W.emergencyGeneralName }];
  const m = table?.mountain;
  if (m) {
    const detail = m.note ? `${m.name}. ${m.note}` : m.name;
    items.push({ label: m.number, stamp: null, status: 'action', detail });
    if (m.also) items.push({ label: m.also, stamp: null, status: 'action', detail });
  }
  return { numbers: items.map((i) => i.label), items };
}

function ageText(ms: number): string {
  if (ms <= 0) return W.emergencyAgeNow;
  const min = Math.ceil(ms / MIN);
  if (min < 60) return W.emergencyAgeMin(min);
  if (min < 48 * 60) return W.emergencyAgeHours(Math.floor(min / 60), min % 60);
  return W.emergencyAgeDays(Math.floor(min / (24 * 60)));
}

const degrees = (n: number): string => (Math.abs(n) < ZERO_AT_5_DECIMALS ? '0.00000' : n.toFixed(5));
const coordsOf = (p: Position): string => `${degrees(p.lat)}, ${degrees(p.lon)}`;
const geoLink = (p: Position): string => `geo:${degrees(p.lat)},${degrees(p.lon)}`;

/** The position's time on the place's clock. Where nothing tells the zone it says UTC, rather than pass for local time. */
function clockOf(at: Date, code: CountryCode | null, zone: unknown): string | null {
  if (!Number.isFinite(at.getTime())) return null;
  if (code) return formatHm(at, COUNTRIES[code].timeZone);
  return typeof zone === 'string' && isKnownZone(zone) ? formatHm(at, zone) : W.emergencyTimeUtc(formatHm(at, 'UTC'));
}

type Reading = {
  items: AnswerItem[]; notes: string[]; old: boolean; manual: boolean; approximate: boolean;
  hm: string | null; accuracyM: number | null; km: number | null;
};

/** Everything the position itself says. */
function readPosition(p: Position, now: Date, code: CountryCode | null, zone: unknown, hasSign: boolean): Reading {
  const at = p.at instanceof Date ? p.at : new Date(NaN);
  const hm = clockOf(at, code, zone);
  const manual = p.source === 'manual';
  const km = realKm(p.km) ? p.km : null;
  const accuracyKnown = typeof p.accuracyM === 'number' && p.accuracyM >= 0 && p.accuracyM < Infinity;
  const accuracyM = accuracyKnown ? Math.round(p.accuracyM) : null;
  const approximate = !manual && (!accuracyKnown || p.approximate === true || p.accuracyM > APPROXIMATE_OVER_M);
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  const ageMs = Number.isFinite(at.getTime()) && Number.isFinite(nowMs) ? nowMs - at.getTime() : null;
  // A fix or a clock that can't be read counts as old: the careful side.
  const old = ageMs === null || ageMs > OLD_OVER_MIN * MIN;

  const notes: string[] = [];
  let line: string;
  if (hm === null) line = W.emergencyPositionNoTime;
  else if (ageMs === null) line = W.emergencyPositionAtNoAge(hm);
  else line = (old ? W.emergencyOldPosition : W.emergencyPositionAt)(hm, ageText(ageMs));
  if (old) notes.push(line);
  if (manual) notes.push(km === null ? W.emergencyManualNoKm : W.emergencyManual(showKm(km)));
  if (approximate) {
    const m = String(accuracyM);
    notes.push(accuracyM === null ? W.emergencyAccuracyUnknown : hasSign ? W.emergencyApproximateSign(m) : W.emergencyApproximate(m));
  }
  const stamp = { ...(km === null ? {} : { km }), ...(hm === null ? {} : { at }) };
  const items: AnswerItem[] = [
    { label: line, stamp, status: old ? 'action' : 'unknown', detail: coordsOf(p) },
    ...(km === null ? [] : [{ label: W.emergencyRouteKm(showKm(km)), stamp: { km }, status: 'unknown' as const }]),
  ];
  return { items, notes, old, manual, approximate, hm, accuracyM, km };
}

function settlementItem(f: EmergencyFacts, p: Position): AnswerItem | null {
  let best: { s: Place; where: ReturnType<typeof whereFrom> } | null = null;
  for (const s of listOf(f.settlements)) {
    if (!realCoordinates(s) || typeof s.name !== 'string' || s.name.trim() === '') continue;
    const where = whereFrom(p, s);
    if (!best || where.metres < best.where.metres || (where.metres === best.where.metres && s.id < best.s.id)) best = { s, where };
  }
  if (!best) return null;
  const far = !(p.offRouteM <= SETTLEMENTS_FAR_OVER_M);
  return {
    label: W.emergencySettlement(best.s.name!, best.where.text), stamp: null, status: 'unknown',
    ...(far ? { detail: W.emergencySettlementsFar } : {}),
  };
}

function shelterItems(f: EmergencyFacts, p: Position): AnswerItem[] {
  const near = listOf(f.shelters).flatMap((s) => {
    if (!realCoordinates(s)) return [];
    const access = s.tags?.['access'];
    if (access === 'private' || access === 'no') return [];
    const where = whereFrom(p, s);
    return where.metres <= SHELTERS_WITHIN_M ? [{ s, where }] : [];
  });
  near.sort((a, b) => a.where.metres - b.where.metres || (a.s.id < b.s.id ? -1 : a.s.id > b.s.id ? 1 : 0));
  const lightning = f.thunderNear === true;
  return near.map(({ s, where }) => {
    const mapped = W.shelterMappedAs(SHELTER_WORDS.get(s.tags?.['shelter_type'] ?? '') ?? W.shelterWordRoof);
    const name = typeof s.name === 'string' && s.name.trim() !== '' ? s.name : null;
    return {
      label: `${name ?? mapped} · ${where.text}`, stamp: null, status: 'unknown' as const,
      detail: [...(name ? [mapped] : []), ...(lightning ? [W.weatherNoLightningProtection] : [])].join(' '),
    };
  });
}

/** The message, in the sender's words: it may be read later, so it holds no relative time. */
function shareText(p: Position, r: Reading, rescue: RescueLine | null): string {
  const accurate = !r.manual && r.accuracyM !== null && r.accuracyM > 0 ? String(r.accuracyM) : null;
  const first = r.hm === null
    ? (accurate ? W.sharePositionNoTimeAccurate(accurate) : W.sharePositionNoTime)
    : accurate ? W.sharePositionAtAccurate(r.hm, accurate) : W.sharePositionAt(r.hm);
  return [
    first, coordsOf(p), geoLink(p),
    ...(rescue ? [rescue.shareLine] : []),
    ...(r.old ? [W.shareLastFix] : []),
    ...(r.approximate ? [W.shareApproximate] : []),
    ...(r.manual ? [W.shareManual] : []),
  ].join('\n');
}

export function emergencyCard(f: EmergencyFacts): EmergencyCard {
  const position = safely(() => (usable(f.position) ? f.position : null), null);
  // The table's country follows the position (section 6.9). With no position, the card can't say which country it is in.
  const code = position ? safely(() => normalCountry(f.country), null) : null;
  const table = emergencyTable(code);
  const { numbers, items: numberLines } = numberItems(table);
  const dataDate = safely(() => f.dataDate, '');
  const mapDate = shortMapDate(dataDate);
  const missing: Missing[] = mapDate ? [] : ['places'];

  const rescue = position
    ? safely(() => nearestRescue(f.rescuePoints, position, position.km, code ?? '', dataDate, position.offRouteM), null)
    : null;
  const r = position
    ? safely(() => readPosition(position, safely(() => f.now, new Date(NaN)), code, safely(() => f.timeZone, null), rescue !== null), null)
    : null;
  const settlement = position ? safely(() => settlementItem(f, position), null) : null;
  const shelters = position ? safely(() => shelterItems(f, position), []) : [];
  const rescueItem: AnswerItem | null = rescue
    ? { label: `${W.emergencyRescuePoint(rescue.ref)} · ${rescue.where}`, stamp: null, status: 'unknown', detail: rescue.lines.slice(2).join(' · ') }
    : null;
  const notes = [...(r?.notes ?? []), ...(position && !mapDate ? [W.emergencyNoMapData] : [])];
  const coords = position ? safely(() => coordsOf(position), null) : null;

  const items: AnswerItem[] = [
    ...numberLines,
    ...(r?.items ?? []),
    ...(settlement ? [settlement] : []),
    ...(rescueItem ? [rescueItem] : []),
    ...shelters,
  ];
  const checked = table?.checked ?? EMERGENCY_CHECKED;
  const placesShown = settlement !== null || rescue !== null || shelters.length > 0;
  const answer = makeAnswer({
    topic: 'help', status: 'action', title: W.emergencyCall, stamp: null, detail: W.emergencyFallback, items,
    basis: [
      W.emergencyNumbersBasis(`${shortMapDate(checked) ?? checked} ${checked.slice(0, 4)}`, [...new Set([table?.source ?? EUROPE_112_SOURCE, ...(table?.mountain ? [table.mountain.source] : [])])].join(' ; ')),
      ...(placesShown ? [W.waterBasisOsm] : []),
    ],
    freshness: { dataDates: { emergencyNumbers: checked, ...(mapDate ? { places: dataDate } : {}) }, stale: false },
    missing,
  });
  const share = position && coords
    ? safely(() => (r ? shareText(position, r, rescue) : `${coords}\n${geoLink(position)}`), null)
    : null;
  return { ...answer, largeText: true, numbers, coords, share, rescue, notes, updatePosition: r?.old ?? false, routeKm: r?.km ?? null };
}

/** The Share my location message, or null when the card has no position to share. */
export const shareLocationText = (card: EmergencyCard): string | null => (typeof card?.share === 'string' ? card.share : null);
