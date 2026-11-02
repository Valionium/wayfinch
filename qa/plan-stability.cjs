/* Run with VS Code's runtime (see the release routine). Kept placements: design 7 and 15.2, 15.5. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {planKit}=require('./plan-kit.cjs');
const kit=planKit(),{run}=kit.vm;
const json=code=>JSON.parse(run(`JSON.stringify(${code})`)??'null');
const near=(actual,expected,note,by=0.005)=>assert(Math.abs(actual-expected)<=by,`${note}: ${actual} versus ${expected}`);
let cases=0;
function test(name,fn){fn();cases++;console.log('PASS '+name);}

const ON="Object.keys(S.kit).forEach(k=>S.kit[k]=false);KIT.forEach(k=>S.kit[k.id]=!!k.on);";
const DEFAULTS='S.kitTouched={};S.kit={};applyTripKitDefaults();';
const SIX=['quilt','pad','tent','rain','puffy','base1','bibs','socks','camp','cap','underwear','shades','stove','pot','spork','food','snacks','tool','tubes','pump','levers','link','chaintl','hanger','patch','boot','lock','bank','phone','cables','headlamp','firstaid','wash','towel','teeth','wipes','docs','cash'];
const FOUR=[{uid:1,pos:'frame',L:6},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'seat',L:14},{uid:4,pos:'bar',L:12}];
const PANNIER=[{uid:1,pos:'frame',L:6},{uid:2,pos:'rack',L:15,pair:true}];
const ADD25=['meds','sun','gloves','warmers','rainpants','shoecov','elecpump','plugs','repellent','blanket','mug','buds','earplugs','liner','pillow','drybags','nice','book','detergent','chamois','pads','ties','lube','spoke','shiftcharger'];
function setup(p,code){
  run(`(()=>{const p=${JSON.stringify(p)};
    S.bags=p.bags.map(b=>({...b}));S.nextUid=Math.max(1,...S.bags.map(b=>b.uid+1));
    if(p.kit){Object.keys(S.kit).forEach(k=>S.kit[k]=false);p.kit.forEach(id=>S.kit[id]=true);}
    S.qty=p.qty||{};S.custom=p.custom||{};S.pinned=p.pinned||{};S.packed={};S.placements=null;S.carried={};
    S.mode=p.mode||'comfort';S.nights=p.nights===undefined?6:p.nights;S.sleep=p.sleep||'camp';
    S.foodMode=p.foodMode===undefined?2:p.foodMode;S.decks={bar:false,rack:false,...(p.decks||{})};S.packEff=null;
  })()`);
  if(code)run(code);
  return plan();
}
const plan=()=>json('(()=>{const p=currentPlan();return {inUse:p.inUse,items:p.items,food:p.food,overflow:p.overflow,reach:p.reach,hand:p.hand,summary:p.summary};})()');
const change=code=>{run(code);return plan();};
// Items that changed bag or half, leaving out the ones the test names (food is never in items).
const othersMoved=(a,b,skip=[])=>Object.keys(a.items).filter(id=>!skip.includes(id)&&b.items[id]&&JSON.stringify(a.items[id].map(e=>e[0]))!==JSON.stringify(b.items[id].map(e=>e[0])));
const keysOf=(p,id)=>(p.items[id]||[]).map(e=>e[0]);
const overL=p=>p.summary.overL;

test('[LC-KEEP-01] #4(b): the pump chip moves only the pump; the bags in use stay 2',()=>{
  const a=setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12},{uid:4,pos:'pack',L:20}],mode:'light',nights:1,sleep:'indoor'},ON);
  assert.deepEqual(a.inUse,['1-0','2-0']);
  const b=change("S.pinned.pump='2-0';");
  assert.deepEqual(b.inUse,['1-0','2-0']);
  assert.deepEqual(keysOf(b,'pump'),['2-0']);
  assert.deepEqual(othersMoved(a,b,['pump']),[]);
  assert.deepEqual(b.reach.outOfReach,[],'item 16: the seat pack opens at the roadside');
  assert.deepEqual(b.hand.kept,['pump']);
});
test('[LC-KEEP-02] 25 additions to the four-bag plan move nothing else',()=>{
  const a=setup({bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  const stored=json('S.placements');
  ADD25.forEach(id=>{
    const b=change(`S.kit.${id}=true;`);
    assert.deepEqual(othersMoved(a,b,[id]),[],id);assert.deepEqual(b.inUse,a.inUse,id);assert.equal(overL(b),0,id);
    run(`S.kit.${id}=false;S.placements=${JSON.stringify(stored)};`);
  });
});
test('[LC-KEEP-03] the same additions to frame + pannier pair: no half swaps; the outfit leaves 0.01 L of food over',()=>{
  const a=setup({bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  const stored=json('S.placements');
  ADD25.forEach(id=>{
    const b=change(`S.kit.${id}=true;`);
    assert.deepEqual(othersMoved(a,b,[id]),[],id);
    if(id==='nice')near(overL(b),0.01,'town outfit');
    run(`S.kit.${id}=false;S.placements=${JSON.stringify(stored)};`);
  });
});
test('[LC-KEEP-04] moving the wash kit to the other pannier moves nothing else',()=>{
  const a=setup({bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  const from=keysOf(a,'wash')[0],to=from==='2-0'?'2-1':'2-0';
  const b=change(`S.pinned.wash='${to}';`);
  assert.deepEqual(keysOf(b,'wash'),[to]);assert.deepEqual(othersMoved(a,b,['wash']),[]);
});
test('[LC-KEEP-05] a full re-plan keeps the wash kit there and balances the pair around it',()=>{
  const a=setup({bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  const from=keysOf(a,'wash')[0],to=from==='2-0'?'2-1':'2-0';
  change(`S.pinned.wash='${to}';`);
  run('keepPlan({replan:true});');
  const b=plan();assert.deepEqual(keysOf(b,'wash'),[to]);
  const used=json("currentPlan().slots.filter(s=>s.pos==='rack').map(s=>+(s.cap-s.left).toFixed(2)).sort()");
  assert.deepEqual(used,[12.6,12.61]);
});
test('[LC-KEEP-06] #3, Lightweight, plus arm warmers or long gloves: bags unchanged, nothing moves',()=>{
  const bags=[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'pack',L:20},{uid:4,pos:'rack',L:15,pair:true}];
  ['warmers','gloves'].forEach(id=>{
    const a=setup({bags,mode:'light',nights:6,sleep:'camp',kit:SIX});
    const b=change(`S.kit.${id}=true;`);
    assert.deepEqual(b.inUse,a.inUse,id);assert.deepEqual(othersMoved(a,b,[id]),[],id);
  });
});
test('[LC-KEEP-07] quantities and sizes: no other item moves, and the bags stay',()=>{
  const steps=[['tubes','S.qty.tubes=2;'],['base1','S.qty.base1=2;'],['underwear','S.qty.underwear=3;'],
    ['rain','S.custom.rain={L:2,kg:.45,rigid:0};'],['puffy','S.custom.puffy={L:3.5,kg:.55,rigid:0};'],['quilt','S.custom.quilt={L:3.2,kg:.5,rigid:0};']];
  [FOUR,PANNIER].forEach(bags=>steps.forEach(([id,code])=>{
    const a=setup({bags,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
    const b=change(code);
    assert.deepEqual(othersMoved(a,b,[id]),[],id);assert.deepEqual(b.inUse,a.inUse,id);
    if(bags===FOUR)assert.equal(overL(b),0,id);
    if(bags===PANNIER&&id==='rain'){assert.equal(overL(b),2);assert.deepEqual(b.overflow.map(o=>o.id),['rain']);}
    if(bags===PANNIER&&id==='puffy')near(overL(b),0.31,'puffy');
  }));
});
test('[LC-KEEP-08] a hand placement that no longer fits is reported, and returns when it fits again',()=>{
  const a=setup({bags:[{uid:1,pos:'top',L:1,slot:'front'},{uid:2,pos:'frame',L:6},{uid:3,pos:'fork',L:3,pair:true},{uid:4,pos:'seat',L:14},{uid:5,pos:'bar',L:12}],mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  assert.deepEqual(keysOf(a,'cables'),['2-0']);
  const b=change("S.pinned.cables='5-0';");
  assert.deepEqual(keysOf(b,'cables'),['5-0']);assert.deepEqual(b.hand.notKept,[]);assert.deepEqual(b.hand.kept,['cables']);
  const c=change('S.custom.cables={L:.86,kg:.2,rigid:0};');
  assert.deepEqual(c.hand.notKept.map(n=>[n.id,n.key,n.reason,n.needL,n.freeL,n.nowIn]),[['cables','5-0','no room',.86,.56,'4-0']]);
  assert.deepEqual(keysOf(c,'cables'),['4-0']);assert.deepEqual(othersMoved(b,c,['cables']),[]);assert.deepEqual(c.hand.kept,[]);
  const d=change('delete S.custom.cables;');
  assert.deepEqual(keysOf(d,'cables'),['5-0']);assert.deepEqual(d.hand.notKept,[]);assert.deepEqual(othersMoved(c,d,['cables']),[]);
});
test('[LC-KEEP-10] two top-tube bags: the same contents per mount whichever was added first',()=>{
  const contents=bags=>{setup({bags,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
    return json("Object.fromEntries(currentPlan().slots.filter(s=>s.pos==='top').map(s=>[s.slot,s.items.filter(k=>!k.part).map(k=>k.id)]))");};
  const a=contents([{uid:1,pos:'top',L:1,slot:'front'},{uid:2,pos:'top',L:1,slot:'rear'},{uid:3,pos:'seat',L:14}]);
  const b=contents([{uid:1,pos:'top',L:1,slot:'rear'},{uid:2,pos:'top',L:1,slot:'front'},{uid:3,pos:'seat',L:14}]);
  assert.deepEqual(a,b);
  assert.deepEqual(a.front.slice().sort(),['chaintl','docs','hanger','levers','link','snacks']);
  assert.deepEqual(a.rear.slice().sort(),['bank','boot','cash','patch','spork','tool']);
});
test('[LC-KEEP-12] unticking in an over-capacity plan: overflow comes in, nothing else moves',()=>{
  const a=setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:10}],mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  near(overL(a),16.41,'before');
  assert.deepEqual(keysOf(a,'tubes'),['1-0']);
  const b=change('S.kit.tubes=false;');
  assert.deepEqual(othersMoved(a,b),[]);near(overL(b),15.71,'after');
  assert.deepEqual(keysOf(b,'towel'),['1-0']);assert.deepEqual(keysOf(b,'teeth'),['1-0']);
  const came=json(`planDiff(${JSON.stringify(a)},${JSON.stringify(b)}).placedFromOverflow`);
  assert.deepEqual(came.slice().sort(),['teeth','towel']);
});
test('[LC-KEEP-13] indoor trip to camping: only the new items are placed',()=>{
  const bags=[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12},{uid:4,pos:'rack',L:15,pair:true}];
  // Comfortable
  let a=setup({bags,mode:'comfort',nights:3,sleep:'indoor'},DEFAULTS);
  let b=change("S.sleep='camp';applyTripKitDefaults();");
  assert.deepEqual(othersMoved(a,b),[]);assert.equal(overL(b),0);
  ['quilt','pad','stove','wash','spork'].forEach(id=>assert.deepEqual(keysOf(b,id),['3-0'],id));
  ['tent','camp','pot','headlamp','towel','wipes'].forEach(id=>assert.deepEqual(keysOf(b,id),['2-0'],id));
  assert(b.inUse.includes('4-0')&&!b.inUse.includes('4-1'),'only pannier 1 comes in, for food');
  // Lightweight
  a=setup({bags,mode:'light',nights:3,sleep:'indoor'},DEFAULTS);
  assert.deepEqual(a.inUse,['1-0','2-0']);
  b=change("S.sleep='camp';applyTripKitDefaults();");
  assert.deepEqual(othersMoved(a,b),[]);
  ['pad','tent'].forEach(id=>assert.deepEqual(keysOf(b,id),['3-0'],id));
  assert.deepEqual(b.inUse,['1-0','3-0','2-0','4-0'],'the roll and pannier 1 come in');
  assert.equal(json("currentPlan().food['4-0']>0"),true,'pannier 1 is for food');
});
test('[LC-KEEP-14] the food exception: displaced food brings in the backpack, nothing else moves',()=>{
  const a=setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'fork',L:4,pair:true},{uid:3,pos:'pack',L:10}],mode:'comfort',nights:1,sleep:'indoor'},DEFAULTS);
  assert(!a.inUse.includes('3-0'));
  const b=change('S.kit.rainpants=true;');
  assert.deepEqual(keysOf(b,'rainpants'),['2-1']);assert.deepEqual(othersMoved(a,b,['rainpants']),[]);
  assert(b.inUse.includes('3-0'));near(json("currentPlan().food['3-0']"),0.05,'food in the backpack');
});
// Rendering, as bag-selection.cjs does it.
const html=fs.readFileSync(require('./paths.cjs').page,'utf8');
const cut=(a,b)=>{const s=html.indexOf(a),e=html.indexOf(b,s+a.length);assert(s>=0&&e>s,a);return html.slice(s,e);};
run(cut('function renderResult(){','/* ==== 84-packing-checklist.js ==== */'));
run("buildThumb=()=>'';renderBags=()=>{};drawRig=()=>{};");
const strip=s=>String(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
const render=()=>{run('renderResult();');return {verdict:strip(kit.vm.nodes.get('verdictBox').innerHTML),result:strip(kit.vm.nodes.get('resultBox').innerHTML)};};
const has=(text,part)=>assert(text.includes(part),'missing: '+part+'\nin: '+text.slice(0,600));
const hasNot=(text,part)=>assert(!text.includes(part),'should not say: '+part);
const status=()=>kit.vm.nodes.get('bagMoveStatus').textContent;
test('[LC-KEEP-01] the header says 2 bags, 1 moved',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12},{uid:4,pos:'pack',L:20}],mode:'light',nights:1,sleep:'indoor'},ON);
  change("S.pinned.pump='2-0';");
  const {result}=render();has(result,'2 bags · 1 moved');
  // A must-reach item moved into a bag that stays sealed is reported.
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'bar',L:14}],mode:'comfort',nights:1,sleep:'indoor',kit:['pump','tool']});
  change("S.pinned.pump='2-0';");
  assert.deepEqual(plan().reach.outOfReach,['pump']);has(render().result,'(you moved it there)');
});
test('[LC-KEEP-08] the finding names the item, the room and where it is now, and offers Forget',()=>{
  setup({bags:[{uid:1,pos:'top',L:1,slot:'front'},{uid:2,pos:'frame',L:6},{uid:3,pos:'fork',L:3,pair:true},{uid:4,pos:'seat',L:14},{uid:5,pos:'bar',L:12}],mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  change("S.pinned.cables='5-0';");change('S.custom.cables={L:.86,kg:.2,rigid:0};');
  const {result}=render();
  has(result,"Your hand placement can't be kept: Charger and cables need 0.86 L; the handlebar roll has 0.56 L free. They are in the seat pack for now.");
  has(result,'Forget this placement');
  run('forgetPlacement("cables");');
  assert.equal(json('S.pinned.cables??null'),null);assert.deepEqual(plan().hand.notKept,[]);
});
test('[LC-ADV-08] (a) a dormant record counts nothing; "+ overflow" shows; it applies again when ticked',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:10}],mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  change("S.pinned.lock='2-0';");
  let p=change('S.kit.lock=false;');
  assert.deepEqual(p.hand.dormant,['lock']);assert.deepEqual(p.hand.kept,[]);
  assert.equal(run('recordOfPin("lock")'),'dormant');
  const {result}=render();has(result,'2 bags + overflow');hasNot(result,'· 1 moved');
  p=change('S.kit.lock=true;');
  // The seat pack took overflow while the lock was at home, so the record applies again and reports it.
  assert.deepEqual(p.hand.notKept.map(n=>[n.id,n.reason]),[['lock','no room']]);assert.equal(run('recordOfPin("lock")'),'notKept');
});
test('[LC-ADV-08] (b) removing the bag: Step 2 says so; afresh; no "moved"',()=>{
  setup({bags:[{uid:1,pos:'frame',L:3},{uid:2,pos:'seat',L:6}],mode:'comfort',nights:1,sleep:'indoor',kit:['tool','pump','rain','base1','puffy']});
  change("S.pinned.puffy='2-0';");
  run('removeBag(2);');
  has(status(),'Removing the seat pack also forgets where you put the insulated jacket');
  assert.equal(json('S.pinned.puffy??null'),null);
  const p=plan();assert.deepEqual(p.inUse,['1-0']);assert.deepEqual(p.overflow.map(o=>o.id),['puffy']);assert.equal(p.overflow[0].litres,2);
  const {result}=render();has(result,'1 bag + overflow');hasNot(result,'· 1 moved');
});
test('turning a pair into one bag forgets a hand placement in half 2, and Step 2 says so',()=>{
  setup({bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  change("S.pinned.wash='2-1';");
  run('removeBag(2);');
  assert.equal(json('S.pinned.wash??null'),null);
  has(status(),'also forgets where you put the wash kit');
  assert.equal(plan().inUse.includes('2-1'),false);
});
test('a hand placement in half 1 survives the pair turning into one bag, without a message',()=>{
  setup({bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  change("S.pinned.wash='2-0';");
  run('removeBag(2);');
  assert.equal(json('S.pinned.wash??null'),'2-0');hasNot(status(),'forgets');
});
test('the cross on a bag row forgets its hand placements too',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14}],mode:'comfort',nights:1,sleep:'indoor',kit:['tool','pump','rain']});
  change("S.pinned.pump='2-0';");
  run('removeBagEntry(2);');
  assert.equal(json('S.pinned.pump??null'),null);has(status(),'Removing the seat pack also forgets where you put the hand pump');
});
test('[recordOfPin] the record states: kept, dormant, notKept',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14}],mode:'comfort',nights:1,sleep:'indoor',kit:['tool','pump']});
  change("S.pinned.pump='2-0';");assert.equal(run('recordOfPin("pump")'),'kept');
  change('S.kit.pump=false;');assert.equal(run('recordOfPin("pump")'),'dormant');
  change("S.kit.pump=true;S.custom.pump={L:30,kg:.1,rigid:0};");assert.equal(run('recordOfPin("pump")'),'notKept');
});
test('[LC-ADV-10] the Leave-it-behind search makes no fresh plan and runs on the kept plan',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:10}],mode:'comfort',nights:6,sleep:'camp',kit:SIX.filter(id=>id!=='tent').concat('bivy')});
  run('currentPlan();globalThis.__fresh=0;const __sb=selectBags;selectBags=function(){globalThis.__fresh++;return __sb();};');
  const fix=json('fixSuggestion()');
  assert(fix&&fix.drop.length>0);assert.equal(run('globalThis.__fresh'),0);
  run('selectBags=__sb;');
});
test('planWith is the kept step: an added item moves nothing else, and state stays',()=>{
  const a=setup({bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  const state=run('JSON.stringify(S)');
  const t=json("(()=>{const p=planWith({add:'warmers'});return {items:p.items};})()");
  assert.deepEqual(othersMoved(a,t,['warmers']),[]);
  assert.equal(run('JSON.stringify(S)'),state);
});

// ---- Design 7.5 to 7.7: full re-plans, the note and the offer ----
const notes=()=>json('currentPlan().notes');
const THREE=[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12}];
const stored=()=>run('JSON.stringify(S.placements)');
test('[LC-KEEP-11] triggers: each one places afresh and says why; a hand placement stays',()=>{
  const start=()=>{const a=setup({bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX});change("S.pinned.lock='3-0';");assert.equal(notes().replan,null);return a;};
  // a mode switch
  start();let p=change("S.mode='light';");
  assert.equal(notes().replan.reason,'mode');assert.deepEqual(keysOf(p,'lock'),['3-0']);
  // resizing the seat pack
  start();p=change('S.bags.find(b=>b.uid===3).L=15;');
  assert.equal(notes().replan.reason,'bags');assert.deepEqual(keysOf(p,'lock'),['3-0']);
  // a cage in the triangle: the frame bag goes from 6.0 to 4.5 L
  start();assert.equal(json("S.bags.flatMap(physical).find(u=>u.key==='1-0')&&usableL(S.bags[0])"),5.28);
  p=change("S.bags.push({uid:9,pos:'bottle',slot:'dt',L:.75});syncFrameBags();");
  assert.equal(json('usableL(S.bags[0])'),3.96);assert.equal(notes().replan.reason,'bags');assert.deepEqual(keysOf(p,'lock'),['3-0']);
  // the rack deck on
  start();p=change('S.decks.rack=true;');
  assert.equal(notes().replan.reason,'rackDeck');assert.deepEqual(keysOf(p,'lock'),['3-0']);
  // another packing factor
  start();p=change('S.packEff=.85;');
  assert.equal(notes().replan.reason,'bags');assert.deepEqual(keysOf(p,'lock'),['3-0']);
  // Start again: the record is gone, the lock goes to fork cage 2
  start();run('startAgain();');p=plan();
  assert.equal(json('S.pinned.lock??null'),null);assert.deepEqual(keysOf(p,'lock'),['2-1']);
  // the one-time note goes with the next change
  start();change("S.mode='light';");assert(notes().replan);change('S.kit.warmers=true;');assert.equal(notes().replan,null);
});
test('[LC-KEEP-11] not triggers: a bottle under the down tube, the handlebar deck, the bike name',()=>{
  const a=setup({bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  change("S.pinned.lock='3-0';");
  const before=stored();
  ["S.bags.push({uid:9,pos:'bottleU',slot:'un',L:.5});","S.decks.bar=true;","S.bikeProfile={...(S.bikeProfile||{}),name:'Other name'};"].forEach(code=>{
    change(code);assert.equal(stored(),before,code);assert.equal(notes().replan,null,code);
  });
  assert.deepEqual(a.inUse,plan().inUse);
});
test('[LC-REPLAN-01] the 2.0 L rain jacket: the offer shows; Re-plan fits everything, keeping hand placements and ticks',()=>{
  const start=setup({bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX}),washIn=keysOf(start,'wash')[0];
  change(`S.pinned.wash='${washIn}';S.packed.tent=true;`);
  const p=change('S.custom.rain={L:2,kg:.45,rigid:0};');
  assert.deepEqual(p.overflow.map(o=>[o.id,o.litres]),[['rain',2]]);
  assert.equal(notes().offer.gain,'A fresh plan fits everything.');
  has(render().result,'A fresh plan fits everything. Re-plan keeps your hand placements and ticks.');
  const state=stored();
  assert.equal(stored(),state,'nothing changes by itself');
  run("keepPlan({replan:true,why:'asked'});");
  const q=plan();
  assert.deepEqual(q.overflow,[]);assert.deepEqual(keysOf(q,'wash'),[washIn]);
  assert.equal(json('S.packed.tent'),true);assert.equal(notes().offer,null);assert.equal(notes().replan.reason,'asked');
  near(json('currentPlan().summary.mountedL'),31.68,'31.68 L of bags');near(json('kitL()'),31.29,'31.29 L of kit');
});
test('[LC-REPLAN-01] "better" exactly as 7.6: no offer when a fresh plan is no better',()=>{
  setup({bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  change('S.kit.earplugs=true;');assert.equal(notes().offer,null);
});
test('[LC-REPLAN-01] a different rack answer is offered, with its reason (LC-KEEP-13)',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12},{uid:4,pos:'rack',L:15,pair:true}],mode:'comfort',nights:3,sleep:'indoor'},DEFAULTS);
  change("S.sleep='camp';applyTripKitDefaults();");
  const gain=notes().offer.gain;has(gain,'A fresh plan uses both panniers');
});
test('[LC-REPLAN-02] the one-time note lists packed items that now have another bag, and ticks stay',()=>{
  setup({bags:THREE,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  const a=plan(),id='tent',from=keysOf(a,id)[0];
  change(`S.packed.${id}=true;S.packed.tool=true;`);
  // More room in the bar roll's place: a new seat pack size moves the tent
  const p=change("S.bags.find(b=>b.uid===3).L=8;S.bags.find(b=>b.uid===2).L=18;");
  const moved=notes().replan.movedPacked;
  assert.equal(moved.includes(id),keysOf(p,id)[0]!==from,'listed exactly when it moved');
  assert.equal(json('S.packed.tent'),true);assert.equal(json('S.packed.tool'),true);
  assert(moved.length>0,'this change moves a packed item');
  const name=json(`kitById('${moved[0]}').name.toLowerCase()`);
  has(render().result,'Packed already, now planned for');has(render().result.toLowerCase(),name);
  change('S.kit.warmers=true;');hasNot(render().result,'Packed already');
});
test('[LC-REPLAN-03] Start again clears ticks and hand placements',()=>{
  setup({bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  change("S.pinned.lock='3-0';S.packed.tent=true;");
  run('startAgain();');
  assert.deepEqual(json('S.pinned'),{});assert.deepEqual(json('S.packed'),{});
  assert.deepEqual(plan().hand.kept,[]);
});
test('[panniers note] kept without panniers while a fresh plan needs them: no claim that the kit fits',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:4,pos:'rack',L:15,pair:true}],mode:'comfort',nights:6,sleep:'camp',kit:['tool']});
  assert.deepEqual(plan().inUse,['1-0','2-0']);
  const p=change("['tent','quilt','pad','puffy'].forEach(id=>S.kit[id]=true);");
  assert.deepEqual(p.inUse,['1-0','2-0'],'it fits, with too little spare for a fresh plan to leave the panniers home');
  const {result}=render();
  hasNot(result,'Why the panniers can stay at home');has(result,'not in this plan');
});
test('[panniers note] kept with panniers while the kit now fits the bike bags: says so and offers Re-plan',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12},{uid:4,pos:'rack',L:15,pair:true}],mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  assert(plan().inUse.includes('4-0'));
  change(`['tent','quilt','pad','puffy','camp','stove','pot'].forEach(id=>S.kit[id]=false);`);
  const {result}=render();
  has(result,'Your bikepacking bags could now take the kit');has(result,'Re-plan');
});

