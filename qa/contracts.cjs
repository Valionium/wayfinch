'use strict';
// The bag planner's side of the contracts with the co-pilot (spec 7.1 Contracts 1-3), on the page's own code.
// Contract 3 here: Also delete bag planner data, with AGENTS.md's limit (only what was saved before the request).
// tests/e2e/app-contracts.spec.ts runs the same in a real browser, start-up included.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {appVM,sharedStore}=require('./app-vm.cjs');
const {page:PAGE}=require('./paths.cjs');
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

const ID='0123456789abcdef0123456789abcdef';
const HOUR=3600e3;
const iso=ms=>new Date(ms).toISOString();
const request=(createdAt,id=ID)=>JSON.stringify({app:'copilot',kind:'delete-request',v:1,id,createdAt});
const OLD=Date.now()-48*HOUR;          // saved two days ago
const ASKED=Date.now()-24*HOUR;        // the rider asked yesterday

// A page on its own store, with the address it was opened at; every removal and fragment change counted.
function page({hash='',storage=sharedStore()}={}){
  const q=appVM({storage});
  const log=[];
  const remove=q.localStorage.removeItem;
  q.localStorage.removeItem=k=>{log.push('remove:'+k);remove(k);};
  q.localStorage.clear=()=>{throw Error('localStorage.clear() is never called');};
  q.context.history={replaceState(...a){log.push('history:'+a[2]);}};
  Object.assign(q.context.location,{pathname:'/tools/bags/',search:'',hash});
  const json=code=>JSON.parse(q.run(`JSON.stringify(${code})`)??'null');
  const stored=key=>q.values.has(key) ? q.values.get(key) : null;
  return {...q,log,json,stored};
}
// What an older page left behind: values with no stamp, and the draft, setups and reports with their own old times.
function oldData(p){
  const draft={trip:{month:5,nights:2},bags:[{uid:1,pos:'seat',L:14}],kit:{},updatedAt:iso(OLD)};
  p.values.set('loadcheck:draft',JSON.stringify(draft));
  p.values.set('loadcheck:draft:local-meta',JSON.stringify({at:OLD,fallback:false}));
  p.values.set('loadcheck:setups',JSON.stringify([{id:'st_old',name:'Old',saved:iso(OLD).slice(0,10)}]));
  p.values.set('loadcheck:feedback',JSON.stringify([{at:iso(OLD),verdict:'exact',reported:0}]));
  p.values.set('loadcheck:bikeProfiles',JSON.stringify([{id:'bike_old',name:'Old bike'}]));
  p.values.set('loadcheck:bikeProfile',JSON.stringify({id:'bike_old',name:'Old bike'}));
  p.values.set('loadcheck:bikeProfilesFormat','2');
  for(const k of ['loadcheck:places','loadcheck:climate','loadcheck:theme','loadcheck:packEff','loadcheck:gpx','loadcheck:maxWeightSkipped','loadcheck:summary:v1','loadcheck:handoff-done'])
    p.values.set(k,JSON.stringify(k.endsWith('theme') ? 'light' : {x:1}));
  p.values.set('loadcheck:walkthrough:v1','done');
  p.values.set('copilot:settings:v1','{"theme":"dark"}');
  p.values.set('someone-else','kept');
}
const loadcheckKeys=p=>[...p.values.keys()].filter(k=>k.startsWith('loadcheck:')).sort();

test('[C-DELETE] a stored request removes every loadcheck:* key saved before it, one by one; no copilot:* key, no other key; loadcheck:delete-applied written',()=>{
  const p=page({hash:'#copilot-delete='+ID});
  oldData(p);
  p.values.set('copilot:delete-request:v1',request(iso(ASKED)));
  const before=loadcheckKeys(p).filter(k=>k!=='loadcheck:delete-applied');
  assert.equal(p.run('applyDeleteRequest()'),true);
  assert.deepEqual(loadcheckKeys(p),['loadcheck:delete-applied'],'only the applied mark is left');
  for(const k of before)assert.ok(p.log.includes('remove:'+k),'removed on its own: '+k);
  assert.equal(p.stored('copilot:settings:v1'),'{"theme":"dark"}');
  assert.equal(p.stored('copilot:delete-request:v1'),request(iso(ASKED)),'the request is the co-pilot\'s to remove');
  assert.equal(p.stored('someone-else'),'kept');
  const applied=JSON.parse(p.stored('loadcheck:delete-applied'));
  assert.deepEqual(Object.keys(applied),['app','kind','v','id','at']);
  assert.deepEqual({app:applied.app,kind:applied.kind,v:applied.v,id:applied.id},{app:'load-check',kind:'delete-applied',v:1,id:ID});
  assert.ok(Number.isFinite(Date.parse(applied.at)));
  assert.equal(p.json('MEM["loadcheck:draft"]??null'),null,'nothing is kept in memory either');
});

