// The banned words of spec section 8, as one matcher that the wording test and the simulator's INV-31 share.

const ALL: [string, RegExp][] = [
  ['dehydrat*', /dehydrat/i],
  ['hyponatr*', /hyponatr/i],
  ['heat stroke', /heat stroke/i],
  ['heat illness', /heat illness/i],
  ['prevent*', /prevent/i],
  ['safe', /safe/i],
  ['guarant*', /guarant/i],
  ['no rain', /no rain/i],
  ['will be dry', /will be dry/i],
  ['all clear', /all clear/i],
  ['you need to eat', /you need to eat/i],
  ['calorie*', /calorie/i],
  ['kcal', /kcal/i],
];

// In weather and stop strings: "live" as a whole word, and "dry" anywhere except in "likely dry" or "mostly dry".
const WEATHER_AND_STOP: [string, RegExp][] = [['live', /\blive\b/i]];
const DRY_OK = /(likely|mostly) dry/gi;

/** The banned words found in `text`. `weatherOrStop` adds the stricter list of weather and stop strings. */
export function bannedHits(text: string, weatherOrStop = false): string[] {
  const hits = ALL.filter(([, re]) => re.test(text)).map(([name]) => name);
  if (weatherOrStop) {
    for (const [name, re] of WEATHER_AND_STOP) if (re.test(text)) hits.push(name);
    if (/dry/i.test(text.replace(DRY_OK, ''))) hits.push('dry');
  }
  return hits;
}
