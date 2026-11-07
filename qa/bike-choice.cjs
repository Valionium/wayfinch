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

test('[TB-PAGE-WRITES] the shown bike used, a new bike and the bike cleared each write the record once with the new id; No bike is null',async()=>{
  const p=page();
  p.run("openBikeDetailsFromLink('#bike-details=bike_c&back=tools')");
  await p.run('useShownBike()');await p.settle();
  assert.equal(plan(p),'bike_c');
  assert.equal(p.count(KEY),1);assert.equal(p.mine().bikeId,'bike_c','the shown bike used');
  p.run("closeBikeDetails();openBikeDetails(null);startNewBike();document.getElementById('bikeName').value='Tourer'");
  await p.run('saveBikeProfile()');await p.settle();
  const fresh=plan(p);
  assert.ok(fresh && !['bike_a','bike_b','bike_c'].includes(fresh),'a new bike is the plan\'s');
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

test('[TB-PAGE-FOLLOWS] the same bike, an older record, an unknown id, No bike or a broken record change nothing and write nothing',async()=>{
  const cases=[
    ['the same bike',p=>theirs(p,'bike_a')],
    ['an older record',p=>{theirs(p,'bike_b',Date.now()-HOUR);p.values.set(KEY,record('load-check','bike_a',Date.now()-1000));}],
    ['an unknown id',p=>theirs(p,'bike_zz')],
    ['No bike',p=>theirs(p,null)],
    ['a broken record',p=>p.values.set(THEIRS,'{"app":"copilot","kind":"bike-choice","v":2,"bikeId":"bike_b","at":"2026-11-07T00:00:00.000Z"}')],
    ['the page\'s own record naming another bike',p=>p.values.set(KEY,record('load-check','bike_b',Date.now()))],
  ];
  for(const [name,arrange] of cases){
    const p=page();
    arrange(p);
    const before=p.run('JSON.stringify([S.bikeProfile,S.kit])');
    p.run('followBikeChoice()');await p.settle();
    assert.equal(p.run('JSON.stringify([S.bikeProfile,S.kit])'),before,name+': the plan as it was');
    assert.equal(p.writes.length,0,name+': nothing written');
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
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} bike-choice tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