test('[C-DELETE] the code never clears storage, never names a cache, and runs before anything is read at start-up',()=>{
  const html=fs.readFileSync(PAGE,'utf8');
  const fn=html.slice(html.indexOf('function applyDeleteRequest('),html.indexOf('/* ---- Contract 2: a trip from Wayfinch'));
  assert.ok(fn.length>200);
  // assert.ok on a boolean only: an assertion on the page's text would print the page.
  assert.ok(!/\.clear\(|caches|copilot:/.test(fn),'no clear, no cache, and the only copilot key is the request, read elsewhere');
  assert.ok(!/localStorage\.clear\(/.test(html),'the page never clears all storage');
  const init=html.slice(html.indexOf('/* ==== 95-init.js ==== */'));
  const start=init.indexOf('(async () => {');
  const call=init.indexOf('applyDeleteRequest()',start),firstRead=init.indexOf('store.get(',start);
  assert.ok(start>0 && call>start && call<firstRead,'applied before the setups, bikes and draft are read');
});

test('[C-DELETE] a plan, setup, bike and report saved after the request, before the bag planner first applies it, all stay; older ones go',async()=>{
  const storage=sharedStore();
  const p=page({storage});
  oldData(p);
  // stamps the older page never wrote: the bikes, from two days ago
  p.values.set('loadcheck:saved-at:v1',JSON.stringify({app:'load-check',kind:'saved-at',v:1,keys:{'loadcheck:bikeProfiles':iso(OLD),'loadcheck:theme':iso(OLD)},items:{'loadcheck:bikeProfiles':{bike_old:iso(OLD)}}}));
  p.values.set('copilot:delete-request:v1',request(iso(ASKED)));
  // another bag-planner tab, open since before the request, saves a new plan today
  const tab=page({storage});
  tab.run('DRAFT_VERSION=draftVersionOf(JSON.parse(window.localStorage.getItem(DRAFT_KEY)));DRAFT_READY=true;S.bags=[{uid:1,pos:"frame",L:5}];S.nextUid=2;');
  await tab.run('flushDraft()');
  await tab.run(`store.set(SETUP_KEY,[...JSON.parse(window.localStorage.getItem(SETUP_KEY)),{id:'st_new',name:'New',saved:new Date().toISOString().slice(0,10)}])`);
  await tab.run(`store.set(BIKE_PROFILE_KEY,[...JSON.parse(window.localStorage.getItem(BIKE_PROFILE_KEY)),{id:'bike_new',name:'New bike'}])`);
  await tab.run(`store.set(BIKE_PROFILE_CURRENT_KEY,{id:'bike_new',name:'New bike'})`);
  await tab.run(`store.set(FEEDBACK_KEY,[...JSON.parse(window.localStorage.getItem(FEEDBACK_KEY)),{at:new Date().toISOString(),verdict:'more',reported:1}])`);
  await tab.run(`store.set('loadcheck:theme','dark')`);
  const newDraft=p.stored('loadcheck:draft');
  assert.ok(Date.parse(JSON.parse(newDraft).updatedAt)>ASKED);
  // the bag planner opens, at last
  const fresh=page({storage});
  assert.equal(fresh.run('applyDeleteRequest()'),true);
  assert.equal(fresh.stored('loadcheck:draft'),newDraft,'the new plan is kept byte for byte');
  assert.deepEqual(JSON.parse(fresh.stored('loadcheck:setups')).map(x=>x.id),['st_new']);
  assert.deepEqual(JSON.parse(fresh.stored('loadcheck:bikeProfiles')).map(x=>x.id),['bike_new']);
  assert.equal(JSON.parse(fresh.stored('loadcheck:bikeProfile')).id,'bike_new');
  assert.equal(fresh.stored('loadcheck:bikeProfilesFormat'),'2','the format mark stays while its list does');
  assert.deepEqual(JSON.parse(fresh.stored('loadcheck:feedback')).map(x=>x.verdict),['more']);
  assert.equal(fresh.stored('loadcheck:theme'),'"dark"');
  for(const k of ['loadcheck:places','loadcheck:climate','loadcheck:gpx','loadcheck:walkthrough:v1','loadcheck:summary:v1'])
    assert.equal(fresh.stored(k),null,'older, so gone: '+k);
  const ledger=JSON.parse(fresh.stored('loadcheck:saved-at:v1'));
  assert.deepEqual(Object.keys(ledger.items['loadcheck:bikeProfiles']),['bike_new'],'the stamps of what went go too');
  assert.deepEqual(Object.keys(ledger.items['loadcheck:setups']),['st_new']);
});

test('[C-DELETE] applied at most once: a second load keeps a newly saved plan',async()=>{
  const storage=sharedStore();
  const p=page({storage});
  oldData(p);
  p.values.set('copilot:delete-request:v1',request(iso(Date.now()-1000)));
  assert.equal(p.run('applyDeleteRequest()'),true);
  p.run('DRAFT_READY=true;S.bags=[{uid:1,pos:"seat",L:10}];S.nextUid=2;');
  await p.run('flushDraft()');
  await p.run(`store.set(SETUP_KEY,[{id:'st_after',name:'After'}])`);
  const draft=p.stored('loadcheck:draft'),setups=p.stored('loadcheck:setups');
  assert.ok(draft);
  const second=page({storage});
  assert.equal(second.run('applyDeleteRequest()'),false,'the same id is never applied twice');
  assert.equal(second.stored('loadcheck:draft'),draft);
  assert.equal(second.stored('loadcheck:setups'),setups);
  assert.equal(second.log.filter(x=>x.startsWith('remove:')).length,0);
});

test('[C-DELETE] another open bag-planner tab sees the removal, discards its plan and never writes it back',async()=>{
  const storage=sharedStore();
  const other=page({storage});
  oldData(other);
  let reloaded=0;
  other.context.window.location.reload=()=>{reloaded++;};
  other.run('DRAFT_VERSION=draftVersionOf(JSON.parse(window.localStorage.getItem(DRAFT_KEY)));DRAFT_READY=true;S.bags=[{uid:1,pos:"rack",L:20,pair:true}];S.nextUid=2;queueDraftSave();');
  const p=page({storage});
  p.values.set('copilot:delete-request:v1',request(iso(Date.now()+1000)));   // asked after everything above was saved
  assert.equal(p.run('applyDeleteRequest()'),true);
  assert.equal(reloaded,1,'the other tab starts again from what is stored');
  await other.run('flushDraft()');
  other.run('persistDraft(JSON.stringify(captureDraft()))');
  assert.equal(p.stored('loadcheck:draft'),null,'its plan is never written back');
  assert.equal(await other.run(`store.set(SETUP_KEY,[{id:'st_ghost',name:'Ghost'}])`),false);
  assert.equal(await other.run(`store.set('loadcheck:theme','light')`),false);
  assert.deepEqual(loadcheckKeys(p),['loadcheck:delete-applied']);
});

test('[C-DELETE-FRAGMENT] #copilot-delete= with no stored valid request deletes nothing, and the fragment is removed in every case',()=>{
  const cases=[
    ['no request',null],
    ['another app',JSON.stringify({app:'load-check',kind:'delete-request',v:1,id:ID,createdAt:iso(ASKED)})],
    ['a newer major version',JSON.stringify({app:'copilot',kind:'delete-request',v:2,id:ID,createdAt:iso(ASKED)})],
    ['a short id',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id:'abc',createdAt:iso(ASKED)})],
    ['no createdAt',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id:ID})],
    ['not JSON','{'],
  ];
  for(const [name,value] of cases){
    const p=page({hash:'#copilot-delete='+ID});
    oldData(p);
    if(value!==null)p.values.set('copilot:delete-request:v1',value);
    const before=JSON.stringify([...p.values.entries()]);
    assert.equal(p.run('applyDeleteRequest()'),false,name);
    assert.equal(JSON.stringify([...p.values.entries()]),before,'nothing changed: '+name);
    assert.deepEqual(p.log,['history:/tools/bags/'],'the fragment goes: '+name);
  }
  // with a valid request, the fragment goes too; without the fragment, a pending request is still applied (ST-DELETE keeps it)
  const p=page({hash:'#copilot-delete='+ID});
  p.values.set('copilot:delete-request:v1',request(iso(ASKED)));
  assert.equal(p.run('applyDeleteRequest()'),true);
  assert.ok(p.log.includes('history:/tools/bags/'));
  const q=page();
  oldData(q);
  q.values.set('copilot:delete-request:v1',request(iso(ASKED)));
  assert.equal(q.run('applyDeleteRequest()'),true);
  assert.ok(!q.log.some(x=>x.startsWith('history:')),'no fragment, nothing to remove');
});

