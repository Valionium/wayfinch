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
  const fn=html.slice(html.indexOf('function applyDeleteRequest('),html.indexOf('// Another bag-planner tab applied a request'));
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

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} contract tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
