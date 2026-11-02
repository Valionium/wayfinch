// Fresh-plan rules of the bag-selection design (sections 5, 6) and its acceptance cases (15.1).
const assert=require('node:assert/strict');
const {planKit}=require('./plan-kit.cjs');
const kit=planKit(),{run}=kit.vm;
const json=code=>JSON.parse(run(`JSON.stringify(${code})`)??'null');
const near=(actual,expected,note,by=0.005)=>assert(Math.abs(actual-expected)<=by,`${note}: ${actual} versus ${expected}`);
let cases=0;
function test(name,fn){fn();cases++;console.log('PASS '+name);}

// The two starting kits of design 15: the page's starting selection and the trip defaults.
const ON="Object.keys(S.kit).forEach(k=>S.kit[k]=false);KIT.forEach(k=>S.kit[k.id]=!!k.on);";
const DEFAULTS='S.kitTouched={};S.kit={};applyTripKitDefaults();';
const SIX=['quilt','pad','tent','rain','puffy','base1','bibs','socks','camp','cap','underwear','shades','stove','pot','spork','food','snacks','tool','tubes','pump','levers','link','chaintl','hanger','patch','boot','lock','bank','phone','cables','headlamp','firstaid','wash','towel','teeth','wipes','docs','cash'];
function setup(p,code){
  run(`(()=>{const p=${JSON.stringify(p)};
    S.bags=p.bags.map(b=>({...b}));S.nextUid=Math.max(1,...S.bags.map(b=>b.uid+1));
    if(p.kit){Object.keys(S.kit).forEach(k=>S.kit[k]=false);p.kit.forEach(id=>S.kit[id]=true);}
    S.qty=p.qty||{};S.custom=p.custom||{};S.pinned=p.pinned||{};S.packed={};
    S.mode=p.mode||'comfort';S.nights=p.nights===undefined?6:p.nights;S.sleep=p.sleep||'camp';
    S.foodMode=p.foodMode===undefined?2:p.foodMode;S.decks={bar:false,rack:false,...(p.decks||{})};S.packEff=null;S.placements=null;
  })()`);
  if(code)run(code);
}
// Placement into one given set of bags, as data.
const placed=()=>json(`(()=>{const A=allocateInto(S.bags.flatMap(physical));return {
  slots:A.slots.map(s=>({key:s.key,used:+(s.cap-s.left).toFixed(2),items:s.items.map(i=>i.id+(i.part?'~':'')+':'+i.vol)})),
  spill:A.spill.map(i=>i.id+':'+i.vol),stranded:A.stranded.map(s=>s.item.id),items:A.items,food:A.food,overflow:A.overflow};})()`);
const holds=(p,key,id)=>p.slots.find(s=>s.key===key).items.some(x=>x.startsWith(id+':')||x.startsWith(id+'~'));

// ---- Task 4: the list, the order, placing the kit ----
test('[MUST_REACH] 15 ids: the old critical list plus the rain kit; acc is retired',()=>{
  const list=json('MUST_REACH');
  assert.equal(list.length,15);
  ['rain','rainpants','shoecov','gloves','warmers','socks','pump','levers','tool','plugs','link','snacks','docs','sun','bank'].forEach(id=>assert(list.includes(id),id));
  assert.equal(json('KIT.filter(k=>k.acc).length'),0);
  assert.equal(json("typeof ACC_CRITICAL==='undefined'"),true);
  assert.deepEqual(json("KIT.filter(k=>k.rainkit).map(k=>k.id).sort()"),['gloves','rain','rainpants','shoecov','socks','warmers']);
});
test('[unitOrder] position, then mount, then half, whatever order the bags were added',()=>{
  setup({bags:[{uid:9,pos:'pack',L:10},{uid:8,pos:'rack',L:10,pair:true},{uid:7,pos:'seat',L:10},{uid:6,pos:'bar',L:10},{uid:5,pos:'fork',L:3,pair:true},{uid:4,pos:'frame',L:5},{uid:3,pos:'top',L:1,slot:'rear'},{uid:2,pos:'top',L:1,slot:'front'}],kit:[]});
  assert.deepEqual(json('unitOrder(S.bags.flatMap(physical)).map(u=>u.key)'),['2-0','3-0','4-0','5-0','5-1','6-0','7-0','8-0','8-1','9-0']);
});
test('[packingOrder] ride snacks, rain kit, other must-reach (smallest first), tier 1, sleep, warmth, the rest',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'top',L:1,slot:'front'},{uid:3,pos:'fork',L:3},{uid:4,pos:'seat',L:10},{uid:5,pos:'bar',L:10}],nights:2,sleep:'camp',kit:['bibs','quilt','puffy','tubes','pump','tool','snacks','rain','socks','food']});
  const order=json('packingOrder(activeKit()).map(k=>k.id)');
  assert.equal(order[0],'snacks');
  assert.deepEqual(order.slice(1,3).sort(),['rain','socks']);
  assert.deepEqual(order.slice(3,5),['tool','pump']);
  assert.equal(order[5],'tubes');assert.equal(order[6],'quilt');assert.equal(order.indexOf('food'),-1);
  assert(order.indexOf('puffy')<order.indexOf('bibs'));
});
test('[placePiece] a must-reach piece takes a reachable bag before a preferred sealed one',()=>{
  setup({bags:[{uid:1,pos:'top',L:2,slot:'front'},{uid:2,pos:'bar',L:14}],kit:['tool']});
  const got=json(`(()=>{const units=S.bags.flatMap(physical).map(b=>({...b,left:usableL(b),cap:usableL(b),items:[]}));
    return placePiece({...kitById('tool'),pref:['bar','top'],vol:0.2},units).key;})()`);
  assert.equal(got,'1-0');
});
test('[LC-ORDER-02] item 16: 2 L top-tube bag and seat pack: the rain trousers go in the seat pack, not out of reach',()=>{
  setup({bags:[{uid:1,pos:'top',L:2,slot:'front'},{uid:2,pos:'seat',L:14}],nights:2,sleep:'indoor',kit:['rainpants','tool','pump','base1']});
  const p=placed();assert(holds(p,'2-0','rainpants'));assert.deepEqual(p.stranded.filter(id=>id==='rainpants'),[]);
});
test('[LC-ORDER-01] the same bags in every order give identical placements',()=>{
  const bags=[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'fork',L:3,pair:true},{uid:4,pos:'top',L:1,slot:'front'},{uid:5,pos:'rack',L:15,pair:true}];
  const orders=[[0,1,2,3,4],[4,3,2,1,0],[2,0,4,1,3],[1,4,0,3,2],[3,2,1,4,0]];
  const results=orders.map(o=>{setup({bags:o.map(i=>bags[i]),mode:'comfort',nights:3,sleep:'camp'},ON);return JSON.stringify(placed());});
  results.forEach(r=>assert.equal(r,results[0]));
});
test('[LC-SEL-12] placement: rain jacket and socks in the frame bag, nothing sealed',()=>{
  setup({bags:[{uid:1,pos:'frame',L:4.5},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'rack',L:20,pair:true}],mode:'comfort',nights:3,sleep:'camp'},ON);
  const p=placed();assert.equal(json('kitL()'),30.1);assert(holds(p,'1-0','rain'));assert(holds(p,'1-0','socks'));assert.deepEqual(p.stranded,[]);
});
test('[LC-SEL-13] placement: the whole rain kit in the frame bag',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'fork',L:3.5,pair:true},{uid:3,pos:'seat',L:10},{uid:4,pos:'bar',L:12}],mode:'light',nights:1,sleep:'camp'},DEFAULTS+"['rainpants','gloves','shoecov'].forEach(id=>S.kit[id]=true);");
  const p=placed();assert.equal(json('kitL()'),26.12);
  ['rain','rainpants','gloves','shoecov','socks'].forEach(id=>assert(holds(p,'1-0',id),id));assert.deepEqual(p.stranded,[]);
});
test('[LC-SEL-14] food of 0 L goes in the frame bag and its weight counts',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12}],mode:'comfort',nights:6,sleep:'camp',kit:SIX.filter(id=>!['stove','pot'].includes(id)),custom:{food:{L:0,kg:0.7,rigid:0}}});
  const p=placed();assert(holds(p,'1-0','food'));assert.deepEqual(p.food,{'1-0':0});
  const zones=json('Object.values(loadByZone(allocateInto(S.bags.flatMap(physical)).slots)).reduce((a,b)=>a+b,0)');
  near(zones,9.73,'zones add up to the kit weight');
  const m=json('getChecklistModel(allocateInto(S.bags.flatMap(physical)))');
  assert(!m.warnings.some(w=>w.includes('carrying place')));
});
test('[placeKit] returns canonical items, food and overflow',()=>{
  setup({bags:[{uid:1,pos:'frame',L:1.5}],kit:['base1','food'],qty:{base1:4},foodMode:1,nights:0,sleep:'indoor'});
  const r=json("placeKit(activeKit(),S.bags.flatMap(physical))");
  assert.deepEqual(r.items.base1,[['1-0',2,1]]);
  assert.deepEqual(r.overflow.filter(o=>o.id==='base1'),[{id:'base1',pieces:2,litres:1,tooLong:false}]);
  assert(r.overflow.some(o=>o.id==='food'));assert.deepEqual(r.food,{'1-0':0.32});
});
test('[pairs] a hand placement stays in its half and the rest still balances',()=>{
  setup({bags:[{uid:1,pos:'rack',L:20,pair:true}],kit:['base1','bibs','puffy','camp'],pinned:{bibs:'1-1'},nights:0,sleep:'indoor'});
  const p=placed(),a=p.slots[0],b=p.slots[1];
  assert(holds(p,'1-1','bibs'));
  assert(Math.abs(a.used-b.used)<=2,`halves ${a.used} and ${b.used}`);assert(a.items.length>0);
});
test('[pairs] food shares in a pair are poured until the halves are equally full',()=>{
  setup({bags:[{uid:1,pos:'rack',L:20,pair:true}],kit:['tent','food'],nights:1,sleep:'camp'});
  const p=placed();assert(Math.abs(p.slots[0].used-p.slots[1].used)<=2.6);
  assert(Object.keys(p.food).length>=1);
});
test('[pairs] a 0 L food in a pair keeps its weight',()=>{
  setup({bags:[{uid:1,pos:'fork',L:3,pair:true}],kit:['base1','bibs','food'],custom:{food:{L:0,kg:0.7,rigid:0}},nights:0,sleep:'indoor',foodMode:1});
  near(json('allocateInto(S.bags.flatMap(physical)).slots.reduce((n,s)=>n+weightIn(s),0)'),json('kitKg()'),'weight kept',0.051);
  assert.deepEqual(Object.values(placed().food),[0]);
});