// ---- Review of PR 43, I1, M3, M1, M2: a delete sticks in every tab, and "before" is read carefully ----
test('[C-DELETE] a tab kept in the back/forward cache, which never heard of the delete, drops its plan on coming back and writes nothing back',async()=>{
  const storage=sharedStore();
  const cached=page({storage});
  oldData(cached);
  cached.run('SETUPS=JSON.parse(window.localStorage.getItem(SETUP_KEY)).map(normaliseSetup).filter(Boolean);BIKE_PROFILES=[normaliseBikeProfile({id:"bike_old",name:"Old bike"})];DRAFT_READY=true;');
  let reloaded=0;cached.context.window.location.reload=()=>{reloaded++;};
  const self=[...storage.vms].find(v=>v.context===cached.context);
  storage.vms.delete(self);   // in the cache: no storage events reach it
  const p=page({storage});
  p.values.set('copilot:delete-request:v1',request(iso(Date.now()+1000)));
  assert.equal(p.run('applyDeleteRequest()'),true);
  storage.vms.add(self);
  for(const fn of cached.listeners.pageshow||[])fn({persisted:true});
  assert.equal(reloaded,1,'back from the cache, it starts again from what is stored');
  assert.equal(await cached.run("store.set(SETUP_KEY,[...SETUPS,{id:'st_new',name:'New'}])"),false);
  assert.equal(await cached.run('store.set(BIKE_PROFILE_KEY,BIKE_PROFILES)'),false);
  cached.run('persistDraft(JSON.stringify(captureDraft()))');
  assert.deepEqual(loadcheckKeys(p),['loadcheck:delete-applied'],'nothing it held comes back');
});

