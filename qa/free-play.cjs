'use strict';
// Free play without Trip's route (the owner's wish 3; design of 14 Nov 2026, 2026-11-14-bag-planner-free-play-design.md), on the
// page's own code: the line that offers it, the copy without the route, nothing of the trip's plan written, Back byte for byte,
// a new setup only on the rider's tap, and what waits. tests/e2e/app-free-play.spec.ts runs it in a real browser with a real
// handoff. Nothing here prints the page: assertions compare short values and booleans.
const assert=require('node:assert/strict');
const {appVM,sharedStore}=require('./app-vm.cjs');
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
const HASH='ab'.repeat(32);
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// A page with the trip's plan saved, as after "Plan bags for this trip": three bags, a bike, 2 nights, the route from Trip (its hash),
// at Bags, with a saved setup and two saved bikes. Every write and removal in storage is counted.
async function page({route=true,storage=sharedStore()}={}){
  const p=appVM({storage});
  p.context.document.removeEventListener=()=>{};
  const writes=[];
  const set=p.localStorage.setItem,remove=p.localStorage.removeItem;
  p.localStorage.setItem=(k,v)=>{writes.push(k);set(k,v);};
  p.localStorage.removeItem=k=>{writes.push(k);remove(k);};
  p.context.qaHash=route ? HASH : null;
  // go(n), the step change, is in the page's start-up part, which the VM leaves out: here it only sets the step
  p.run(`renderKit=()=>{};drawRig=()=>{};renderBags=()=>{};renderClimate=()=>{};closeBagPop=()=>{};go=n=>{S.step=n;};buildThumb=()=>'';
    BIKE_PROFILES=[normaliseBikeProfile({id:'bike_fp',name:'Tourer'}),normaliseBikeProfile({id:'bike_two',name:'Gravel'})];
    S.bikeProfile=BIKE_PROFILES[0];
    S.bags=[{uid:1,pos:'seat',L:14},{uid:2,pos:'frame',L:6},{uid:3,pos:'bar',L:12}];S.nextUid=4;
    S.nights=2;S.sleep='camp';S.month=5;S.departureDate='2026-06-12';applyTripKitDefaults();
    S.gpx=normaliseGPX({pts:[{lat:49,lon:8,elev:100,t:0,km:0},{lat:49.01,lon:8,elev:110,t:1,km:1.1119492664455877}],km:1.1,ascent:10,
      elevationSource:'file',hadElev:true,...(qaHash ? {copilotRoute:qaHash} : {})});
    S.step=2;restorePlan(captureDraft(),true,false);DRAFT_READY=true;
    SETUPS=[normaliseSetup({...snapshotSetup('Last summer',''),thumb:''})];`);
  await p.run(`(async()=>{await store.set(SETUP_KEY,SETUPS);await store.set(BIKE_PROFILE_KEY,BIKE_PROFILES);
    await store.set(BIKE_PROFILE_CURRENT_KEY,S.bikeProfile);await noteBikeChoicePage(S.bikeProfile.id);await flushDraft();writeLoadSummary(true);})()`);
  writes.length=0;
  const json=code=>JSON.parse(p.run(`JSON.stringify(${code})`)??'null');
  const el=id=>p.run(`$('${id}')`);
  // the bars whose showing the tests read keep their classes, as a browser does (the VM's elements keep none); all start hidden
  for(const id of ['weatherBar','weatherUndo','draftBar','handoffBar']){
    const set=new Set(['hidden']);
    el(id).classList={add:(...c)=>c.forEach(x=>set.add(x)),remove:(...c)=>c.forEach(x=>set.delete(x)),contains:c=>set.has(c),
      toggle:(c,f)=>{const on=f===undefined ? !set.has(c) : !!f;if(on)set.add(c);else set.delete(c);return on;}};
  }
  return {...p,writes,json,el};
}
const shown=(p,id)=>!p.el(id).classList.contains('hidden');
// What holds the trip's plan and what Wayfinch reads of it: the draft, the summary, the plan's bike, the bike choice, the setups, the bikes.
const PLAN_KEYS=['loadcheck:draft','loadcheck:draft:local-meta','loadcheck:summary:v1','loadcheck:bikeProfile','loadcheck:bikeChoice:v1',
  'loadcheck:bikeFollowed:v1','loadcheck:setups','loadcheck:setups-more:v1','loadcheck:setup-marks:v1','loadcheck:bikeProfiles','loadcheck:handoff-done'];
