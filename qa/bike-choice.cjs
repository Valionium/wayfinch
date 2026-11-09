'use strict';
// One chosen bike for every tool (sub-project 11, group 3), the bag planner's half, on the page's own code: the page stamps its own
// record loadcheck:bikeChoice:v1 with each change of the plan's bike a rider makes here, and follows a newer choice made in Wayfinch
// when it opens (start-up, the back/forward cache), with a line and the bike-swap Undo; never on a storage event.
// tests/e2e/app-bike-choice.spec.ts runs both apps together in a real browser. Nothing here prints the page: assertions compare short
// values and booleans.
const assert=require('node:assert/strict');
const {appVM,sharedStore}=require('./app-vm.cjs');
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

const KEY='loadcheck:bikeChoice:v1',THEIRS='copilot:bikeChoice:v1';
const HOUR=3600e3;
const A={id:'bike_a',name:'Trail Bike',tyres:'tubes',frontTyre:'50-584',rearTyre:'50-584',drive:'derailleur',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'}},look:{colour:'#2563b8',bars:'flat',ebike:false}};
const B={id:'bike_b',name:'Gravel',tyres:'tubeless',frontTyre:'40-622',rearTyre:'40-622',drive:'belt',fit:{style:'compact',size:{kind:'letter',value:'L'}},look:{colour:'#c62f2a',bars:'drop',ebike:null}};
const C={id:'bike_c',name:'Commuter',fit:{style:'step-through'},look:null};
const record=(app,bikeId,ms)=>JSON.stringify({app,kind:'bike-choice',v:1,bikeId,at:new Date(ms).toISOString()});

// A page with its bikes loaded and the draft ready, as after start-up; every write to storage counted. Elements keep their classes, so
// a hidden line can be told from a shown one.
function page({plan=A,library=[A,B,C],storage=sharedStore()}={}){
  const q=appVM({storage});
  const original=q.context.document.getElementById;q.context.document.removeEventListener=()=>{};
  q.context.document.getElementById=id=>{
    const node=original(id);
    if(!node.qaClasses){
      const classes=new Set(['bikeFollowBar','bikeSwapNote','bikeSwapUndo','bikeDetailsBox','bikeDetailsBack','legalBox','walkthroughBox'].includes(id)?['hidden']:[]);
      node.qaClasses=classes;
      node.classList={add(...n){n.forEach(x=>classes.add(x));},remove(...n){n.forEach(x=>classes.delete(x));},
        contains(n){return classes.has(n);},toggle(n,f){const on=f??!classes.has(n);on?classes.add(n):classes.delete(n);return on;}};
    }
    return node;
  };
  const writes=[];
  const set=q.localStorage.setItem;
  q.localStorage.setItem=(k,v)=>{writes.push(k);set(k,v);};
  const nav=[];
  q.context.history={length:1,replaceState(...a){nav.push('history:'+a[2]);},back(){nav.push('back');}};
  Object.assign(q.context.location,{pathname:'/tools/bags/',search:'',hash:'',origin:'https://example.test',replace(h){nav.push('replace:'+h);}});
  q.context.qaPlan=JSON.stringify(plan);q.context.qaLibrary=JSON.stringify(library);
  q.run(`renderKit=()=>{};drawRig=()=>{};closeBagPop=()=>{};
    BIKE_PROFILES=JSON.parse(qaLibrary).map(normaliseBikeProfile).filter(Boolean);
    S.bikeProfile=normaliseBikeProfile(JSON.parse(qaPlan));applyTripKitDefaults();DRAFT_READY=true;
    window.localStorage.setItem(BIKE_PROFILE_CURRENT_KEY,JSON.stringify(S.bikeProfile));
    window.localStorage.setItem(BIKE_PROFILE_KEY,JSON.stringify(BIKE_PROFILES));`);
  writes.length=0;
  const json=code=>JSON.parse(q.run(`JSON.stringify(${code})`)??'null');
  const stored=key=>q.values.has(key) ? q.values.get(key) : null;
  const settle=async()=>{for(let i=0;i<4;i++){await q.run('BIKE_PROFILE_WRITES.then(()=>true)');await new Promise(r=>setTimeout(r,5));}};
  const shown=id=>!q.context.document.getElementById(id).classList.contains('hidden');
  const text=id=>q.context.document.getElementById(id).textContent;
  const mine=()=>{const v=stored(KEY);return v===null ? null : JSON.parse(v);};
  const count=k=>writes.filter(w=>w===k).length;
  return {...q,writes,nav,json,stored,settle,shown,text,mine,count};
}
const theirs=(p,bikeId,ms=Date.now())=>p.values.set(THEIRS,record('copilot',bikeId,ms));
const plan=p=>p.json('S.bikeProfile && S.bikeProfile.id');

test('[TB-PAGE-WRITES] a saved bike chosen here writes the page\'s own record once, with that id, through store.set (stamped for C-DELETE)',async()=>{
  const p=page();
  p.run("document.getElementById('bikeSavedSelect').value='bike_b'");
  await p.run('chooseSavedBike()');await p.settle();
  assert.equal(plan(p),'bike_b');
  assert.equal(p.count(KEY),1,'written once');
  const r=p.mine();
  assert.deepEqual(Object.keys(r),['app','kind','v','bikeId','at']);
  assert.deepEqual([r.app,r.kind,r.v,r.bikeId],['load-check','bike-choice',1,'bike_b']);
  assert.ok(Math.abs(Date.parse(r.at)-Date.now())<5000,'dated now');
  assert.ok(JSON.parse(p.stored('loadcheck:saved-at:v1')).keys[KEY],'stamped in the ledger, so Also delete bag planner data knows when');
  // the same bike again is no change of the plan's bike: nothing more is written
  await p.run('chooseSavedBike()');await p.settle();
  assert.equal(p.count(KEY),1,'the same bike again writes nothing');
  assert.equal(p.writes.filter(k=>k.startsWith('copilot:')).length,0,'the page never writes a copilot:* key');
});

// "Use this bike for this plan" is gone (the owner's finding H, 8 Nov 2026): a bike added from Wayfinch is the one that writes here.
test('[TB-PAGE-WRITES] a bike added from Wayfinch, a new bike and the bike cleared each write the record once with the new id; No bike is null',async()=>{
  const p=page();
  p.run("openBikeDetailsFromLink('#bike-details=new&back=you')");
  p.run("setLook({colour:'#c62f2a'})");await p.settle();
  const added=plan(p);
  assert.ok(added && !['bike_a','bike_b','bike_c'].includes(added),'a bike added from Wayfinch is the plan\'s');
  assert.equal(p.count(KEY),1);assert.equal(p.mine().bikeId,added,'the bike added');
  p.run("closeBikeDetails();openBikeDetails(null);startNewBike();document.getElementById('bikeName').value='Tourer'");
  await p.run('saveBikeProfile()');await p.settle();
  const fresh=plan(p);
  assert.ok(fresh && !['bike_a','bike_b','bike_c',added].includes(fresh),'a new bike is the plan\'s');
  assert.equal(p.count(KEY),2);assert.equal(p.mine().bikeId,fresh,'the new bike');
  await p.run('clearBikeProfile()');await p.settle();
  assert.equal(plan(p),null);
  assert.equal(p.count(KEY),3);assert.equal(p.mine().bikeId,null,'the bike cleared: No bike, the rider\'s own pick');
  assert.equal(p.writes.filter(k=>k.startsWith('copilot:')).length,0);
});

test('[TB-PAGE-WRITES] with Wayfinch\'s record dated an hour ahead (a clock set wrong), the choice here is stamped one millisecond after it',async()=>{
  const p=page();
  const ahead=Date.now()+HOUR;
  theirs(p,'bike_a',ahead);
  p.run("document.getElementById('bikeSavedSelect').value='bike_c'");
  await p.run('chooseSavedBike()');await p.settle();
  assert.equal(p.mine().at,new Date(ahead+1).toISOString());
});

test('[TB-PAGE-FOLLOWS] opening with a newer Wayfinch choice of a saved bike that is not the plan\'s: the plan moves to it through useBikeProfile, with the line; following writes no record',async()=>{
  const p=page();
  theirs(p,'bike_b');
  p.run('var qaUses=0;const qaUse=useBikeProfile;useBikeProfile=function(...a){qaUses++;return qaUse.apply(this,a);};');
  p.run('followBikeChoice()');await p.settle();
  assert.equal(p.json('qaUses'),1,'through useBikeProfile');
  assert.equal(p.run('JSON.stringify(S.bikeProfile)'),p.run("JSON.stringify(BIKE_PROFILES.find(b=>b.id==='bike_b'))"),'the saved bike, as saved');
  assert.equal(JSON.parse(p.stored('loadcheck:bikeProfile')).id,'bike_b','the plan\'s bike is stored, so a reload does not move it again');
  assert.ok(p.shown('bikeFollowBar'),'the line shows');
  assert.equal(p.text('bikeFollowText'),'Now planning for Gravel, chosen in Tools ·');
  assert.equal(p.text('bikeFollowUndo'),'Undo');
  assert.equal(p.count(KEY),0,'following writes no record');
  assert.equal(p.writes.filter(k=>k.startsWith('copilot:')).length,0,'and never a copilot:* key');
  // opening again with the same choice changes nothing more
  p.run('followBikeChoice()');
  assert.equal(p.json('qaUses'),1);
});

// "Without a bike" chosen in Tools is followed too since the owner's ruling of 7 Nov 2026 (TB-PAGE-NO-BIKE, below); it left this list then.
test('[TB-PAGE-FOLLOWS] the same bike, an older record, an unknown id or a broken record change nothing and write nothing',async()=>{
  const cases=[
    ['the same bike',p=>theirs(p,'bike_a')],
    ['an older record',p=>{theirs(p,'bike_b',Date.now()-HOUR);p.values.set(KEY,record('load-check','bike_a',Date.now()-1000));}],
    ['an unknown id',p=>theirs(p,'bike_zz')],
    ['a broken record',p=>p.values.set(THEIRS,'{"app":"copilot","kind":"bike-choice","v":2,"bikeId":"bike_b","at":"2026-11-07T00:00:00.000Z"}')],
    ['the page\'s own record naming another bike',p=>p.values.set(KEY,record('load-check','bike_b',Date.now()))],
  ];
  for(const [name,arrange] of cases){
    const p=page();
    arrange(p);
    const before=p.run('JSON.stringify([S.bikeProfile,S.kit])');
    p.run('followBikeChoice()');await p.settle();
    assert.equal(p.run('JSON.stringify([S.bikeProfile,S.kit])'),before,name+': the plan as it was');
    // the same bike: the record counts as seen, so its followed stamp (and that key's C-DELETE stamp) is written; nothing else (re-check N1)
    const allowed=name==='the same bike' ? ['loadcheck:bikeFollowed:v1','loadcheck:saved-at:v1'] : [];
    assert.deepEqual(p.writes.filter(k=>!allowed.includes(k)),[],name+': nothing written');
    assert.ok(!p.shown('bikeFollowBar'),name+': no line');
  }
});

test('[TB-PAGE-FOLLOWS] a plan with no bike moves to the chosen one too',async()=>{
  const p=page({plan:null});
  theirs(p,'bike_c');
  p.run('followBikeChoice()');await p.settle();
  assert.equal(plan(p),'bike_c');
  assert.equal(p.text('bikeFollowText'),'Now planning for Commuter, chosen in Tools ·');
});

// "Without a bike" (owner, 7 Nov 2026): a newer Wayfinch record of No bike moves the plan to the standard bike at the next open, with the
// usual line and Undo; never silent, never for a plan-only bike or a frozen draft, and nothing when the plan has no bike already.
test('[TB-PAGE-NO-BIKE] "Without a bike" chosen in Tools: the plan moves to the standard bike (no bike), with the line and Undo; following writes no record',async()=>{
  const p=page();
  theirs(p,null);
  const kit=p.run('JSON.stringify(S.kit)'),stored=p.stored('loadcheck:bikeProfile');
  assert.equal(p.run('followBikeChoice()'),true,'it moves');
  await p.settle();
  assert.equal(plan(p),null,'the plan has no bike: the standard bike is drawn');
  assert.equal(p.stored('loadcheck:bikeProfile'),'null','stored, so a reload does not move it again');
  assert.ok(p.shown('bikeFollowBar'),'never silent: the line shows');
  assert.equal(p.text('bikeFollowText'),'Now planning without a saved bike ·');
  assert.ok(p.shown('bikeFollowUndo'));
  assert.equal(p.text('bikeFollowUndo'),'Undo');
  assert.equal(p.count(KEY),0,'following writes no record');
  assert.equal(p.writes.filter(k=>k.startsWith('copilot:')).length,0);
  // opening again with the same record changes nothing more
  assert.equal(p.run('followBikeChoice()'),false);
  // Undo brings the bike back, with its kit, and the page's record names it
  p.run('undoBikeSwap()');await p.settle();
  assert.equal(plan(p),'bike_a');
  assert.equal(p.run('JSON.stringify(S.kit)'),kit,'its kit choices, byte for byte');
  assert.equal(p.stored('loadcheck:bikeProfile'),stored,'stored byte for byte');
  assert.equal(p.mine().bikeId,'bike_a');
  assert.equal(p.text('bikeFollowText'),'Back to planning for Trail Bike.');
  assert.ok(!p.shown('bikeFollowUndo'));
});

test('[TB-PAGE-NO-BIKE] nothing moves for "Without a bike" when the plan has no bike already (seen), for a plan-only bike, or while the draft is frozen',async()=>{
  const none=page({plan:null});
  theirs(none,null);
  assert.equal(none.run('followBikeChoice()'),false);await none.settle();
  assert.equal(plan(none),null);
  assert.ok(!none.shown('bikeFollowBar'),'no line: nothing changed');
  assert.ok(none.values.get('loadcheck:bikeFollowed:v1'),'the record counts as seen');
  const MINE={id:'bike_mine',name:'My bike',maxWeight:{v:120,u:'kg',includes:'bike'},maxWeightAsked:true};
  const own=page({plan:MINE});
  theirs(own,null);
  assert.equal(own.run('followBikeChoice()'),false);await own.settle();
  assert.equal(plan(own),'bike_mine','a plan-only bike is never replaced');
  const frozen=page();
  theirs(frozen,null);
  frozen.run('DRAFT_FROZEN=true');
  assert.equal(frozen.run('followBikeChoice()'),false);await frozen.settle();
  assert.equal(plan(frozen),'bike_a');
  assert.equal(frozen.writes.length,0,'nothing written');
});

// Two Bag planner tabs (found 7 Nov 2026): "Yes, clear this plan" in one tab keeps the selected bike (its own confirm text says so);
// the other tab, adopting the cleared plan, must not write "no bike" over it.
test('[LC-TABS-BIKE] a plan cleared in another tab: this tab adopts the empty plan and keeps the selected bike, in memory and stored',async()=>{
  const storage=sharedStore();
  const p=page({storage});
  p.run("adoptDraft({value:null,version:new Date().toISOString()})");await p.settle();
  assert.equal(plan(p),'bike_a','this tab keeps the bike');
  assert.equal(JSON.parse(p.stored('loadcheck:bikeProfile')).id,'bike_a','and the stored selection is not written as no bike');
  assert.equal(p.text('tabText'),'This plan was cleared in another tab, so this tab now shows an empty plan.');
});

test('[TB-PAGE-FOLLOWS] never on a storage event: a choice made in Wayfinch while the page is open moves nothing until it opens again',async()=>{
  const storage=sharedStore();
  const p=page({storage});
  const wayfinch=appVM({storage,bike:false});   // a second window on the same store: its write fires a storage event here
  wayfinch.localStorage.setItem(THEIRS,record('copilot','bike_b',Date.now()));
  await p.settle();
  assert.equal(plan(p),'bike_a','the plan never changes under the rider\'s fingers');
  assert.ok(!p.shown('bikeFollowBar'));
  // back from the back/forward cache is opening again; a fresh pageshow (persisted false) is the start-up's, which follows by itself
  for(const cb of p.listeners.pageshow||[])cb({type:'pageshow',persisted:false});
  await p.settle();
  assert.equal(plan(p),'bike_a','a pageshow that is not a restore does nothing here');
  for(const cb of p.listeners.pageshow||[])cb({type:'pageshow',persisted:true});
  await p.settle();
  assert.equal(plan(p),'bike_b','restored from the cache, it follows');
  assert.ok(p.shown('bikeFollowBar'));
  // and by the source: the follow is called only at start-up and from pageshow
  const calls=[...p.script.matchAll(/(?<!function )followBikeChoice\(\)/g)].length;
  assert.equal(calls,2,'two calls: start-up and pageshow');
  const init=p.html.slice(p.html.indexOf('/* ==== 95-init.js ==== */'));
  const start=init.indexOf('(async () => {'),ready=init.indexOf('DRAFT_READY = true',start),restored=init.indexOf('restorePlan(savedDraft',start),follow=init.indexOf('followBikeChoice()',start);
  assert.ok(start>0 && restored>start && ready>restored && follow>ready,'at start-up, after the draft is restored and the bikes are loaded');
  assert.ok(/addEventListener\('pageshow',\s*(?:event|e)\s*=>\s*\{[^}]*persisted[^}]*followBikeChoice\(\)/.test(p.script),'pageshow follows only a restore from the cache');
});

test('[TB-PAGE-UNDO] Undo is the bike-swap Undo: the plan\'s bike and its kit choices come back byte for byte, and the page\'s record names that bike',async()=>{
  const p=page();
  const ahead=Date.now()+HOUR;   // Wayfinch's record even dated ahead: the Undo still wins
  theirs(p,'bike_b',ahead);
  const bike=p.run('JSON.stringify(S.bikeProfile)'),kit=p.run('JSON.stringify(S.kit)'),touched=p.run('JSON.stringify(S.kitTouched)'),stored=p.stored('loadcheck:bikeProfile');
  p.run('followBikeChoice()');await p.settle();
  assert.notEqual(p.run('JSON.stringify(S.kit)'),kit,'the move set the other bike\'s starting kit (tubeless, belt)');
  assert.equal(p.json('liveBikeSwap().prev.id'),'bike_a','the Undo is the swap path');
  assert.ok(/\$\('bikeFollowUndo'\)\.onclick=\(\)=>\{?undoBikeSwap\(\)/.test(p.script),'the line\'s Undo calls undoBikeSwap, not a copy');
  p.run('undoBikeSwap()');await p.settle();
  assert.equal(p.run('JSON.stringify(S.bikeProfile)'),bike,'the plan\'s bike, byte for byte');
  assert.equal(p.run('JSON.stringify(S.kit)'),kit,'its kit choices, byte for byte');
  assert.equal(p.run('JSON.stringify(S.kitTouched)'),touched);
  assert.equal(p.stored('loadcheck:bikeProfile'),stored,'stored byte for byte');
  const r=p.mine();
  assert.equal(r.bikeId,'bike_a','the page\'s record names the bike brought back');
  assert.equal(r.at,new Date(ahead+1).toISOString(),'stamped after Wayfinch\'s, so it is the newer');
  assert.equal(p.count(KEY),1);
  assert.equal(p.text('bikeFollowText'),'Back to planning for Trail Bike.');
  assert.ok(!p.shown('bikeFollowUndo'),'and no second Undo');
  // opening again does not move it back
  p.run('followBikeChoice()');await p.settle();
  assert.equal(plan(p),'bike_a');
});

test('[TB-PAGE-UNDO] Undo after a plan with no bike was moved goes back to no bike, and the page\'s record says No bike',async()=>{
  const p=page({plan:null});
  theirs(p,'bike_b');
  p.run('followBikeChoice()');await p.settle();
  p.run('undoBikeSwap()');await p.settle();
  assert.equal(plan(p),null);
  assert.equal(p.mine().bikeId,null,'No bike, as the plan was');
  assert.equal(p.text('bikeFollowText'),'Back to planning without a bike.');
});

test('[TB-PAGE-BACKS] back=care returns to /#/tools/care, back=advisor to the Gear advisor\'s address in this page; any other value still means You',()=>{
  const cases=[['care','/#/tools/care','Back to Bike care'],['advisor','/tools/bags/#gear-advisor','Back to the Gear advisor'],['nonsense','/#/you','Back to You'],['tyre','/#/tools/tyre','Back to Tyre pressure']];
  for(const [back,href,words] of cases){
    const p=page();
    p.run(`openBikeDetailsFromLink('#bike-details=bike_a&back=${back}')`);
    const link=p.context.document.getElementById('bikeDetailsBack');
    assert.equal(link.href,href,back);
    assert.equal(link.textContent,words,back);
    // "← Back to Wayfinch" at the top goes to Wayfinch: the screen named, or Tools (its default) when the way back is in this page
    assert.equal(p.context.document.getElementById('backToWayfinch').href??'',back==='advisor' ? '' : href,back+': the top link');
  }
  // The advisor is in this page: its way back never steps back into Wayfinch's history, even when Wayfinch opened the page.
  const p=page();
  p.context.document.referrer='https://example.test/';p.context.history.length=3;
  p.run("returnToWayfinch('/tools/bags/#gear-advisor')");
  assert.deepEqual(p.nav,['replace:/tools/bags/#gear-advisor']);
  const q=page();
  q.context.document.referrer='https://example.test/';q.context.history.length=3;
  q.run("returnToWayfinch('/#/tools/care')");
  assert.deepEqual(q.nav,['back'],'Bike care is in Wayfinch: one step back, as for the other screens');
  // Review of PR 56, I2: the page stays after the advisor's way back, so a later way back still goes (Back to Wayfinch, another link)
  p.run("returnToWayfinch('/#/tools')");
  assert.deepEqual(p.nav,['replace:/tools/bags/#gear-advisor','back'],'a later way back to Wayfinch still navigates');
});

// ---- Review of PR 56 (coordinator's ruling on I1, I3, M1): every change of the plan's bike made here writes the page's record; a Wayfinch
// record is followed at most once; a plan-only bike is never lost; a Bike details link and a frozen draft never follow. ----
const setupFor=(p,bike,id)=>p.run(`(()=>{const keep=S.bikeProfile;S.bikeProfile=normaliseBikeProfile(${JSON.stringify(bike)});
  SETUPS=[...SETUPS,{...capturePlan(),id:${JSON.stringify(id)},name:'Setup '+${JSON.stringify(id)}}];S.bikeProfile=keep;})()`);

test('[TB-PAGE-WRITES] every other way the plan\'s bike changes here writes the page\'s record: a saved setup loaded, an imported working plan, a plan-only "My bike"',async()=>{
  const p=page({plan:B});
  setupFor(p,A,'st_a');
  p.run("loadSetup('st_a')");await p.settle();
  assert.equal(plan(p),'bike_a');
  assert.equal(p.mine()?.bikeId,'bike_a','a setup loaded for another bike');
  p.run(`IMPORTED_DRAFT={...captureDraft(),bikeProfile:normaliseBikeProfile(${JSON.stringify(C)})};useImportedDraft()`);await p.settle();
  assert.equal(plan(p),'bike_c');
  assert.equal(p.mine()?.bikeId,'bike_c','an imported working plan');
  const q=page({plan:null});
  await q.run("rememberMaxWeight({maxWeight:{v:120,u:'kg',includes:'bike'},maxWeightAsked:true})");await q.settle();
  const mine=plan(q);
  assert.ok(mine && !['bike_a','bike_b','bike_c'].includes(mine),'a plan-only bike');
  assert.equal(q.mine()?.bikeId,mine,'its id is the page\'s choice');
  assert.equal(p.writes.filter(k=>k.startsWith('copilot:')).length+q.writes.filter(k=>k.startsWith('copilot:')).length,0);
});

test('[TB-PAGE-FOLLOWS] P1: a day-old Tools choice, followed once, does not move the plan again after a setup for another bike is loaded and the page reopens',async()=>{
  const storage=sharedStore();
  const p=page({storage});
  theirs(p,'bike_b',Date.now()-24*HOUR);
  p.run('followBikeChoice()');await p.settle();
  assert.equal(plan(p),'bike_b','followed once');
  setupFor(p,A,'st_alps');
  p.run("loadSetup('st_alps')");await p.settle();
  assert.equal(plan(p),'bike_a');
  // the page opens again, on the plan as it was saved
  const again=page({storage,plan:A});
  const kit=again.run('JSON.stringify(S.kit)');
  again.run('followBikeChoice()');await again.settle();
  assert.equal(plan(again),'bike_a','the plan stays on the setup\'s bike');
  assert.equal(again.run('JSON.stringify(S.kit)'),kit,'its kit unchanged');
  assert.ok(!again.shown('bikeFollowBar'),'no line');
});

test('[TB-PAGE-FOLLOWS] a Wayfinch record is followed at most once: the stamp acted on is remembered (stamped for C-DELETE), so a change no record shows (an older tab) is never undone by it',async()=>{
  const storage=sharedStore();
  const p=page({storage});
  const at=Date.now()-24*HOUR;
  theirs(p,'bike_b',at);
  p.run('followBikeChoice()');await p.settle();
  assert.equal(plan(p),'bike_b');
  const seen=p.values.get('loadcheck:bikeFollowed:v1');
  assert.ok(seen && JSON.parse(seen).at===new Date(at).toISOString(),'the stamp it acted on, in the page\'s own key');
  assert.ok(JSON.parse(p.stored('loadcheck:saved-at:v1')).keys['loadcheck:bikeFollowed:v1'],'stamped for C-DELETE');
  // an older tab, which writes no record, put the plan back on A; the page opens again
  const again=page({storage,plan:A});
  again.run('followBikeChoice()');await again.settle();
  assert.equal(plan(again),'bike_a','the same record never moves the plan twice');
  // a newer choice in Tools is followed again
  theirs(again,'bike_c',Date.now());
  again.run('followBikeChoice()');await again.settle();
  assert.equal(plan(again),'bike_c');
});

// Re-check of PR 56, N1 (coordinator's ruling): a Wayfinch record naming the plan's own bike counts as seen too.
test('[TB-PAGE-FOLLOWS] N1: a Wayfinch record naming the plan\'s own bike counts as seen: an older tab\'s later move to another bike is never undone by it',async()=>{
  const storage=sharedStore();
  const p=page({storage});
  const at=Date.now()-24*HOUR;
  p.values.set(KEY,record('load-check','bike_a',at-HOUR));   // the page's own record, older
  theirs(p,'bike_a',at);                                      // Tools picked A yesterday, while the plan was on A
  p.run('followBikeChoice()');await p.settle();
  assert.equal(plan(p),'bike_a');
  const seen=p.values.get('loadcheck:bikeFollowed:v1');
  assert.ok(seen && JSON.parse(seen).at===new Date(at).toISOString(),'seen: the followed stamp is that record\'s');
  assert.ok(!p.shown('bikeFollowBar'));
  assert.deepEqual(p.writes.filter(k=>!['loadcheck:bikeFollowed:v1','loadcheck:saved-at:v1'].includes(k)),[],'nothing else written');
  // an older tab moves the plan to the saved bike B and writes no record; the page opens again
  const again=page({storage,plan:B});
  again.run('followBikeChoice()');await again.settle();
  assert.equal(plan(again),'bike_b','the plan stays on B');
  assert.ok(!again.shown('bikeFollowBar'),'no line');
  assert.equal(again.writes.length,0,'nothing written');
});

test('[TB-PAGE-FOLLOWS] P4: a plan-only bike is never lost by a follow, and survives a reload',async()=>{
  const storage=sharedStore();
  const MINE={id:'bike_mine',name:'My bike',maxWeight:{v:120,u:'kg',includes:'bike'},maxWeightAsked:true};
  const p=page({storage,plan:MINE});
  theirs(p,'bike_b',Date.now()-24*HOUR);
  p.run('followBikeChoice()');await p.settle();
  assert.equal(plan(p),'bike_mine','the plan keeps its own bike');
  assert.ok(!p.shown('bikeFollowBar'));
  const again=page({storage,plan:JSON.parse(p.stored('loadcheck:bikeProfile'))});
  again.run('followBikeChoice()');await again.settle();
  assert.equal(plan(again),'bike_mine','after a reload too');
});

test('[TB-PAGE-FOLLOWS] M1: never while the draft is frozen by another tab\'s change; nothing written',async()=>{
  const p=page();
  theirs(p,'bike_b');
  p.run('DRAFT_FROZEN=true');
  assert.equal(p.run('followBikeChoice()'),false);
  await p.settle();
  assert.equal(plan(p),'bike_a');
  assert.equal(p.writes.length,0);
});

test('[TB-PAGE-FOLLOWS] I3: a visit through a Bike details link never follows; start-up follows only when no link was opened',()=>{
  const p=page();
  const init=p.html.slice(p.html.indexOf('/* ==== 95-init.js ==== */'));
  const start=init.indexOf('(async () => {');
  const link=init.indexOf('openBikeDetailsFromLink()',start),follow=init.indexOf('followBikeChoice()',start);
  assert.ok(link>start && follow>link,'the link is handled first');
  assert.ok(/if\(\s*!\s*(\w+)\s*\)\s*followBikeChoice\(\)/.test(init.slice(link,follow+20)),'and the follow runs only when it opened nothing');
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} bike-choice tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
