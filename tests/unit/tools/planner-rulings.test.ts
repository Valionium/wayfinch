// The owner's small rulings of 14 Nov 2026 for the Bag planner (sweep of 14 Nov, #26, #32, #33, #34, #37, #42), on the page's own code in
// the QA VM (qa/app-vm.cjs). The hand-off's rulings (#29) are in tests/unit/contracts/handoff.test.ts, the browser side in
// tests/e2e/app-planner-rulings.spec.ts. The page is never printed: only short values and booleans are compared.
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import { bannedHits } from '../../fixtures/banned.ts';

const require = createRequire(import.meta.url);
type Node = { innerHTML: string; textContent: string; value: string; hidden?: boolean; dataset: Record<string, string> };
type Page = { run: (code: string) => unknown; html: string; nodes: Map<string, Node>; context: Record<string, unknown> };
const { appVM } = require('../../../qa/app-vm.cjs') as { appVM: () => Page };

const words = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const node = (page: Page, id: string) => { page.run(`$('${id}')`); return page.nodes.get(id)!; };
const json = <T>(page: Page, code: string): T => JSON.parse(page.run(`JSON.stringify(${code})`) as string) as T;
/** A route both ends of which are known: 240 km, for which the stage model suggests 2 nights. */
const ROUTE = 'routePending=()=>false;planRoute=()=>({distanceKm:240,suggestedNights:2,flat:25,pace:{hours:6},ascent:1800});';
/** The page with its packing check drawn as the page draws it (as qa/packing-audit.cjs and planner-sweep.test.ts do). */
function checkPage(): Page {
  const page = appVM();
  const a = 'function renderResult(){', start = page.html.indexOf(a);
  page.run(page.html.slice(start, page.html.indexOf('/* ==== 84-packing-checklist.js ==== */', start)));
  page.run("buildThumb=()=>'';DRAFT_READY=true;");
  return page;
}