// What is no plan and may be written as always: the climate and place caches, and their stamps (C-DELETE's ledger).
const NOT_PLAN=['loadcheck:climate','loadcheck:places','loadcheck:saved-at:v1'];
// Those values as stored (raw strings), and their stamps in the ledger.
const stored=p=>{
  let ledger={};try{ledger=JSON.parse(p.values.get('loadcheck:saved-at:v1')||'{}');}catch(e){}
  return JSON.stringify([PLAN_KEYS.map(k=>[k,p.values.get(k)??null]),PLAN_KEYS.map(k=>[k,ledger[k]??null])]);
};
const planWrites=p=>p.writes.filter(k=>!NOT_PLAN.includes(k));
const draft=p=>p.run('JSON.stringify(captureDraft())');

test('[FP-OFFER] the line offers free play only while the plan open is the trip\'s (it carries Trip\'s route hash), in the full planner, with nothing else under way',async()=>{
  const p=await page();
  assert.equal(p.json('freePlayOffered()'),true);
  p.run('renderFreePlayBar()');
  assert.equal(p.el('freePlayBar').hidden,false,'the line shows');
  assert.equal(p.el('freePlayText').textContent,'This is your trip\'s plan, with the route from Trip.');
  assert.equal(p.el('freePlayStart').hidden,false);
  assert.equal(p.el('freePlayStart').textContent,'Try other bags freely');
  assert.equal(p.el('freePlayBack').hidden,true,'no Back before free play');
  assert.equal(p.el('freePlaySave').hidden,true,'no Save before free play');
  // not while the small view shows, a trial bag is tried, another tab's plan waits, or the draft is not read yet; nor while a trip from
  // Wayfinch waits for the rider's answer, its route goes in, or Plan bags for this trip is making the plan (review of PR 146, C1)
  for(const [on,off] of [['SMALL_VIEW=true','SMALL_VIEW=false'],['TRIAL={before:{bags:[]},uids:[]}','TRIAL=null'],['DRAFT_FROZEN=true','DRAFT_FROZEN=false'],['DRAFT_READY=false','DRAFT_READY=true'],
    ['TRIP_BAGS.hold=true','TRIP_BAGS.hold=false'],['HANDOFF.busy=true','HANDOFF.busy=false'],['WEIGHT_PROMPT_BLOCKS.handoffBar=true','WEIGHT_PROMPT_BLOCKS.handoffBar=false']]){
    p.run(on);
    assert.equal(p.json('freePlayOffered()'),false,on);
    p.run('renderFreePlayBar()');
    assert.equal(p.el('freePlayBar').hidden,true,on+': no line');
    assert.equal(await p.run('startFreePlay()'),false,on+': nor by hand');
    assert.equal(p.json('FREE_PLAY'),null,on);
    p.run(off);
  }
  // the end of the wait draws the line again: Plan bags' bar changes, and with it the line
  p.run('TRIP_BAGS.hold=true;renderFreePlayBar();TRIP_BAGS.hold=false;showHandoffBar("Planned.",{undo:true})');
  assert.equal(p.el('freePlayBar').hidden,false,'shown again once the plan is made');
  // a plan that never came from Trip has no trip's plan to keep: no line
  const q=await page({route:false});
  assert.equal(q.json('freePlayOffered()'),false);
  q.run('renderFreePlayBar()');
  assert.equal(q.el('freePlayBar').hidden,true);
  // the line follows the plan: it is drawn again with every change the page saves
  q.run(`S.gpx.copilotRoute='${HASH}';queueDraftSave()`);
  assert.equal(q.el('freePlayBar').hidden,false,'the route from Trip came in: the line shows');
});