// ---- 15.5: properties over generated plans ----
let seed=20261030;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const pick=a=>a[Math.floor(rand()*a.length)];
const POS=['top','frame','fork','bar','seat','rack','pack'];
const genBags=()=>{const bags=[];let uid=1;
  POS.forEach(pos=>{if(rand()<(pos==='frame'?0.9:0.5)){
    const b={uid:uid++,pos,L:{top:1,frame:pick([3,4.5,6]),fork:pick([2,3,4]),bar:pick([8,12,15]),seat:pick([8,10,14]),rack:pick([12,15,20]),pack:pick([10,20])}[pos]};
    if(pos==='fork'||pos==='rack')b.pair=rand()<0.8;
    if(pos==='top')b.slot='front';
    bags.push(b);}});
  return bags;};
// The invariants of packing-audit.cjs, on the plan as it stands.
run(`globalThis.planErrors=()=>{const A=currentPlan(),errs=[];
  A.slots.forEach(s=>{if(s.left<-1e-8)errs.push('overfill '+s.key);
    if(Math.abs(s.items.reduce((n,k)=>n+k.vol,0)+s.left-s.cap)>1e-6)errs.push('capacity '+s.key);
    s.items.forEach(k=>{if(!fitsLength(k,s))errs.push('length '+k.id+' '+s.key);});});
  const decked=deckClaims().map(k=>k.id),all=[...A.slots.flatMap(s=>s.items),...A.spill];
  activeKit().forEach(k=>{if(decked.includes(k.id))return;
    const pcs=all.filter(x=>x.id===k.id);
    if(Math.abs(pcs.reduce((n,x)=>n+x.vol,0)-itemL(k))>1e-6)errs.push('volume '+k.id);
    if(Math.abs(pcs.reduce((n,x)=>n+placedKg(x),0)-itemKg(k))>1e-6)errs.push('mass '+k.id);
    if(!k.divisible&&pcs.reduce((n,x)=>n+x.units,0)!==qtyOf(k))errs.push('units '+k.id);});
  return errs;};`);