test('[C-DELETE] a save that would slip in while another tab is deleting is refused: the tab hears of the delete when it starts, not when it ends',async()=>{
  const storage=sharedStore();
  const other=page({storage});
  oldData(other);
  let reloaded=0;other.context.window.location.reload=()=>{reloaded++;};
  other.run('SETUPS=JSON.parse(window.localStorage.getItem(SETUP_KEY)).map(normaliseSetup).filter(Boolean);DRAFT_READY=true;');
  const p=page({storage});
  p.values.set('copilot:delete-request:v1',request(iso(Date.now()+1000)));
  // the other tab's 300 ms save fires between the deleting tab's first removal and its last
  let fired=false;const remove=p.localStorage.removeItem;
  // the other tab saves its setups (the old ones, rewritten with a fresh stamp) between the deleting tab's first removal and its last
  p.localStorage.removeItem=k=>{remove(k);if(!fired){fired=true;other.run('store.set(SETUP_KEY,SETUPS)');}};
  assert.equal(p.run('applyDeleteRequest()'),true);
  assert.ok(fired && reloaded>=1);
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(loadcheckKeys(p),['loadcheck:delete-applied'],'the old plan was not written back in the gap');
});

test('[C-DELETE] a value of an older page that carries its own time keeps it; one with no time goes; a stamp from a clock set back is never "before"',()=>{
  const p=page();
  const asked=Date.now()-24*HOUR,day=iso(Date.now()).slice(0,10);
  p.values.set('loadcheck:setups',JSON.stringify([{id:'st_day_after',name:'Saved the day after',saved:day},{id:'st_day_before',name:'Before',saved:iso(asked-24*HOUR).slice(0,10)},{id:'st_edit',name:'Edited after',saved:'2026-01-01',updated:iso(Date.now())}]));
  p.values.set('loadcheck:bikeProfiles',JSON.stringify([{id:'bike_measured',name:'Measured after',geometry:{at:iso(Date.now()),values:{}}},{id:'bike_plain',name:'No time'}]));
  p.values.set('loadcheck:places',JSON.stringify([{name:'x'}]));
  // the clock was set back after the request: this stamp reads as later than now, so it is kept
  p.values.set('loadcheck:saved-at:v1',JSON.stringify({app:'load-check',kind:'saved-at',v:1,keys:{'loadcheck:places':iso(Date.now()+48*HOUR)},items:{}}));
  p.values.set('copilot:delete-request:v1',request(iso(asked)));
  assert.equal(p.run('applyDeleteRequest()'),true);
  assert.deepEqual(JSON.parse(p.stored('loadcheck:setups')).map(x=>x.id),['st_day_after','st_edit']);
  assert.deepEqual(JSON.parse(p.stored('loadcheck:bikeProfiles')).map(x=>x.id),['bike_measured']);
  assert.ok(p.stored('loadcheck:places'),'a stamp later than now never deletes');
});