describe('[LC-NIGHTS-EMPTY] a fresh planner\'s Nights out starts empty (the owner\'s ruling of 14 Nov 2026, sweep #32)', () => {
  test('the field is empty, its "0 for a day ride" hint stays; with no route the plan is a day ride, and one line says so', () => {
    const page = appVM();
    const input = /<input[^>]*id="nights"[^>]*>/.exec(page.html)![0];
    expect(/\svalue=/.test(input)).toBe(false);
    expect(page.html).toContain('<label for="nights">Nights out <span class="hint">0 for a day ride</span></label>');
    expect(json(page, '[S.nights,nightsOpenNow()]')).toEqual([0, true]);
    page.run('renderNightsSuggestion()');
    expect(words(node(page, 'nightsSuggestionHint').innerHTML)).toBe('Planned as a day ride until you enter nights.');
    expect(words(node(page, 'checkNightsSuggestion').innerHTML)).toBe('Planned as a day ride until you enter nights');
    expect(bannedHits(node(page, 'nightsSuggestionHint').innerHTML)).toEqual([]);
  });

  test('once both ends are known: "Suggested: 2 nights", and the plan takes them until the rider enters a number; an emptied field follows again', () => {
    const page = appVM();
    page.run(ROUTE);
    expect(page.run('followNights()')).toBe(true);
    expect(json(page, '[S.nights,nightsOpenNow()]')).toEqual([2, true]);
    page.run('renderNightsSuggestion()');
    expect(words(node(page, 'nightsSuggestion').innerHTML)).toBe('Suggested: 2 nights');
    expect(words(node(page, 'nightsSuggestionHint').innerHTML)).toMatch(/^Planned with the suggested 2 nights until you enter nights\./);
    expect(words(node(page, 'checkNightsSuggestion').innerHTML)).toMatch(/^Suggested: 2 nights · planned with them until you enter nights/);
    // stored as nights not entered, so a reload follows the route again
    expect(json(page, 'captureDraft().trip.nightsOpen')).toBe(true);
    // the rider enters 3: the rider's number, never followed
    page.run("nightsTyped('3')");
    expect(json(page, '[S.nights,nightsOpenNow(),followNights()]')).toEqual([3, false, false]);
    page.run('renderNightsSuggestion()');
    expect(words(node(page, 'nightsSuggestionHint').innerHTML)).toMatch(/^Your chosen number stays unchanged\./);
    expect(json(page, "'nightsOpen' in captureDraft().trip")).toBe(false);
    // the field emptied: nights not entered again, the suggestion back
    page.run("nightsTyped('')");
    expect(json(page, '[S.nights,nightsOpenNow()]')).toEqual([2, true]);
    // 0 entered by the rider is the rider's day ride
    page.run("nightsTyped('0')");
    expect(json(page, '[S.nights,nightsOpenNow(),followNights()]')).toEqual([0, false, false]);
  });

  test('saved plans load unchanged: a plan saved before shows its nights as entered; an open plan reloads open and empty', () => {
    const page = appVM();
    const old = json<Record<string, Record<string, unknown>>>(page, 'captureDraft()');
    delete old.trip!.nightsOpen;
    old.trip!.nights = 6;
    page.context.qaOld = JSON.stringify(old);
    page.run('restorePlan(JSON.parse(qaOld),true)');
    expect(json(page, '[S.nights,nightsOpenNow()]')).toEqual([6, false]);
    expect(String(node(page, 'nights').value)).toBe('6');
    expect(json(page, "'nightsOpen' in captureDraft().trip")).toBe(false);
    // a plan saved without nights at all keeps the default of before
    expect(json(page, `normalisePlan({...JSON.parse(qaOld),trip:{...JSON.parse(qaOld).trip,nights:undefined}}).trip.nights`)).toBe(6);
    // nights not entered, saved and restored
    page.run(`${ROUTE}nightsTyped('');`);
    const open = page.run('JSON.stringify(captureDraft())') as string;
    page.context.qaOpen = open;
    page.run('restorePlan(JSON.parse(qaOpen),true)');
    expect(json(page, '[S.nights,nightsOpenNow()]')).toEqual([2, true]);
    expect(String(node(page, 'nights').value)).toBe('');
    expect(page.run('JSON.stringify(captureDraft())')).toBe(open);
  });
});

describe('[LC-WT-NOPOP] the bike\'s maximum-weight box never opens by itself (the owner\'s ruling of 14 Nov 2026, sweep #34)', () => {
  test('opening the full planner at Check, with the question due, opens no box; the inline "not entered" line and its button stay', () => {
    const page = appVM();
    page.run(`S.step=4;S.bags=[{uid:1,pos:'frame',L:6}];S.nextUid=2;S.bikeProfile=normaliseBikeProfile({id:'bike_a',name:'A'});BIKE_PROFILES=[S.bikeProfile];
      MAX_WEIGHT_SKIPPED=false;DIALOGS.length=0;DRAFT_READY=true;setSmallView(true);
      var QA_OPENED=0;openMaxWeight=()=>{QA_OPENED++;};`);   // the harness's nodes cannot show the box: any opening is counted
    expect(page.run('weightPromptDue()')).toBe(true);
    expect(page.run('openFullPlanner()')).toBe(true);
    expect(json(page, 'QA_OPENED')).toBe(0);
    const weight = json<{ head: string; body: string }>(page, 'weightSectionHtml(currentPlan())');
    expect(weight.head).toMatch(/not entered/);
    expect(weight.body).toMatch(/id="maxWeightChange"/);
  });
});