// ---- Task 5: the rack decision and which bags ----
const plan=()=>json(`(()=>{const p=freshPlan();return {inUse:p.inUse,rack:p.rack,reach:p.reach,summary:p.summary,items:p.items,
  used:Object.fromEntries(p.slots.map(s=>[s.key,+(s.cap-s.left).toFixed(2)])),back:backOf(p),over:spillOf(p),
  empty:p.slots.filter(s=>!s.items.length).map(s=>s.key),kit:kitL(),
  zones:(()=>{const z=loadByZone(p.slots),t=Object.values(z).reduce((a,b)=>a+b,0)||1;return Object.fromEntries(Object.entries(z).map(([k,v])=>[k,Math.round(v/t*100)]));})()};})()`);
const inBag=(p,id,key)=>(p.items[id]||[]).some(e=>e[0]===key);
const B3=(pair=20)=>[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'pack',L:20},{uid:4,pos:'rack',L:pair,pair:true}];
// Item 16 (19): values re-measured in Task 9a, for the owner's ruling at Task 10.
test('[LC-SEL-01] #3: panniers go on, nothing on the back',()=>{
  setup({bags:B3(),mode:'light',nights:3,sleep:'camp'},ON);const p=plan();
  assert.equal(p.kit,28.1);assert.deepEqual(p.inUse,['1-0','4-0','4-1']);assert.equal(p.rack.panniers,true);assert.equal(p.rack.setL,17.6);
  near(p.used['4-0'],11.41,'half 1');near(p.used['4-1'],11.41,'half 2');assert.equal(p.back,0);assert.deepEqual(p.reach.outOfReach,[]);
});
test('[LC-SEL-02] #3 in Comfortable',()=>{
  setup({bags:B3(),mode:'comfort',nights:3,sleep:'camp'},ON);const p=plan();
  assert.equal(p.kit,30.1);assert.deepEqual(p.inUse,['1-0','2-0','4-0','4-1']);near(p.used['4-0'],6.26,'half 1');near(p.used['4-1'],6.26,'half 2');assert.equal(p.back,0);
});
test('[LC-SEL-03] #3 verifier and the pair-15 variant',()=>{
  setup({bags:B3(),mode:'light',nights:3,sleep:'camp'},DEFAULTS);let p=plan();
  assert.equal(p.kit,28.49);assert.deepEqual(p.inUse,['1-0','4-0','4-1']);near(p.used['4-0'],11.6,'half 1');near(p.used['4-1'],11.61,'half 2');
  setup({bags:B3(15),mode:'light',nights:6,sleep:'camp',kit:SIX});p=plan();
  assert.equal(p.kit,28.49);assert.deepEqual(p.inUse,['1-0','4-0','4-1']);near(p.used['4-0'],11.6,'half 1');near(p.used['4-1'],11.61,'half 2');
  setup({bags:B3(15),mode:'comfort',nights:6,sleep:'camp',kit:SIX.filter(id=>!['camp','towel'].includes(id))});p=plan();
  assert.equal(p.kit,28.49);assert.deepEqual(p.inUse,['1-0','2-0','4-0','4-1']);assert.equal(p.back,0);
});
for(const mode of ['light','comfort'])test(`[LC-SEL-05] #4(a), ${mode}: roll and seat pack, backpack unused, 8 named`,()=>{
  setup({bags:[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:12},{uid:3,pos:'pack',L:8}],mode,nights:1,sleep:'indoor'},ON);const p=plan();
  assert.equal(p.kit,mode==='light'?13.05:13.55);assert.deepEqual(p.inUse,['2-0','1-0']);assert.equal(p.back,0);assert.deepEqual(p.reach.outOfReach,[]);
});
test('[LC-SEL-06] #4(a) analysis: Comfortable two bags, Lightweight the seat pack alone',()=>{
  const bags=[{uid:1,pos:'bar',L:12},{uid:2,pos:'seat',L:14},{uid:3,pos:'pack',L:10}];
  setup({bags,mode:'comfort',nights:3,sleep:'indoor'},DEFAULTS);let p=plan();assert.equal(p.kit,12.29);assert.deepEqual(p.inUse,['1-0','2-0']);assert.equal(p.back,0);
  setup({bags,mode:'light',nights:3,sleep:'indoor'},DEFAULTS);p=plan();assert.deepEqual(p.inUse,['2-0']);near(p.used['2-0'],12.29,'seat pack');assert.equal(p.back,0);
});
test('[LC-SEL-07] #4(a-prime): a 1 L top-tube bag takes the small must-reach items',()=>{
  const bags=[{uid:1,pos:'top',L:1,slot:'front'},{uid:2,pos:'bar',L:12},{uid:3,pos:'seat',L:14},{uid:4,pos:'pack',L:10}];
  setup({bags,mode:'comfort',nights:3,sleep:'indoor'},DEFAULTS);let p=plan();assert.deepEqual(p.inUse,['1-0','2-0','3-0']);
  setup({bags,mode:'light',nights:3,sleep:'indoor'},DEFAULTS);p=plan();assert.deepEqual(p.inUse,['1-0','3-0']);assert.equal(p.back,0);
  assert.deepEqual(p.reach.outOfReach,[]);
  ['snacks','link','levers','docs','chaintl','hanger'].forEach(id=>assert(inBag(p,id,'1-0'),id));
});
test('[LC-SEL-08] M1: panniers stay home, frame bag and seat pack, 13.1 L spare',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'rack',L:15,pair:true}],mode:'comfort',nights:3,sleep:'camp',kit:['tool','pump','rain','base1'],custom:{tool:{L:0.2,kg:0.15,rigid:0},pump:{L:0.4,kg:0.15,rigid:0},rain:{L:1.2,kg:0.3,rigid:0},base1:{L:2.7,kg:0.5,rigid:0}}});
  const p=plan();assert.deepEqual(p.inUse,['1-0','2-0']);assert.equal(p.rack.panniers,false);assert.equal(p.rack.setL,17.6);assert.equal(Math.round(p.rack.spareShare*100),74);assert.equal(p.summary.spareL,13.1);
});
test('[LC-SEL-09] M1-a: all five bike units, 23.3 L spare, the roll named empty',()=>{
  setup({bags:[{uid:1,pos:'frame',L:4.5},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'bar',L:12},{uid:4,pos:'seat',L:14},{uid:5,pos:'rack',L:15,pair:true}],mode:'comfort',nights:0,sleep:'indoor'},DEFAULTS);
  const p=plan();assert.equal(p.kit,8.82);assert.deepEqual(p.inUse,['1-0','2-0','2-1','3-0','4-0']);assert.equal(p.rack.panniers,false);assert.equal(p.summary.spareL,23.3);assert.equal(p.rack.setL,32.12);assert.deepEqual(p.empty,['3-0']);
});
const M1B=[{uid:1,pos:'frame',L:3},{uid:3,pos:'bar',L:12},{uid:4,pos:'seat',L:10},{uid:5,pos:'rack',L:20,pair:true}];
test('[LC-SEL-10] M1-b: five units, jacket in the frame bag, 27/12/61',()=>{
  setup({bags:M1B,mode:'comfort',nights:1,sleep:'camp'},DEFAULTS);const p=plan();
  assert.equal(p.kit,24.52);assert.deepEqual(p.inUse,['1-0','3-0','4-0','5-0','5-1']);assert(inBag(p,'rain','1-0'));assert.equal(p.rack.setL,22);
  assert.deepEqual([p.zones.front,p.zones.centre,p.zones.rear],[27,14,59]);assert.deepEqual(p.reach.outOfReach,[]);
});
test('[LC-SEL-11] M1-b in Lightweight: frame and panniers, 88% rear',()=>{
  setup({bags:M1B,mode:'light',nights:1,sleep:'camp'},DEFAULTS);const p=plan();
  assert.deepEqual(p.inUse,['1-0','5-0','5-1']);assert(inBag(p,'rain','1-0'));assert.equal(p.zones.rear,86);assert.deepEqual(p.reach.outOfReach,[]);
});
test('[LC-SEL-12] M2: Comfortable all five, Lightweight frame and panniers, nothing sealed',()=>{
  const bags=[{uid:1,pos:'frame',L:4.5},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'rack',L:20,pair:true}];
  setup({bags,mode:'comfort',nights:3,sleep:'camp'},ON);let p=plan();assert.deepEqual(p.inUse,['1-0','2-0','2-1','3-0','3-1']);assert.deepEqual(p.reach.outOfReach,[]);
  setup({bags,mode:'light',nights:3,sleep:'camp'},ON);p=plan();assert.deepEqual(p.inUse,['1-0','3-0','3-1']);assert.deepEqual(p.reach.outOfReach,[]);assert(inBag(p,'rain','1-0'));assert(inBag(p,'socks','1-0'));
});
test('[LC-SEL-13] M2 analysis: fork cage 2 not used, nothing sealed',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'fork',L:3.5,pair:true},{uid:3,pos:'seat',L:10},{uid:4,pos:'bar',L:12}],mode:'light',nights:1,sleep:'camp'},DEFAULTS+"['rainpants','gloves','shoecov'].forEach(id=>S.kit[id]=true);");
  const p=plan();assert.deepEqual(p.inUse,['1-0','2-0','4-0','3-0']);assert.deepEqual(p.reach.outOfReach,[]);
});
test('[freshPlan] takes inputs, and changes nothing',()=>{
  setup({bags:B3(),mode:'light',nights:3,sleep:'camp'},ON);
  const before=json('[S.mode,S.kit]');
  assert.deepEqual(json("freshPlan({mode:'comfort'}).inUse"),['1-0','2-0','4-0','4-1']);
  assert.deepEqual(json('[S.mode,S.kit]'),before);
});
test('[no bags] an empty cupboard gives an empty plan',()=>{
  setup({bags:[],kit:['tool']});const p=plan();assert.deepEqual(p.inUse,[]);assert.equal(p.rack.panniers,false);
});