test('[FP-START] free play starts from a copy of the plan open now without Trip\'s route, and says that the trip\'s plan is not changed',async()=>{
  const p=await page();
  const before=p.json('captureDraft()');
  assert.equal(await p.run('startFreePlay()'),true);
  assert.ok(p.json('FREE_PLAY'),'free play is on');
  const now=p.json('captureDraft()');
  assert.equal(now.gpx,null,'Trip\'s route is left out');
  assert.equal(now.trip.place,null);assert.equal(now.trip.place2,null);
  for(const k of ['bags','decks','kit','qty','custom','mode','bikeProfile','step'])assert.deepEqual(now[k],before[k],k+' as in the trip\'s plan');
  for(const k of ['nights','month','departureDate','sleep','pace'])assert.deepEqual(now.trip[k],before.trip[k],k+' as in the trip\'s plan');
  assert.equal(p.el('freePlayBar').hidden,false);
  assert.equal(p.el('freePlayHead').textContent,'Free play — your trip\'s plan is not changed.');
  assert.equal(p.el('freePlayText').textContent,'Nothing here is kept unless you save it as a new setup. A reload ends free play.');
  for(const n of [1,2])assert.notEqual(p.el('geoStatus'+n).textContent,'Track place cleared.','no line that reads as if the trip\'s place went (review of PR 146, M3)');
  assert.equal(p.el('freePlayBack').hidden,false);assert.equal(p.el('freePlayBack').textContent,'Back to the trip\'s plan');
  assert.equal(p.el('freePlaySave').hidden,false);assert.equal(p.el('freePlaySave').textContent,'Save as a new setup');
  assert.equal(p.el('freePlayStart').hidden,true);
  assert.equal(p.run('draftSaveNote()'),'Free play: this plan is not saved. Your trip\'s plan is not changed.');
  assert.equal(await p.run('startFreePlay()'),false,'never a second free play on top of one');
  assert.deepEqual(planWrites(p),[],'starting writes nothing');
});

test('[FP-NO-WRITE] in free play nothing of the trip\'s plan is written: no draft (also not by a hidden or closing tab), no load summary, no plan\'s bike, no setup',async()=>{
  const p=await page();
  const was=stored(p);
  await p.run('startFreePlay()');
  // the rider changes bags and kit, packs a tick, picks another saved bike and No bike, opens a saved setup and another route
  await p.run(`(async()=>{
    S.bags.push({uid:S.nextUid++,pos:'top',slot:'front',L:1.5});S.bags[0].L=10;S.bags[0].userL=true;
    S.kit[Object.keys(S.kit)[0]]=!S.kit[Object.keys(S.kit)[0]];S.packed={x:true};S.nights=4;queueDraftSave();
    $('bikeSavedSelect').value='bike_two';await chooseSavedBike();await clearBikeProfile();
    loadSetup(SETUPS[0].id);
    S.gpx=normaliseGPX({pts:[{lat:48,lon:7,elev:100,t:0,km:0},{lat:48.01,lon:7,elev:110,t:1,km:1.1119492664455877}],km:1.1,ascent:10,elevationSource:'file',hadElev:true});
    queueDraftSave();
  })()`);
  await wait(400);
  await p.run('flushDraft()');           // a hidden or closing tab
  p.run('writeLoadSummary();writeLoadSummary(true);');
  await p.run('noteBikeChoicePage("bike_two")');
  await p.run('persistBikeProfileSelection()');
  await wait(50);
  assert.deepEqual(planWrites(p),[],'nothing written or removed');
  assert.ok(stored(p)===was,'every stored value byte for byte as before');
});