// ---- Contract 1: the load summary (spec 7.1). Its contents are checked against the schema in tests/unit/contracts/load-summary-page.test.ts ----
test('[C-SUMMARY-WRITE] written once at start-up when the draft is ready; after a save only when it differs; no bags is {app, kind, v, at, empty}',async()=>{
  const p=page();
  const writes=[];const set=p.localStorage.setItem;p.localStorage.setItem=(k,v)=>{if(k==='loadcheck:summary:v1')writes.push(v);set(k,v);};
  const html=fs.readFileSync(PAGE,'utf8'),init=html.slice(html.indexOf('/* ==== 95-init.js ==== */'));
  assert.ok(/DRAFT_READY = true;\s*writeLoadSummary\(true\);/.test(init),'start-up writes it as soon as the draft is ready');
  p.run('DRAFT_READY=true;S.bags=[];');
  assert.equal(p.run('writeLoadSummary(true)'),true);
  const empty=JSON.parse(writes.at(-1));
  assert.deepEqual(Object.keys(empty),['app','kind','v','at','empty']);
  assert.deepEqual({...empty,at:null},{app:'load-check',kind:'load-summary',v:1,at:null,empty:true});
  // a save that changes the load writes it; a save that changes nothing it holds (a tick) does not
  p.run('S.bags=[{uid:1,pos:"seat",L:14}];S.nextUid=2;S.kit.tent=true;');
  await p.run('flushDraft()');
  assert.equal(writes.length,2,'the save with a bag wrote it');
  const full=JSON.parse(writes.at(-1));
  assert.equal(full.bags.count,1);
  assert.equal(full.planUpdatedAt,JSON.parse(p.stored('loadcheck:draft')).updatedAt,'planUpdatedAt is the saved plan\'s version');
  p.run('S.packed.tent=true;');
  await p.run('flushDraft()');
  assert.equal(writes.length,2,'a tick saves the plan, and the summary says the same: not written');
  p.run('S.bags.push({uid:2,pos:"frame",L:5});S.nextUid=3;');
  await p.run('flushDraft()');
  assert.equal(writes.length,3,'another bag: written');
  // Start a new plan replaces it before reloading
  let reloaded=0;p.context.window.location.reload=()=>{reloaded++;assert.equal(JSON.parse(p.stored('loadcheck:summary:v1')).empty,true,'replaced first');};
  p.run('persistBikeProfileSelection=async()=>true;');
  p.nodes.get('draftNew').dataset.confirm='yes';
  await p.run("$('draftNew').onclick()");
  assert.equal(reloaded,1);
  assert.equal(JSON.parse(p.stored('loadcheck:summary:v1')).empty,true);
});

test('[C-SUMMARY-WRITE] a tab that saw another apply a delete request writes no summary',()=>{
  const p=page();
  p.run('DRAFT_READY=true;S.bags=[{uid:1,pos:"seat",L:14}];DELETED_ELSEWHERE=true;');
  assert.equal(p.run('writeLoadSummary(true)'),false);
  assert.equal(p.stored('loadcheck:summary:v1'),null);
});