// Today's selection, frozen: the comparison of LC-SEL-04 and LC-FRESH-04.
run(require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/today-selection.js'),'utf8'));
run(`globalThis.measure=()=>{
  const nowR=selectBags(),oldR=(()=>{POSITIONS.seat.accessible=false;POSITIONS.rack.accessible=false;try{return todaySelection();}finally{POSITIONS.seat.accessible=true;POSITIONS.rack.accessible=true;}})();
  const notWithin=r=>new Set([...r.slots.flatMap(s=>s.items.filter(k=>!k.part&&MUST_REACH.includes(k.id)&&!reachableFor(k,s.pos)).map(k=>k.id)),...r.spill.filter(k=>MUST_REACH.includes(k.id)).map(k=>k.id)]).size;
  const room=s=>s.cap-s.items.filter(k=>!k.part).reduce((n,k)=>n+k.vol,0);
  const buried=nowR.slots.flatMap(s=>s.items.filter(k=>!k.part&&!k.pinned&&MUST_REACH.includes(k.id)&&!reachableFor(k,s.pos)).filter(k=>
    nowR.slots.some(t=>reachableFor(k,t.pos)&&!(t.pos==='seat'&&isHeavy(k))&&room(t)+1e-9>=k.vol&&fitsLength(k,t))).map(k=>k.id));
  let bikeOver=null;const back=backOf(nowR);
  if(back>0)bikeOver=spillOf(freshPlan({bags:S.bags.filter(b=>b.pos!=='pack')}));
  const bankOver=+nowR.spill.filter(k=>k.id==='bank').reduce((n,k)=>n+k.vol,0).toFixed(2);
  return {bankOver,now:{over:spillOf(nowR),back,within:notWithin(nowR)},old:{over:spillOf(oldR),back:backOf(oldR),within:notWithin(oldR)},buried,bikeOver,
    homeNote:nowR.rack.setL!==null&&!nowR.rack.panniers};
};`);
const measure=(p,code)=>{setup(p,code);return json('measure()');};
// Item 16: "not within reach" is no longer never worse; the counts are pinned below for the owner's ruling at Task 10.
let reachWorse=0,bankOverflow=0,backWorse=0;
const never=(m,label)=>{
  if(m.bankOver>0)bankOverflow++;
  assert(m.now.over<=m.old.over+1e-9,`${label}: overflow ${m.now.over} over today's ${m.old.over}`);
  if(m.now.back>m.old.back+1e-9)backWorse++;
  if(m.now.within>m.old.within)reachWorse++;
};
const GRID={back:12,fewer:146,worse:0},SEED99=[0,0,0],SEED777=[1,0,2];
test('[LC-SEL-04] the #3 grid: backpack carries kit in 12 of 648, never with the note, never worse than today',()=>{
  let n=0,back=0,oldBack=0,fewer=0;reachWorse=0;backWorse=0;bankOverflow=0;
  for(const frame of [4.5,6])for(const seat of [10,14])for(const pack of [10,20,30])for(const rack of [10,15,20])for(const mode of ['light','comfort'])for(const nights of [1,3,6])for(const sleep of ['camp','mixed','indoor']){
    const m=measure({bags:[{uid:1,pos:'frame',L:frame},{uid:2,pos:'seat',L:seat},{uid:3,pos:'pack',L:pack},{uid:4,pos:'rack',L:rack,pair:true}],mode,nights,sleep},DEFAULTS);
    n++;if(m.now.back>0)back++;if(m.old.back>0)oldBack++;if(m.now.within<m.old.within)fewer++;
    never(m,`grid ${frame} ${seat} ${pack} ${rack} ${mode} ${nights} ${sleep}`);
    assert(!(m.now.back>0&&m.homeNote),'panniers note with kit on the back');
    if(m.now.back>0)assert(m.bikeOver>0,'backpack only when the bike is full');
  }
  assert.equal(n,648);assert.equal(oldBack,262);assert.equal(back,GRID.back);assert.equal(fewer,GRID.fewer);assert.deepEqual([reachWorse,backWorse,bankOverflow],[GRID.worse,0,0],'reach worse, back worse, power bank in the overflow');
});
const seeded=(seed,count,fn,slot)=>{
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const pick=a=>a[Math.floor(rand()*a.length)];
  for(let i=0;i<count;i++){const bags=[];let uid=1;
    ['top','frame','fork','bar','seat','rack','pack'].forEach(pos=>{if(rand()<(pos==='frame'?0.9:0.5)){
      const b={uid:uid++,pos,L:{top:1,frame:pick([3,4.5,6]),fork:pick([2,3,4]),bar:pick([8,12,15]),seat:pick([8,10,14]),rack:pick([12,15,20]),pack:pick([10,20])}[pos]};
      if(pos==='fork'||pos==='rack')b.pair=rand()<0.8;if(pos==='top')b.slot=slot||pick(['front','rear']);bags.push(b);}});
    const p={bags,mode:pick(['comfort','light']),nights:pick([0,1,2,3,5,7]),sleep:pick(['camp','camp','mixed','indoor'])};
    fn(p,i,pick);}
};
test('[LC-FRESH-01..04] 300 seeded plans: reach, backpack, panniers note, never worse than today',()=>{
  reachWorse=0;backWorse=0;bankOverflow=0;
  seeded(99,300,p=>{
    const m=measure(p,DEFAULTS),label=JSON.stringify(p);
    assert.deepEqual(m.buried,[],'FRESH-01 '+label);
    if(m.now.back>0)assert(m.bikeOver>0,'FRESH-02 '+label);
    assert(!(m.now.back>0&&m.homeNote),'FRESH-03 '+label);
    never(m,'FRESH-04 '+label);
  });
  assert.deepEqual([reachWorse,backWorse,bankOverflow],SEED99,'reach worse, back worse, power bank in the overflow');
});
test('[LC-FRESH-04] the design 600 generated setups: never worse than today',()=>{
  reachWorse=0;backWorse=0;bankOverflow=0;seeded(777,600,p=>never(measure(p,DEFAULTS),'FRESH-04 '+JSON.stringify(p)),'front');
  assert.deepEqual([reachWorse,backWorse,bankOverflow],SEED777,'reach worse, back worse, power bank in the overflow');
});
test('[LC-FRESH-01] hand placements are exempt, and their bag stays in use',()=>{
  seeded(4242,120,(p,i,pick)=>{
    setup(p,DEFAULTS);
    const ids=json('activeKit().filter(k=>!k.divisible).map(k=>k.id)'),keys=json('usableUnits().map(u=>u.key)');
    if(!ids.length||!keys.length)return;
    run(`S.pinned=${JSON.stringify({[pick(ids)]:pick(keys)})};`);
    const r=json('(()=>{const r=selectBags(),pinned=Object.entries(S.pinned)[0];return {inUse:r.chosen.map(u=>u.key),kept:r.slots.some(s=>s.key===pinned[1]&&s.items.some(k=>k.id===pinned[0]&&k.pinned)),notKept:r.notKept.length,want:pinned[1],rack:r.rack,buried:measure().buried};})()');
    assert(r.kept||r.notKept===1,'a pin is kept or reported');
    if(r.kept){assert(r.inUse.includes(r.want),'its bag stays in use');if(r.want.startsWith&&json(`usableUnits().find(u=>u.key==='${r.want}').pos`)==='rack')assert.equal(r.rack.byHand,true);}
    assert.deepEqual(r.buried,[],'reach holds for the others '+JSON.stringify(p));
  });
});

// ---- Task 6: texts, counts and move chips from the plan ----
const html=kit.vm.html;
const cut=(a,b)=>{const s=html.indexOf(a),e=html.indexOf(b,s+a.length);assert(s>=0&&e>s,'Missing '+a);return html.slice(s,e);};
run(cut('function renderResult(){','/* ==== 84-packing-checklist.js ==== */'));
run("buildThumb=()=>'';");
const strip=t=>String(t).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const render=()=>{run('renderResult();');return {verdict:strip(kit.vm.nodes.get('verdictBox').innerHTML),result:strip(kit.vm.nodes.get('resultBox').innerHTML)};};
const count=(text,part)=>text.split(part).length-1;
const has=(text,part)=>assert(text.includes(part),`missing "${part}" in: ${text.slice(0,3000)}`);
const hasNot=(text,part)=>assert(!text.includes(part),`unexpected "${part}"`);
test('[LC-ADV-01] M3: the tent alone does not clear it; tent and mat do',()=>{
  setup({bags:[{uid:1,pos:'bar',L:12},{uid:2,pos:'seat',L:6}],decks:{bar:true},mode:'comfort',nights:3,sleep:'camp',kit:['tent','pad','quilt','puffy','camp','tool','base1','bibs'],qty:{camp:3,base1:2}});
  const {result,verdict}=render();has(verdict,'5.1 litres over');
  has(result,'Strap the tent and you claw back 5 L — you would still be 0.6 L over.');
  has(result,'Strap the tent and the sleeping mat and it fits');
});
test('[LC-ADV-02] M3 analysis: 0.85 L still over; tent and mat fit',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'bar',L:12},{uid:3,pos:'seat',L:10}],decks:{bar:true},mode:'comfort',nights:6,sleep:'camp',kit:SIX});
  const {result,verdict}=render();has(verdict,'5.85 litres over');
  has(result,'you would still be 0.85 L over');has(result,'Strap the tent and the sleeping mat and it fits');hasNot(result,'enough to take');
});
test('[LC-ADV-03] M4: the same spare in the verdict and the note; the basis is labelled',()=>{
  setup({bags:[{uid:1,pos:'rack',L:15,pair:true},{uid:3,pos:'seat',L:14},{uid:4,pos:'frame',L:5},{uid:5,pos:'bar',L:12}],mode:'comfort',nights:2,sleep:'indoor'},DEFAULTS);
  const {result,verdict}=render();
  has(verdict,'27.28 L mounted, 15.1 L spare');hasNot(verdict,'The handlebar roll is mounted and empty.');
  has(result,'Leave the panniers at home');has(result,'15.1 L spare in the bags you mount');has(result,'all your bikepacking bags together: 15.1 L of 27.3 L spare (55%)');
});
test('[LC-ADV-04] M4 day ride: both fork cages named, 14.5 L in both places',()=>{
  setup({bags:[{uid:1,pos:'rack',L:15,pair:true},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'seat',L:14},{uid:4,pos:'top',slot:'front',L:1.5},{uid:5,pos:'frame',L:5}],mode:'comfort',nights:0,sleep:'indoor'},DEFAULTS);
  const {result,verdict}=render();
  has(verdict,'23.32 L mounted, 14.5 L spare');has(verdict,'Fork cage 1 and fork cage 2 are mounted and empty.');has(result,'14.5 L spare in the bags you mount');
});
test('[LC-ADV-05] M4-c: no panniers-at-home note, because the panniers go on',()=>{
  setup({bags:B3(),mode:'light',nights:3,sleep:'camp'},DEFAULTS);
  const {result}=render();hasNot(result,'at home entirely');hasNot(result,'Leave the panniers');has(result,'Use the panniers');hasNot(result,'Commit to the panniers');hasNot(result,'ran out of room');
});
test('[LC-ADV-06] packing-6: 4 of 5; the pair sentence once, for the fork cages',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'rack',L:15,pair:true}],mode:'light',nights:1,sleep:'indoor',kit:['tool','pump','rain']});
  assert.deepEqual(plan().inUse,['1-0']);
  const {result}=render();has(result,'4 of 5');assert.equal(count(result,'You listed these as a pair'),0);hasNot(result,'4 of 3');
});
test('[LC-ADV-07] packing-6 analysis: 4 of 5, no pair sentence',()=>{
  setup({bags:[{uid:1,pos:'frame',L:3},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'rack',L:15,pair:true}],mode:'light',nights:0,sleep:'indoor',kit:['cap','snacks','tool','tubes','pump','levers','patch','phone','docs']});
  assert.equal(json('kitL()'),2.4);assert.deepEqual(plan().inUse,['1-0']);
  const {result}=render();has(result,'4 of 5');assert.equal(count(result,'You listed these as a pair'),0);
});
test('[LC-ADV-09] the verdict counts bags holding kit, and names the empty ones',()=>{
  setup({bags:[{uid:1,pos:'top',slot:'front',L:1},{uid:2,pos:'frame',L:5},{uid:3,pos:'fork',L:3,pair:true},{uid:4,pos:'bar',L:12},{uid:5,pos:'seat',L:14}],mode:'comfort',nights:0,sleep:'indoor'},DEFAULTS);
  has(render().verdict,'Your kit goes into 4 of your 6 bags — 33.44 L mounted, 24.6 L spare. Fork cage 2 and the handlebar roll are mounted and empty.');
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12}],mode:'comfort',nights:3,sleep:'indoor'},DEFAULTS);
  has(render().verdict,'Your kit goes into 3 of your 3 bags — 28.16 L mounted, 15.9 L spare.');
});
test('[LC-ADV-10] the Leave-it-behind search makes no fresh plan',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:10}],mode:'comfort',nights:6,sleep:'camp',kit:SIX.filter(id=>id!=='tent')},"addKitItem('Tarp','Sleep',1.5,0.5,0,0);");
  run('globalThis.__fresh=0;{const real=selectBags;selectBags=function(){__fresh++;return real.apply(this,arguments);};}');
  const base=json('(()=>{const p=currentPlan();__fresh=0;const r=fixSuggestion();return {fresh:__fresh,over:p.overflow.length,drop:r&&r.drop.length,restored:JSON.stringify(S.kit)};})()');
  assert(base.over>0,'the plan is over');assert.equal(base.fresh,0);assert(base.drop>0);
  run("KIT.splice(KIT.findIndex(k=>k.added),1);S.kit={...S.kit};");
});
test('[LC-SEL-11 text] Lightweight names the bike bags it leaves at home; Comfortable keeps them',()=>{
  setup({bags:M1B,mode:'light',nights:1,sleep:'camp'},DEFAULTS);let {result}=render();
  has(result,'Use the panniers');has(result,'your bikepacking bags take 22.0 L; the kit is 24.5 L');has(result,'leaves the handlebar roll and seat pack at home');has(result,'86% of the load is behind you');
  setup({bags:M1B,mode:'comfort',nights:1,sleep:'camp'},DEFAULTS);({result}=render());
  has(result,'Your bikepacking bags all stay mounted');hasNot(result,'One cost worth knowing');
});
test('[panniers note] the squeeze and the hand-placement cases',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:10},{uid:3,pos:'rack',L:15,pair:true}],mode:'comfort',nights:0,sleep:'indoor',kit:['base1','puffy'],custom:{base1:{L:5,kg:1,rigid:0},puffy:{L:7.5,kg:1,rigid:0}}});
  let {result}=render();const share=json('Math.round(freshPlan().rack.spareShare*100)');assert(share>0&&share<18,'share '+share);
  has(result,`only ${share}% of them would be spare`);
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'rack',L:15,pair:true}],mode:'light',nights:0,sleep:'indoor',kit:['tool'],pinned:{tool:'2-1'}});
  ({result}=render());has(result,'You put something in a pannier');
});
test('[LC-SEL-05 text] the reach report names all 8 and gives the top-tube advice; no backpack sentence',()=>{
  setup({bags:[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:12},{uid:3,pos:'pack',L:8}],mode:'light',nights:1,sleep:'indoor'},ON);
  const {result}=render();hasNot(result,'Your rain kit is out of reach');hasNot(result,'things you reach for are in');hasNot(result,'You have no bag that opens in place');hasNot(result,'ran out of room');hasNot(result,'riding on your back');
  has(result,'Rain kit is where it should be');
});
test('[LC-SEL-07 text] the pump is named too long; only reachable positions owned are named',()=>{
  setup({bags:[{uid:1,pos:'top',L:1,slot:'front'},{uid:2,pos:'bar',L:12},{uid:3,pos:'seat',L:14},{uid:4,pos:'pack',L:10}],mode:'light',nights:3,sleep:'indoor'},DEFAULTS);
  const {result}=render();hasNot(result,'Hand pump (too long)');hasNot(result,'things you reach for are in');
});
test('[LC-SEL-12 text] Rain kit is where it should be',()=>{
  setup({bags:[{uid:1,pos:'frame',L:4.5},{uid:2,pos:'fork',L:3,pair:true},{uid:3,pos:'rack',L:20,pair:true}],mode:'comfort',nights:3,sleep:'camp'},ON);
  has(render().result,'Rain kit is where it should be');
});
test('[reach] must-reach items in the overflow are named, rain kit first',()=>{
  setup({bags:[{uid:1,pos:'top',L:0.5,slot:'front'}],mode:'comfort',nights:0,sleep:'indoor',kit:['rain','pump','tool']});
  const {result}=render();has(result,'Some rain kit has no fitting bag');has(result,'Hand pump has no fitting bag');
  assert(result.indexOf('Some rain kit has no fitting bag')<result.indexOf('Hand pump has no fitting bag'));
});
test('[backpack] a hand placement says you put it there',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'pack',L:10}],mode:'comfort',nights:0,sleep:'indoor',kit:['base1'],pinned:{base1:'2-0'}});
  const {result}=render();has(result,'because you put it there');hasNot(result,'ran out of room');
});
test('[header] counts kept hand placements only and always shows the overflow',()=>{
  setup({bags:[{uid:1,pos:'frame',L:1}],mode:'comfort',nights:0,sleep:'indoor',kit:['base1','puffy'],pinned:{lock:'1-0'}});
  let {result}=render();has(result,'1 bag + overflow');hasNot(result,'1 bags');hasNot(result,'moved by hand');
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:10}],mode:'comfort',nights:0,sleep:'indoor',kit:['base1','tool'],pinned:{base1:'2-0'}});
  ({result}=render());has(result,'2 bags · 1 moved');has(result,'1 moved by hand');
});
test('[N1] the drawing matches a half by its key',()=>{
  assert(!html.includes('slots.filter(x => x.uid === b.uid)[b.idx]'));
  setup({bags:[{uid:1,pos:'fork',L:3,pair:true}],mode:'light',nights:0,sleep:'indoor',kit:['tool'],pinned:{tool:'1-1'}});
  run('S.step=4;drawRig();');
});
test('[N2] bags on screen and checklist groups follow the fixed unit order',()=>{
  setup({bags:[{uid:9,pos:'seat',L:10},{uid:8,pos:'frame',L:5}],mode:'comfort',nights:0,sleep:'indoor',kit:['tool','puffy'],pinned:{puffy:'9-0'}});
  assert.deepEqual(json('currentPlan().slots.map(s=>s.key)'),['8-0','9-0']);
  assert.deepEqual(json("getChecklistModel().groups.map(g=>g.id)"),['8-0','9-0']);
});
test('[chips] reachable first, sealed labelled, unused reachable offered, whole quantity only',()=>{
  // Lightweight on a pump moved to the seat pack by hand: the frame bag first, an unused top-tube bag is not long enough.
  setup({bags:[{uid:1,pos:'top',L:2,slot:'front'},{uid:2,pos:'frame',L:6},{uid:3,pos:'bar',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['tool','base1','pump'],pinned:{tool:'3-0'}});
  let chips=json("moveTargets(currentPlan(),'3-0','tool')");
  assert.deepEqual(chips.map(c=>c.key),['2-0','1-0']);chips.forEach(c=>assert(!c.label.includes('stop to open')));
  chips=json("moveTargets(currentPlan(),'2-0','pump')");
  assert.deepEqual(chips.map(c=>c.label),['Handlebar roll (stop to open)']);
  // A must-reach item out of reach is offered an unused reachable bag.
  setup({bags:[{uid:1,pos:'top',L:2,slot:'front'},{uid:3,pos:'bar',L:14}],mode:'light',nights:0,sleep:'indoor',kit:['tool'],pinned:{tool:'3-0'}});
  chips=json("moveTargets(currentPlan(),'3-0','tool')");
  assert.deepEqual(chips,[{key:'1-0',label:'Top tube bag (not in use yet)'}]);
});
test('[chips] There is room left never offers a must-reach item for a sealed bag, and takes food as free room',()=>{
  setup({bags:[{uid:1,pos:'frame',L:3},{uid:2,pos:'bar',L:2}],mode:'comfort',nights:0,sleep:'indoor',kit:['tool','base1','food'],foodMode:1,custom:{base1:{L:0.5,kg:0.2,rigid:0}}});
  const offers=json("incomingFor(currentPlan(),'2-0').map(c=>c.id)");
  assert(!offers.includes('tool'));
  const full=json("(()=>{const p=currentPlan();return {left:p.slots.find(s=>s.key==='1-0').left,offers:incomingFor(p,'1-0').map(c=>c.id)};})()");
  assert.equal(typeof full.left,'number');
  setup({bags:[{uid:1,pos:'frame',L:2},{uid:2,pos:'seat',L:6}],mode:'comfort',nights:0,sleep:'indoor',kit:['tool','puffy','food'],foodMode:1,custom:{puffy:{L:1,kg:0.3,rigid:0},food:{L:0.8,kg:0.3,rigid:0}}});
  const r=json("(()=>{const p=currentPlan();const frame=p.slots.find(s=>s.key==='1-0');return {left:frame.left,offer:incomingFor(p,'1-0').some(c=>c.id==='puffy'),food:p.food};})()");
  assert(r.food['1-0']>0,'the frame bag holds food');assert.equal(r.offer,true,'a gap held only by food is offered');
});
// ---- Task 9a: what riders really reach for (design 19 item 16) ----
test('[LC-REACH-01] ride snacks are placed before every other solid item, and go in a top-tube bag when one has room',()=>{
  setup({bags:[{uid:1,pos:'top',L:1,slot:'front'},{uid:2,pos:'frame',L:6},{uid:3,pos:'seat',L:14}],mode:'comfort',nights:3,sleep:'camp',kit:SIX});
  assert.equal(json('packingOrder(activeKit())[0].id'),'snacks');
  assert.deepEqual(plan().items.snacks.map(e=>e[0]),['1-0']);
  setup({bags:[{uid:2,pos:'frame',L:6},{uid:3,pos:'seat',L:14}],mode:'comfort',nights:3,sleep:'camp',kit:SIX});
  assert.deepEqual(plan().items.snacks.map(e=>e[0]),['2-0'],'the other reachable units next');
});
test('[LC-REACH-02] a must-reach item in the seat pack is not out of reach; in the handlebar roll or backpack it is',()=>{
  const where=(pos,pinned)=>{setup({bags:[{uid:1,pos,L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['pump'],pinned});return plan();};
  assert.deepEqual(where('seat').reach.outOfReach,[]);
  assert.deepEqual(where('bar').reach.outOfReach,['pump']);
  assert.deepEqual(where('pack').reach.outOfReach,['pump']);
  });
test('[LC-REACH-03] rain kit: out of reach only in the handlebar roll or the overflow',()=>{
  const out=pos=>{setup({bags:[{uid:1,pos,L:pos==='top'?2:12,...(pos==='top'?{slot:'front'}:{})}],mode:'comfort',nights:0,sleep:'indoor',kit:['rain']});const p=plan();return [p.reach.outOfReach,p.reach.noBag];};
  ['frame','fork','seat','rack','top','pack'].forEach(pos=>assert.deepEqual(out(pos),[[],[]],pos));
  assert.deepEqual(out('bar'),[['rain'],[]]);
  setup({bags:[{uid:1,pos:'seat',L:2}],mode:'comfort',nights:0,sleep:'indoor',kit:['rain','quilt'],custom:{rain:{L:9,kg:.3,rigid:0}}});
  assert.deepEqual(plan().reach.noBag,['rain']);
  const access=json('(A=>{const r=rainAccess(A);return {ready:r.ready,buried:r.buried.length,unplaced:r.unplaced.length};})(currentPlan())');
  assert.deepEqual(access,{ready:false,buried:0,unplaced:1});
});
test('[LC-REACH-04] a rain-kit piece goes in the handlebar roll only when no other unit in use can take it, and the report names it',()=>{
  setup({bags:[{uid:1,pos:'bar',L:12},{uid:2,pos:'pack',L:12}],mode:'comfort',nights:0,sleep:'indoor',kit:['rain']});
  run("S.placements=null;");
  // the order itself, on one set of units
  const first=units=>json("placePiece({...kitById('rain'),vol:1.2},"+units+".map(openSlot)).pos");
  const mk=list=>"["+list.map((pos,i)=>"{uid:"+(i+1)+",pos:'"+pos+"',L:12,idx:0,key:'"+(i+1)+"-0'"+(pos==='top'?",slot:'front'":"")+"}").join(',')+"]";
  assert.equal(first(mk(['bar','pack'])),'pack','the backpack before the roll');
  assert.equal(first(mk(['bar','pack','top'])),'top','a top-tube bag before the backpack');
  assert.equal(first(mk(['bar','pack','top','rack'])),'rack','panniers before a top-tube bag');
  assert.equal(first(mk(['bar','pack','top','rack','seat'])),'seat','in the item\'s preference order');
  assert.equal(first(mk(['bar','seat','frame'])),'frame');
  setup({bags:[{uid:1,pos:'bar',L:12}],mode:'comfort',nights:0,sleep:'indoor',kit:['rain']});
  const {result}=render();has(result,'Rain jacket');assert.deepEqual(plan().reach.outOfReach,['rain']);has(result,'out of reach');
});
test('[LC-REACH-05] checklist, print and Where it goes say to pack rain kit last, on top; wording only',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['rain','tool','base1']});
  const before=JSON.stringify(plan().items);
  const model=json("getChecklistModel().items.map(r=>[r.id,r.note])");
  const note=id=>model.find(r=>r[0]===id)[1];
  assert(note('rain').includes('Rain jacket: pack last, so it is on top'),note('rain'));
  assert(!note('tool').includes('pack last'));assert(!note('base1').includes('pack last'));
  const {result}=render();has(result,'pack last, so it is on top');
  assert.equal(count(result,'pack last, so it is on top'),1);
  run('renderPrintableChecklist();');
  assert(kit.vm.nodes.get('printChecklist').innerHTML.includes('Rain jacket: pack last, so it is on top'),'in print');
  assert.equal(JSON.stringify(plan().items),before,'it moves no item');
});
test('[item 16] growth and prune keep the seat pack among the sealed bike units; the reach step may add it',()=>{
  // Lightweight growth: reachable small first, then sealed large, with the seat pack in the sealed group.
  setup({bags:[{uid:1,pos:'frame',L:3},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:15}],mode:'light',nights:6,sleep:'camp',kit:['quilt','tent']});
  const p=plan();
  assert(p.inUse.includes('3-0')&&!p.inUse.includes('2-0'),'the larger sealed unit, the roll, comes in first: '+p.inUse);
  // The reach step: a pump in the roll comes within reach by adding a seat pack.
  setup({bags:[{uid:1,pos:'bar',L:15},{uid:2,pos:'seat',L:8}],mode:'light',nights:0,sleep:'indoor',kit:['pump','quilt']});
  const q=plan();assert(q.inUse.includes('2-0'),'the seat pack is added for reach');assert.deepEqual(q.reach.outOfReach,[]);
});
test('[LC-REACH-06] a must-reach item in a pannier is within reach; the reach step never adds a pannier; panniers at home stays the rack decision',()=>{
  setup({bags:[{uid:1,pos:'rack',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['pump']});
  assert.deepEqual(plan().reach.outOfReach,[]);
  // The kit fits a roll with room to spare, so the rack decision says no; a pump in the roll does not bring a pannier in.
  setup({bags:[{uid:1,pos:'bar',L:15},{uid:2,pos:'rack',L:15,pair:true}],mode:'light',nights:0,sleep:'indoor',kit:['pump','base1']});
  const p=plan();assert.deepEqual(p.inUse,['1-0']);assert.deepEqual(p.reach.outOfReach,['pump']);assert.equal(p.rack.panniers,false);
  const chips=json("moveTargets(currentPlan(),'1-0','pump')");assert.deepEqual(chips,[],'no chip mounts a pannier either');
});
test('[LC-REACH-07] the heavy test, from the current size and weight',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6}],kit:[]});
  const heavy=id=>json("isHeavy(kitById('"+id+"'))");
  ['bank','lock','water','book','treat'].forEach(id=>assert.equal(heavy(id),true,id));
  ['snacks','tent'].forEach(id=>assert.equal(heavy(id),false,id));
  assert.equal(json("isHeavy({...kitById('stove'),heavy:false})"),false,'the stove by its numbers alone');
  run("S.custom.tent={L:.5,kg:.5,rigid:0};");assert.equal(heavy('tent'),true,"a rider's own 0.5 kg, 0.5 L");
  run("S.custom.tent={L:0,kg:.5,rigid:0};");assert.equal(heavy('tent'),true,'0 L causes no error');
  run("S.custom.tent={L:0,kg:.1,rigid:0};");assert.equal(heavy('tent'),false);
  run("S.custom={};");
});
test('[LC-REACH-08] a heavy item stays out of the seat pack while another bag can take it; otherwise it gets the note',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['lock']});
  assert.deepEqual(plan().items.lock.map(e=>e[0]),['1-0']);hasNot(render().result,'Heavy for a seat pack');
  setup({bags:[{uid:2,pos:'seat',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['lock']});
  assert.deepEqual(plan().items.lock.map(e=>e[0]),['2-0']);
  const NOTE='Heavy for a seat pack: pack it close to the saddle, not at the tip.';
  has(render().result,NOTE);assert(json("getChecklistModel().items.find(r=>r.id==='lock').note").includes(NOTE));
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['lock'],pinned:{lock:'2-0'}});
  assert.deepEqual(plan().items.lock.map(e=>e[0]),['2-0'],'a hand placement stays');has(render().result,NOTE);
  // before the backpack, after every bike and pannier unit
  setup({bags:[{uid:2,pos:'seat',L:14},{uid:3,pos:'pack',L:10}],mode:'comfort',nights:0,sleep:'indoor',kit:['lock','pump'],pinned:{}});
  assert.equal(json("placePiece({...kitById('lock'),vol:.8},[{uid:2,pos:'seat',L:14,idx:0,key:'2-0'},{uid:3,pos:'pack',L:10,idx:0,key:'3-0'}].map(openSlot)).pos"),'seat');
});
test('[LC-REACH-09] Stove and gas is heavy through its flag; a rider\'s weight changes the test for other items',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6}],kit:[]});
  assert.equal(json("isHeavy(kitById('stove'))"),true);
  assert.equal(json("isHeavy(kitById('cables'))"),false);
  run("S.custom.cables={L:.3,kg:.4,rigid:0};");assert.equal(json("isHeavy(kitById('cables'))"),true);run("S.custom={};");
});
test('[LC-REACH-10] loading order: seat pack heavy, middle, light, rain last; the roll one sentence; others none; no placement moves',()=>{
  setup({bags:[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:12},{uid:3,pos:'frame',L:6}],mode:'comfort',nights:1,sleep:'camp',kit:['rain','quilt','puffy','stove','cables']});
  const before=JSON.stringify(plan().items);
  const seat=json("currentPlan().slots.find(s=>s.pos==='seat').items.map(k=>k.id)");
  run("S.pinned={stove:'1-0',rain:'1-0',quilt:'1-0',cables:'1-0',puffy:'2-0'};");
  const {result}=render();
  const labels=['Heavy first, against the saddle (about a fifth of the bag)','Middle (about a third)','Light, towards the tip'];
  labels.forEach(l=>has(result,l));
  assert(result.indexOf(labels[0])<result.indexOf(labels[1])&&result.indexOf(labels[1])<result.indexOf(labels[2]));
  const at=result.indexOf(labels[0]),order=['Stove and gas',labels[1],'Charger and cables',labels[2],'Sleeping quilt','The rain kit last of all','Rain jacket'].map(t=>result.indexOf(t,at));
  order.forEach((n,i)=>assert(n>at&&(i===0||n>order[i-1]),'loading order: '+order));
  has(result,'Heavier things in the middle, lighter things out to the left and right.');
  assert.equal(count(result,labels[0]),1,'only the seat pack');
  const groups=json("getChecklistModel().groups.map(g=>[g.id,g.subtitle,g.items.map(r=>r.id)])");
  const seatGroup=groups.find(g=>g[0]==='1-0');assert(seatGroup[1].includes(labels[0]));assert.equal(seatGroup[2][0],'stove');assert.equal(seatGroup[2][seatGroup[2].length-1],'rain');
  const frameGroup=groups.find(g=>g[0]==='3-0');if(frameGroup)assert(!frameGroup[1].includes('Heavy first'));
  run('renderPrintableChecklist();');assert(kit.vm.nodes.get('printChecklist').innerHTML.includes(labels[0]));
  run("S.pinned={};S.placements=null;");
  assert.equal(JSON.stringify(plan().items),before,'wording only');assert(seat.length>=0);
});
test('[LC-REACH-11] a tent shows the straps sentence for its poles, and no strapped placement results',()=>{
  setup({bags:[{uid:1,pos:'seat',L:14}],mode:'comfort',nights:1,sleep:'camp',kit:['tent']});
  const SENT='If the poles are too long for a bag, strap them to the handlebar roll or seat pack, if it has straps.';
  has(render().result,SENT);assert(json("getChecklistModel().items.find(r=>r.id==='tent').note").includes(SENT));
  assert.deepEqual(json('deckClaims().map(k=>k.id)'),[]);assert.deepEqual(plan().items.tent.map(e=>e[0]),['1-0']);
});
test('[LC-REACH-12] in Lightweight, a usable frame bag the rider owns is always in use, in every generated plan',()=>{
  [99,777].forEach(s=>seeded(s,300,p=>{
    if(!p.bags.some(b=>b.pos==='frame'))return;
    setup({...p,mode:'light'},DEFAULTS);
    assert(plan().inUse.includes(p.bags.find(b=>b.pos==='frame').uid+'-0'),JSON.stringify(p));
    assert(!json("currentPlan().barely.some(s=>s.pos==='frame')"),'never suggested for leaving at home');
  }));
});
test('[LC-REACH-13] the power bank: right after the snacks; the seat pack or roll only when no other bag in use can take it',()=>{
  setup({bags:[{uid:1,pos:'frame',L:6}],mode:'comfort',nights:3,sleep:'camp',kit:SIX});
  assert.deepEqual(json('packingOrder(activeKit()).slice(0,2).map(k=>k.id)'),['snacks','bank']);
  const NOTE='Push it down the side, close to the seat post.';
  // Only the roll and the seat pack: the seat pack, with its note.
  ['comfort','light'].forEach(mode=>{
    setup({bags:[{uid:1,pos:'bar',L:12},{uid:2,pos:'seat',L:14}],mode,nights:0,sleep:'indoor',kit:['bank','tool']});
    assert.deepEqual(plan().items.bank.map(e=>e[0]),['2-0'],mode);
    assert.deepEqual(json('currentPlan().overflow'),[]);
  });
  const {result}=render();has(result,NOTE);hasNot(result,'jersey');hasNot(result,'Heavy for a seat pack');
  assert(json("getChecklistModel().items.find(r=>r.id==='bank').note").includes(NOTE));
  // Only the roll: the roll, and it is reported.
  setup({bags:[{uid:1,pos:'bar',L:12}],mode:'comfort',nights:0,sleep:'indoor',kit:['bank']});
  assert.deepEqual(plan().items.bank.map(e=>e[0]),['1-0']);assert.deepEqual(plan().reach.outOfReach,['bank']);
  // With a backpack already in use: the backpack. An unused backpack does not come in for it.
  setup({bags:[{uid:1,pos:'bar',L:12},{uid:2,pos:'seat',L:14},{uid:3,pos:'pack',L:10}],mode:'comfort',nights:0,sleep:'indoor',kit:['bank','tool']});
  assert.deepEqual(plan().inUse,['1-0','2-0']);assert.deepEqual(plan().items.bank.map(e=>e[0]),['2-0']);
  // The order of the bags.
  const first=list=>json("placePiece({...kitById('bank'),vol:.4},["+list.map((pos,i)=>"{uid:"+(i+1)+",pos:'"+pos+"',L:12,idx:0,key:'"+(i+1)+"-0'"+(pos==='top'?",slot:'front'":"")+"}").join(',')+"].map(openSlot))?.pos??null");
  assert.equal(first(['bar','seat','pack','rack','fork','frame','top']),'top');
  assert.equal(first(['bar','seat','pack','rack','fork','frame']),'frame');
  assert.equal(first(['bar','seat','pack','rack','fork']),'fork');
  assert.equal(first(['bar','seat','pack','rack']),'rack');
  assert.equal(first(['bar','seat','pack']),'pack');
  assert.equal(first(['bar','seat']),'seat');
  assert.equal(first(['bar']),'bar');
  // A hand placement stays, as the rider's choice, with the note in the seat pack.
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['bank'],pinned:{bank:'2-0'}});
  assert.deepEqual(plan().items.bank.map(e=>e[0]),['2-0']);has(render().result,NOTE);
  setup({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'bar',L:14}],mode:'comfort',nights:0,sleep:'indoor',kit:['bank'],pinned:{bank:'2-0'}});
  assert.deepEqual(plan().items.bank.map(e=>e[0]),['2-0']);assert.deepEqual(plan().reach.outOfReach,['bank']);
});
console.log(JSON.stringify({cases,status:'passed'}));