test('[FP-BACK] Back to the trip\'s plan puts back exactly the plan of before, at its step, and writes nothing then either',async()=>{
  const p=await page();
  p.run('BALANCE.checked="as-checked";BALANCE.undone=new Set(["tent"]);HANDLING.last={kind:"x"};');
  const before=draft(p),was=stored(p);
  await p.run('startFreePlay()');
  await p.run(`(async()=>{S.bags.push({uid:S.nextUid++,pos:'top',slot:'front',L:1.5});S.mode='light';S.step=4;
    $('bikeSavedSelect').value='bike_two';await chooseSavedBike();queueDraftSave();})()`);
  await wait(400);
  assert.equal(p.run('endFreePlay()'),true);
  assert.equal(p.json('FREE_PLAY'),null,'free play is over');
  assert.ok(draft(p)===before,'the plan of before, byte for byte');
  assert.equal(p.json('S.step'),2,'at the step it was on');
  assert.equal(p.json('S.gpx.copilotRoute'),HASH,'with Trip\'s route');
  assert.deepEqual(p.json('[BALANCE.checked,[...BALANCE.undone],HANDLING.last]'),['as-checked',['tent'],{kind:'x'}],'the balancing remembers what it did, as before');
  // the line offers free play again and says where the rider is
  assert.equal(p.el('freePlayBar').hidden,false);
  assert.equal(p.el('freePlayStart').hidden,false);
  assert.equal(p.el('freePlayBack').hidden,true);
  assert.equal(p.el('freePlayText').textContent,'Back to your trip\'s plan, as it was.');
  assert.equal(p.run('endFreePlay()'),false,'no second Back');
  p.run('queueDraftSave()');await wait(400);await p.run('flushDraft()');
  assert.deepEqual(planWrites(p),[],'nothing written after Back');
  assert.ok(stored(p)===was,'every stored value byte for byte as before');
  // and the page saves the trip's plan again as usual once the rider changes it
  p.run('S.bags[0].L=9;S.bags[0].userL=true;queueDraftSave()');await wait(400);
  assert.ok(p.writes.includes('loadcheck:draft'),'an ordinary change is saved again');
});

test('[FP-BACK] another tab\'s change to the trip\'s plan never lands on free play; Back takes the newer plan, as from any other tab',async()=>{
  const storage=sharedStore(),p=await page({storage}),other=appVM({storage});
  await p.run('startFreePlay()');
  const play=draft(p);
  // the other tab saves the trip's plan with a fourth bag, a little later
  const newer={...JSON.parse(storage.values.get('loadcheck:draft'))};
  newer.bags=[...newer.bags,{uid:9,pos:'top',slot:'front',L:1}];newer.nextUid=10;newer.updatedAt=new Date(Date.now()+1000).toISOString();
  other.localStorage.setItem('loadcheck:draft',JSON.stringify(newer));
  p.run('checkOtherTabs()');
  assert.ok(draft(p)===play,'free play is left as it was');
  assert.ok(p.json('FREE_PLAY'),'and stays on');
  p.run('endFreePlay()');
  assert.equal(p.json('S.bags.length'),4,'Back opens the newer plan');
  assert.equal(p.el('tabText').textContent,'Updated from another tab.');
  assert.equal(p.json('DRAFT_FROZEN'),false);
});

test('[FP-BACK] the trip\'s weather line and its Undo wait during free play and come back exactly at Back, where Undo still works; the restored-plan bar and the place lines come back too (review of PR 146, I1, M1, M3)',async()=>{
  const p=await page();
  // the trip's plan has a weather line with its Undo (one kit item the measured weather changed), the restored-plan bar, place lines
  const id=p.json('Object.keys(S.kit).find(k=>kitById(k))');
  p.context.qaId=id;
  p.run(`WEATHER_KIT.undo={ids:[qaId],kit:{...S.kit,[qaId]:!S.kit[qaId]},touched:{...S.kitTouched},placements:S.placements,after:weatherKitKey()};
    showWeatherBar('Measured weather for June came in: something added.',true);$('draftBar').classList.remove('hidden');
    $('geoStatus1').textContent='Heidelberg found.';$('geoStatus2').textContent='Strasbourg found.';`);
  const undo=p.run('JSON.stringify(WEATHER_KIT.undo)'),kit=p.run('JSON.stringify(S.kit)');
  await p.run('startFreePlay()');
  assert.equal(shown(p,'weatherBar'),false,'the trip\'s weather line waits');
  assert.equal(shown(p,'draftBar'),false);
  assert.equal(p.json('WEATHER_KIT.undo'),null,'its Undo is not free play\'s');
  assert.equal(p.run('undoWeatherKit()'),false,'so nothing of free play is undone by it');
  assert.equal(p.run('JSON.stringify(S.kit)'),kit);
  // the measured weather landing in free play changes nothing of free play's kit and waits for the trip's plan
  p.run('S.kitTouched={};S.month=11;');
  const playKit=p.run('JSON.stringify(S.kit)');
  assert.equal(p.run('climateKitFollows()'),false);
  assert.equal(p.run('JSON.stringify(S.kit)'),playKit,'free play\'s kit as it was');
  assert.equal(shown(p,'weatherBar'),false,'and no line of free play\'s');
  let follows=0;p.context.qaFollows=()=>{follows++;return false;};
  p.run('climateKitFollows=qaFollows');   // the landing that waited is taken in once the trip's plan is back
  p.run('endFreePlay()');
  assert.equal(follows,1,'the weather that landed in free play is taken into the trip\'s plan at Back');
  assert.equal(p.run('JSON.stringify(WEATHER_KIT.undo)'),undo,'the trip\'s weather Undo as it was');
  assert.equal(shown(p,'weatherBar'),true);assert.equal(shown(p,'weatherUndo'),true);
  assert.equal(p.el('weatherText').textContent,'Measured weather for June came in: something added.');
  assert.equal(shown(p,'draftBar'),true,'the restored-plan bar is back');
  assert.equal(p.el('geoStatus1').textContent,'Heidelberg found.');assert.equal(p.el('geoStatus2').textContent,'Strasbourg found.');
  assert.equal(p.run('undoWeatherKit()'),true,'and the trip\'s weather Undo still works');
  assert.equal(p.json(`S.kit[qaId]`),!JSON.parse(kit)[id]);
});