// ---- Offline at /tools/bags/: the site's one worker (spec 7.1 item 6), and the line after the emergency switch (Decision 9) ----
// A browser with a service worker container the test controls: `cached` says whether the site's copy is there.
function offlinePage({storage=sharedStore(),cached=false}={}){
  const p=page({storage});
  const log=[];
  const state={cached};
  const worker=()=>({scriptURL:'https://example.test/offline-worker.js',state:'activated',addEventListener(){},removeEventListener(){},
    postMessage(message,ports){log.push('message:'+message.type);if(ports&&ports[0])ports[0].postMessage({ok:true,cached:true});}});
  const registration=()=>state.cached ? {active:worker(),installing:null,waiting:null,addEventListener(){},update:async()=>{}} : undefined;
  p.context.qaWorkers={
    async register(url,options){log.push('register:'+url+' '+JSON.stringify(options));state.cached=true;return registration();},
    async getRegistration(url){log.push('getRegistration:'+url);return registration();},
    ready:new Promise(()=>{}),addEventListener(){},removeEventListener(){},
  };
  p.context.window.isSecureContext=true;p.context.window.caches={};
  Object.assign(p.context.location,{href:'https://example.test/tools/bags/'});
  p.run('navigator.serviceWorker=qaWorkers;DRAFT_READY=true;DRAFT_SIGNATURE=JSON.stringify(captureDraft());DRAFT_READ_KIND="browser";initialiseDraftSaveStatus();');
  // the page's own MessageChannel answers through the port the worker gets
  const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
  return {...p,olog:log,state,settle};
}

test('[LC-OFFLINE-SITE] at /tools/bags/ the page looks up and registers only /offline-worker.js, scope /; the update prompt asks the site-wide registration',async()=>{
  const p=offlinePage();
  await p.run('initialiseOfflinePacking()');await p.settle();
  assert.deepEqual(p.olog.filter(x=>x.startsWith('getRegistration')),['getRegistration:https://example.test/','getRegistration:https://example.test/'],'the offline check, then the update prompt: both at /');
  await p.run('prepareOfflinePacking()');await p.settle();
  assert.deepEqual(p.olog.filter(x=>x.startsWith('register')),['register:https://example.test/offline-worker.js {"scope":"https://example.test/","updateViaCache":"none"}']);
  assert.ok(p.olog.includes('message:LOADCHECK_SAVE_APP'));
  assert.equal(p.json('OFFLINE_PACKING.cacheReady'),true,'the panel reports the site-wide copy');
  const html=fs.readFileSync(PAGE,'utf8');
  const names=[...new Set([...html.matchAll(/[\w./-]*worker[\w-]*\.js/g)].map(m=>m[0]))];
  assert.deepEqual(names,['/offline-worker.js'],'no other worker\'s name in the source');
});

test('[LC-OFFLINE-AGAIN] a rider who never had the offline copy never sees the line',async()=>{
  const p=offlinePage({cached:false});
  await p.run('initialiseOfflinePacking()');await p.settle();
  assert.equal(p.json('OFFLINE_AGAIN.shown'),false);
  assert.equal(p.stored('loadcheck:offline-had'),null);
});

test('[LC-OFFLINE-AGAIN] the copy seen once, then gone after the emergency switch: one line asks for a tap; the tap brings it back and the line goes',async()=>{
  const storage=sharedStore();
  const first=offlinePage({storage,cached:true});
  await first.run('initialiseOfflinePacking()');await first.settle();
  assert.equal(first.json('OFFLINE_AGAIN.shown'),false,'nothing to say while the copy is there');
  assert.deepEqual(JSON.parse(first.stored('loadcheck:offline-had')),{app:'load-check',kind:'offline-had',v:1});
  // the switch removed the registration and the caches; a later good deploy did not bring them back
  const later=offlinePage({storage,cached:false});
  await later.run('initialiseOfflinePacking()');await later.settle();
  assert.equal(later.json('OFFLINE_AGAIN.shown'),true);
  const words=later.html.slice(later.html.indexOf('id="offlineAgainText">'),later.html.indexOf('id="offlineAgainLater"'));
  assert.ok(/Make available offline/.test(words),'it names the button to tap');
  assert.ok(!/safe|guarant|prevent|warning|error|fail|must/i.test(words),'warm words, none of the banned ones');
  await later.run('prepareOfflinePacking()');await later.settle();
  assert.equal(later.json('OFFLINE_AGAIN.shown'),false,'the copy is back, the line is gone');
  assert.ok(later.stored('loadcheck:offline-had'),'the mark stays for the next time');
});

