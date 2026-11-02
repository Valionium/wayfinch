// The seven device zones of spec section 11.6, and a way to switch the zone Node uses for the length of one call.
// The January and July offsets are the minutes `getTimezoneOffset()` gives; the switch is asserted before the body
// runs, so a test can never pass while checking nothing (Decision 7).
export const DEVICE_ZONES: { zone: string; janOffset: number; julOffset: number }[] = [
  { zone: 'Europe/Berlin', janOffset: -60, julOffset: -120 },
  { zone: 'Europe/Lisbon', janOffset: 0, julOffset: -60 },
  { zone: 'Europe/Helsinki', janOffset: -120, julOffset: -180 },
  { zone: 'UTC', janOffset: 0, julOffset: 0 },
  { zone: 'America/New_York', janOffset: 300, julOffset: 240 },
  { zone: 'Asia/Kolkata', janOffset: -330, julOffset: -330 },
  { zone: 'Pacific/Kiritimati', janOffset: -840, julOffset: -840 },
];

/** Runs `body` with Node's own time zone set to `zone`, after checking that the switch took effect. */
export function withDeviceZone<T>(zone: string, body: () => T): T {
  const spec = DEVICE_ZONES.find((z) => z.zone === zone);
  if (!spec) throw new Error(`unknown device zone ${zone}`);
  const before = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    const jan = new Date(2026, 0, 15, 12).getTimezoneOffset();
    const jul = new Date(2026, 6, 15, 12).getTimezoneOffset();
    if (jan !== spec.janOffset || jul !== spec.julOffset) {
      throw new Error(`TZ=${zone} did not take effect: offsets ${jan}/${jul}, expected ${spec.janOffset}/${spec.julOffset}`);
    }
    return body();
  } finally {
    if (before === undefined) delete process.env['TZ']; else process.env['TZ'] = before;
  }
}