test('[FP-SAVE] only the rider\'s tap saves free play, as one new setup with no trip link; the setups of before and the trip\'s plan stay byte for byte',async()=>{
  const p=await page();
  const setups=p.run('JSON.stringify(storedSetupsLocal())'),draftRaw=p.values.get('loadcheck:draft'),summary=p.values.get('loadcheck:summary:v1');
  await p.run('startFreePlay()');
  p.run('S.bags.push({uid:S.nextUid++,pos:"top",slot:"front",L:1.5});queueDraftSave()');
  await wait(400);
  assert.equal(p.run('JSON.stringify(storedSetupsLocal())'),setups,'no setup saved without the tap');
  const bags=p.json('S.bags');
  assert.equal(await p.run('saveFreePlay()'),true);
  const now=p.json('storedSetupsLocal()'),was=JSON.parse(setups);
  assert.equal(now.length,was.length+1,'one new setup');
  assert.match(now[0].name,/^Free play, \d{1,2} [A-Z][a-z]{2}$/,'named by the day');
  assert.equal(now[0].forRoute,undefined,'no trip link: Trip never takes it for the trip\'s setup');
  assert.equal(now[0].gpx,null,'and no route of Trip\'s');
  assert.deepEqual(now[0].bags,bags,'it holds the free-play bags');
  assert.equal(JSON.stringify(now.slice(1)),JSON.stringify(was),'every setup of before byte for byte');
  assert.equal(p.values.get('loadcheck:draft'),draftRaw,'the trip\'s plan is not touched');
  assert.equal(p.values.get('loadcheck:summary:v1'),summary,'nor the summary Tools and Trip read');
  assert.ok(p.json('FREE_PLAY'),'free play goes on');
  assert.equal(p.el('freePlayText').textContent,`Saved as a new setup: ${now[0].name}. Nothing else here is kept.`);
  assert.ok(p.writes.every(k=>['loadcheck:setups','loadcheck:setups-more:v1','loadcheck:setup-marks:v1','loadcheck:saved-at:v1'].includes(k)),'only the setup lists and their stamps are written');
  p.run('endFreePlay()');
  assert.equal(await p.run('saveFreePlay()'),false,'nothing to save outside free play');
});