describe('[LC-HF-HIDE] Handling first is not offered when the load is as balanced as the bags allow (the owner\'s ruling of 14 Nov 2026, sweep #33)', () => {
  const KIT0 = JSON.stringify(Object.fromEntries(['tent', 'quilt', 'pad', 'stove', 'pot', 'lock', 'tool', 'pump', 'bank', 'puffy', 'rain', 'firstaid', 'wash', 'camp', 'tubes', 'phone'].map((k) => [k, true])));
  const SETS = [
    [{ uid: 1, pos: 'seat', L: 14 }, { uid: 2, pos: 'bar', L: 13 }, { uid: 3, pos: 'frame', L: 4.5 }, { uid: 4, pos: 'top', L: 1, slot: 'front' }, { uid: 5, pos: 'fork', L: 3, pair: true }],
    [{ uid: 1, pos: 'seat', L: 9 }, { uid: 2, pos: 'bar', L: 9 }, { uid: 3, pos: 'frame', L: 6 }, { uid: 4, pos: 'pack', L: 30 }],
    [{ uid: 1, pos: 'seat', L: 14 }, { uid: 2, pos: 'bar', L: 9 }, { uid: 3, pos: 'frame', L: 6 }],
    [{ uid: 1, pos: 'rack', L: 20, pair: true }, { uid: 2, pos: 'bar', L: 9 }, { uid: 3, pos: 'bottle', slot: 'dt', L: 0.75 }, { uid: 4, pos: 'pack', L: 12 }],
  ];
  test('the button and its hint go exactly while the weight map\'s line says "Your load is as balanced as your bags allow."; otherwise it is there', () => {
    const page = appVM();
    page.run('DRAFT_READY=true');
    const seen = new Set<boolean>();
    for (const balanced of [true, false]) for (const nights of [0, 6]) for (const bags of SETS) {
      page.run(`(()=>{S.kit=${KIT0};S.nights=${nights};S.foodMode=2;S.mode='comfort';SMALL_VIEW=false;
        S.bikeProfile=normaliseBikeProfile({id:'qa_hf',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'}},look:{bars:'drop'}});
        S.bags=${JSON.stringify(bags)}.map(b=>({...b}));S.nextUid=9;S.decks={bar:false,rack:${bags.some((b) => b.pos === 'rack')}};S.pinned={};S.packed={};S.placements=null;
        resetBalance();TRIAL=null;DRAFT_FROZEN=false;S.step=4;currentPlan();${balanced ? 'autoBalancePlan();' : ''}})()`);
      const note = json<{ text: string; best?: boolean } | null>(page, 'weightMapIdeal(true).note');
      const best = note?.text === 'Your load is as balanced as your bags allow.';
      expect(!!note?.best, `${nights} nights, ${bags.length} bags`).toBe(best);
      page.run('fillHandling()');
      expect(node(page, 'rigHandling').hidden, `${nights} nights, ${bags.length} bags: the button`).toBe(best);
      if (best) expect(node(page, 'handlingHint').hidden, `${nights} nights, ${bags.length} bags: its hint`).toBe(true);
      seen.add(best);
    }
    expect([...seen].sort()).toEqual([false, true]);   // both kinds of plan were checked
  }, 120_000);
});

describe('[LC-LITRES-ONE] one rounding rule for a bag\'s litres, and one kit-plus-water total (the owner\'s ruling of 14 Nov 2026, sweep #26)', () => {
  test('rated, usable and the pair\'s litres: two decimals at most, no trailing zeros, as Where it goes gives them', () => {
    const page = appVM();
    page.run("S.packEff=0.9;S.bags=[{uid:1,pos:'seat',L:10.25,userL:true},{uid:2,pos:'fork',L:3,pair:true}];S.nextUid=3;");
    const seat = 'S.bags[0]', fork = 'S.bags[1]';
    expect(page.run(`ratedL(${seat})`)).toBe(10.25);
    expect(page.run('ratedShown()')).toBe('16.25');   // 10.25 and the pair of 3 L
    expect(page.run(`bagCapacityText(${seat})`)).toBe(`${+(10.25 * 0.9).toFixed(2)} L usable.`);
    expect(page.run(`bagCapacityText(${fork})`)).toBe('2.7 L usable each · 5.4 L for the pair.');
    expect(String(page.run(`bagCapacityText(${fork})`))).not.toMatch(/\d\.\d0 L|\.00 L/);
  });

  test('Check\'s Kit + water is the load summary\'s figure, the one the Tools card and Trip read', () => {
    const page = checkPage();
    const kits = [['tool', 'docs', 'phone'], ['tool', 'pump', 'tubes', 'phone', 'snacks'], ['rain', 'tool', 'levers', 'cash', 'docs', 'phone', 'bank'], ['tent', 'quilt', 'pad', 'stove', 'pot', 'tool']];
    for (const kit of kits) {
      page.run(`S.kit=${JSON.stringify(Object.fromEntries(kit.map((k) => [k, true])))};S.kitTouched={...S.kit};S.nights=1;S.nightsOpen=null;
        S.bags=[{uid:1,pos:'seat',L:10},{uid:2,pos:'bottle',slot:'dt',L:0.75}];S.nextUid=3;S.step=4;S.placements=null;renderResult();`);
      const shown = /<b>([\d.]+) kg<\/b><span>Kit \+ water/.exec(node(page, 'verdictBox').innerHTML)?.[1];
      const summary = String(Number(json<number>(page, 'loadSummary().weight.carriedKg').toFixed(1)));
      expect(shown, kit.join(', ')).toBe(summary);
    }
  }, 30_000);
});