test('[15.5] 300 plans: one added item, one move chip, and the invariants after each step',()=>{
  const ids=json('KIT.filter(k=>!k.divisible).map(k=>k.id)');
  const stats={plans:0,addMoved:0,addBags:0,pinMoved:0,pinBags:0,pinOut:0,errors:0};
  for(let i=0;i<2000&&stats.plans<300;i++){
    const bags=genBags(),nights=pick([1,2,3,5,7]),sleep=pick(['camp','camp','mixed','indoor']),mode=pick(['comfort','light']);
    const a=setup({bags,mode,nights,sleep},DEFAULTS);
    stats.errors+=json('planErrors()').length;
    if(overL(a)>0||!a.inUse.length)continue;
    stats.plans++;
    const stored=json('S.placements');
    const kit0=json('Object.keys(S.kit).filter(k=>S.kit[k])');
    const extra=pick(ids.filter(id=>!kit0.includes(id)));
    const b=change(`S.kit[${JSON.stringify(extra)}]=true;`);
    stats.errors+=json('planErrors()').length;
    if(othersMoved(a,b,[extra]).length)stats.addMoved++;
    if(b.inUse.join()!==a.inUse.join())stats.addBags++;
    run(`S.kit[${JSON.stringify(extra)}]=false;S.placements=${JSON.stringify(stored)};`);
    const base=plan();
    const solid=Object.keys(base.items).flatMap(id=>base.items[id].map(e=>[e[0],id]));
    if(!solid.length)continue;
    const [from,id]=pick(solid);
    const targets=json(`moveTargets(currentPlan(),${JSON.stringify(from)},${JSON.stringify(id)})`);
    if(!targets.length)continue;
    const p=change(`S.pinned[${JSON.stringify(id)}]=${JSON.stringify(targets[0].key)};`);
    stats.errors+=json('planErrors()').length;
    if(othersMoved(base,p,[id]).length)stats.pinMoved++;
    if(p.inUse.join()!==base.inUse.join())stats.pinBags++;
    if(p.reach.outOfReach.some(x=>x!==id&&!base.reach.outOfReach.includes(x)))stats.pinOut++;
  }
  assert.equal(stats.plans,300);
  assert.deepEqual([stats.errors,stats.addMoved,stats.pinMoved,stats.pinBags,stats.pinOut],[0,0,0,0,0],JSON.stringify(stats));
  assert(stats.addBags<=12,'the bags in use rarely change after adding: '+stats.addBags);
  console.log('    '+JSON.stringify(stats));
});
test('[15.5] kept steps at random keep the invariants',()=>{
  seed=4711;
  const ids=json('KIT.map(k=>k.id)');
  let steps=0;
  for(let i=0;i<100;i++){
    setup({bags:genBags(),mode:pick(['comfort','light']),nights:pick([0,1,3,6]),sleep:pick(['camp','mixed','indoor'])},DEFAULTS);
    for(let n=0;n<6;n++){
      const id=JSON.stringify(pick(ids)),r=rand();
      run(r<.3?`S.kit[${id}]=true;`:r<.5?`S.kit[${id}]=false;`:r<.65?`if(kitById(${id}).qtyable)S.qty[${id}]=${1+Math.floor(rand()*4)};`
        :r<.8?`S.custom[${id}]={L:${(0.1+rand()*3).toFixed(2)},kg:.3,rigid:0};`:r<.9?`S.nights=${pick([0,1,3,6])};applyTripKitDefaults();`:`S.decks.rack=!S.decks.rack;`);
      const errs=json('planErrors()');
      assert.deepEqual(errs,[],`plan ${i} step ${n}`);steps++;
    }
  }
  console.log('    '+steps+' steps');
});
console.log(JSON.stringify({status:'passed',cases}));