test('[LC-OFFLINE-AGAIN] Not now dismisses the line for good; the next visit without the copy says nothing',async()=>{
  const storage=sharedStore();
  const first=offlinePage({storage,cached:true});
  await first.run('initialiseOfflinePacking()');await first.settle();
  const later=offlinePage({storage,cached:false});
  await later.run('initialiseOfflinePacking()');await later.settle();
  assert.equal(later.json('OFFLINE_AGAIN.shown'),true);
  await later.run('dismissOfflineAgain()');
  assert.equal(later.json('OFFLINE_AGAIN.shown'),false);
  assert.equal(later.stored('loadcheck:offline-had'),'null');
  const next=offlinePage({storage,cached:false});
  await next.run('initialiseOfflinePacking()');await next.settle();
  assert.equal(next.json('OFFLINE_AGAIN.shown'),false);
});

// ---- Outbound precision (spec 7.1 item 8) ----
test('[LC-PRECISION] Nominatim gets the ends rounded to 0.01 degrees; elevation and terrain lookups go at 3 decimals, all through one function',async()=>{
  const p=page();
  const urls=[];
  p.context.qaFetch=async url=>{urls.push(url);return url.includes('nominatim') ? {address:{town:'Heidelberg',state:'BW',country:'Germany',country_code:'de'}} : {elevation:[114,120]};};
  p.run('fetchJson=qaFetch;');
  await p.run('reverseName(49.412345,8.694567)');
  assert.ok(urls[0].startsWith('https://nominatim.openstreetmap.org/reverse?') && urls[0].endsWith('&lat=49.41&lon=8.69'),'ends rounded to 0.01 degrees');
  await p.run('reverseName(-0.004999,179.996)');
  assert.ok(urls[1].endsWith('&lat=0.00&lon=180.00'));
  await p.run('elevationsFor([{lat:49.412345,lon:8.694567},{lat:48.5734567,lon:7.7521234}])');
  assert.ok(urls[2].includes('latitude=49.412,48.573&longitude=8.695,7.752'),'3 decimals');
  const html=fs.readFileSync(PAGE,'utf8');
  assert.equal((html.match(/ELEV_URL/g)||[]).length,2,'the elevation address is defined once and used once: in elevationsFor');
  assert.equal((html.match(/api\.open-meteo\.com\/v1\/elevation/g)||[]).length,1);
  assert.equal((html.match(/nominatim\.openstreetmap\.org\/reverse/g)||[]).length,1,'one Nominatim call, in reverseName');
});

// ---- Contract 2's hook (the handoff itself is group 2's cut): gpx.copilotRoute is kept by normalisePlan ----
test('Contract 2 hook: a stored gpx.copilotRoute survives normalisePlan; anything that is not a route hash is dropped',()=>{
  const p=page();
  const gpx=p.run(`JSON.stringify(normaliseGPX({pts:[{lat:49,lon:8,elev:100,t:0,km:0},{lat:49.01,lon:8,elev:110,t:1,km:1.1119492664455877}],km:1.1,ascent:10,elevationSource:'file',hadElev:true}))`);
  assert.ok(gpx && gpx!=='null','a plain route reads');
  const hash='ab'.repeat(32);
  p.context.qaGpx=gpx;p.context.qaHash=hash;
  assert.equal(p.run('normaliseGPX({...JSON.parse(qaGpx),copilotRoute:qaHash}).copilotRoute'),hash);
  assert.equal(p.run('"copilotRoute" in normaliseGPX({...JSON.parse(qaGpx),copilotRoute:"not a hash"})'),false);
  assert.equal(p.run('"copilotRoute" in normaliseGPX(JSON.parse(qaGpx))'),false,'a route without it is unchanged');
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} contract tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