describe('[GA-BACK-TOOLS] the Gear advisor opened from Tools says "← Tools" (the owner\'s ruling of 14 Nov 2026, sweep #42)', () => {
  test('back=tools: the one top bar reads "← Tools" and goes to Tools; from elsewhere it keeps "← Back to Wayfinch"', () => {
    const tools = appVM();
    tools.run("history={replaceState(){}};document.getElementById('backToWayfinch').textContent='← Back to Wayfinch';openAdvisorFromLink('#gear-advisor&back=tools')");
    expect(node(tools, 'backToWayfinch').textContent).toBe('← Tools');
    expect((node(tools, 'backToWayfinch') as Node & { href?: string }).href).toBe('/#/tools');
    const trip = appVM();
    trip.run("history={replaceState(){}};document.getElementById('backToWayfinch').textContent='← Back to Wayfinch';openAdvisorFromLink('#gear-advisor&back=trip')");
    expect(node(trip, 'backToWayfinch').textContent).toBe('← Back to Wayfinch');
  });
});

describe('[LC-RESTORED-ONCE] the restored plan is said once in a tab\'s session, in one quiet line; Start a new plan keeps a fixed place (the owner\'s ruling of 14 Nov 2026, sweep #37)', () => {
  test('the first restore in a session says so; the next one in the same session does not; Start a new plan is at the end of step one, outside the bar', () => {
    const session = new Map<string, string>();
    const store = { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => { session.set(k, String(v)); } };
    const first = appVM();
    (first.context.window as Record<string, unknown>).sessionStorage = store;
    first.run('showRecoveredDraft()');
    expect(node(first, 'draftText').textContent).toBe('Your working plan was restored from this browser.');
    expect([...session.keys()]).toEqual(['loadcheck:restoredNoted:v1']);
    const again = appVM();
    (again.context.window as Record<string, unknown>).sessionStorage = store;
    again.run('showRecoveredDraft()');
    expect(node(again, 'draftText').textContent).toBe('');
    // the fixed place: a button at the end of step one, not in the bar
    const s1 = first.html.slice(first.html.indexOf('<section id="s1"'), first.html.indexOf('<section id="s2"'));
    expect(s1).toMatch(/<p class="newplan-row"><button class="linky" id="draftNewRide" type="button">Start a new plan<\/button><\/p>\s*<\/section>/);
    const bar = first.html.slice(first.html.indexOf('id="draftBar"'), first.html.indexOf('id="updateBar"'));
    expect(bar).not.toContain('draftNewRide');
    // its tap asks in the bar, as the bar's own button did
    first.run("$('draftNewRide').onclick ? 0 : 0; askNewPlan();");
    expect(node(first, 'draftText').textContent).toMatch(/^Start a new plan\? This clears the trip and packing choices/);
    expect(node(first, 'draftNew').textContent).toBe('Yes, clear this plan');
  });
});