test('[FP-WAITS] during free play a setup is never updated, and Export, Import, Start a new plan, an update and the weight-limit question wait, each saying why; nothing is written',async()=>{
  const p=await page();
  const was=stored(p);
  const exportText=p.run('exportAll()');
  await p.run('startFreePlay()');
  const id=p.json('SETUPS[0].id');
  assert.equal(p.run(`startSetupAction('${id}','update')`),false,'no Update of a saved setup');
  assert.equal(p.run('SAVE_MESSAGE'),'In free play a saved setup is not updated. Save as a new setup instead.');
  p.run(`SETUP_ACTION={kind:'update',id:'${id}',snapshot:snapshotSetup('x','')}`);
  assert.equal(await p.run(`confirmSetupUpdate('${id}')`),false);
  assert.equal(p.run('exportPlanFile()'),false,'no Export');
  assert.equal(p.el('impMsg').textContent,'In free play nothing is exported. Tap Back to the trip\'s plan first.');
  assert.equal(await p.run(`importAll(${JSON.stringify(exportText)})`),'In free play nothing is imported. Tap Back to the trip\'s plan first.');
  await p.run("$('draftNew').onclick()");
  assert.equal(p.el('draftText').textContent,'In free play the trip\'s plan is not cleared. Tap Back to the trip\'s plan first.');
  assert.equal(p.json('DRAFT_READY'),true);
  p.run('UPDATE_STATE.registration={waiting:{}}');
  await p.run('applyUpdate()');
  assert.equal(p.json('UPDATE_STATE.applying'),false,'the update waits');
  assert.equal(p.run('UPDATE_STATE.note'),'The update reloads the page, which ends free play: it waits until you tap Back to the trip\'s plan.');
  assert.equal(p.json('weightPromptBlocked()'),true,'the question of the weight limit waits too: free play saves no answer');
  // a weight limit given in free play is free play's bike's only: no saved bike, no Skip remembered (review of PR 146, I2)
  const bikes=p.run('JSON.stringify(BIKE_PROFILES)');
  await p.run(`rememberMaxWeight({maxWeight:{v:130,u:'kg',includes:'bike'},maxWeightAsked:true})`);
  assert.deepEqual(p.json('S.bikeProfile.maxWeight'),{v:130,u:'kg',includes:'bike'},'free play\'s bike has it');
  assert.equal(p.run('JSON.stringify(BIKE_PROFILES)'),bikes,'the saved bikes do not');
  await p.run('S.bikeProfile=null;rememberMaxWeight({maxWeightAsked:true})');
  assert.equal(p.json('MAX_WEIGHT_SKIPPED'),false,'Skip without a bike is not remembered');
  // a colour on the plan's bike is free play's; a saved bike is not changed in free play, and its saves wait with a line
  p.run(`S.bikeProfile=normaliseBikeProfile(JSON.parse(JSON.stringify(BIKE_PROFILES[0])));BIKE_PROFILE_EDITOR_ID=S.bikeProfile.id;writeLook({colour:'#aa3311'})`);
  assert.equal(p.json('S.bikeProfile.look.colour'),'#aa3311');
  assert.equal(p.run('JSON.stringify(BIKE_PROFILES)'),bikes,'the saved bike keeps its look');
  p.run(`BIKE_PROFILE_EDITOR_ID='bike_two';writeLook({colour:'#113355'})`);
  assert.equal(p.run('JSON.stringify(BIKE_PROFILES)'),bikes,'a saved bike shown alone is not changed either');
  for(const call of ['saveBikeProfile()','removeSavedBike()','saveShownBike()']){
    p.run('BIKE_PROFILE_MESSAGE=""');
    assert.equal(await p.run(call),false,call+' waits');
    assert.equal(p.run('BIKE_PROFILE_MESSAGE'),'In free play your saved bikes are not changed. Tap Back to the trip\'s plan to save a bike.',call);
  }
  assert.equal(await p.run('bikeStoreSet(BIKE_PROFILE_KEY,BIKE_PROFILES)'),false,'and nothing reaches the saved bikes by any other way');
  assert.equal(p.run('JSON.stringify(BIKE_PROFILES)'),bikes);
  // a copy of the reports or any export carries the trip's plan as the working plan, never free play's (review of PR 146, M4)
  p.run('S.bags.push({uid:S.nextUid++,pos:"top",slot:"front",L:1.5})');
  const ex=JSON.parse(p.run('exportAll()'));delete ex.draft.updatedAt;
  assert.ok(JSON.stringify(ex.draft)===p.run('FREE_PLAY.plan'),'the export\'s working plan is the trip\'s');
  // a rename is no plan: it still works
  assert.equal(p.run(`startSetupAction('${id}','rename')`),true);
  await wait(50);
  assert.deepEqual(planWrites(p),[],'nothing written');
  assert.ok(stored(p)===was,'every stored value as before');
  p.run('endFreePlay()');
  assert.equal(p.run('JSON.stringify(BIKE_PROFILES)'),bikes,'after Back the saved bikes are the stored ones');
  assert.equal(p.run('freePlayWaits("export")'),false,'after Back nothing waits');
  assert.equal(p.json('weightPromptBlocked()'),false,'and the question may come again');
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} free play tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
