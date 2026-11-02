/* Run with node load-check/qa/packing-audit.cjs. No browser or network access. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('./paths.cjs').page,'utf8');
function section(a,b){const start=html.indexOf(a),end=html.indexOf(b,start+a.length);assert(start>=0&&end>start,`Missing source section ${a}`);return html.slice(start,end);}
const source=[
  section('/* ==== 05-positions.js ==== */','/* ==== 15-catalogue.js ==== */'),
  section('const S = {','const $ ='),
  section('function dataObject(v){','function dataNumber('),
  section('function dataText(','function dataId('),
  section('const camping =','/* ================= MATH ================= */'),
  section('/* ==== 30-volume.js ==== */','/* ================= AUDIT ================= */'),
  section('function comfortFill(res){','function dispensability(k){'),
  section('const BOTTLE_SPOTS =','function bottleArt('),
  "const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];",
  "function routeProfile(){return null;} function placeLabel(p){return p.name;} function plural(n){return n+' nights';}",
  'globalThis.api={S,KIT,POSITIONS,physical,allocateInto,allocate,getChecklistModel,itemL,itemKg,placedKg,weightIn,loadByZone,deckClaims,activeKit,rebalancePairs,fitsLength,moveTargets,incomingFor,usableL,packingSummary,rainAccess,comfortFill,currentPlan};'
].join('\n');
const context=vm.createContext({});vm.runInContext(source,context);const a=context.api,initial=JSON.parse(JSON.stringify(a.S));
function reset(ids=[]){Object.assign(a.S,JSON.parse(JSON.stringify(initial)));a.S.kit={};ids.forEach(id=>a.S.kit[id]=true);a.S.foodMode=1;}
function bag(uid,pos,L,extra={}){return {uid,pos,L,...extra};}
function allocation(){return a.allocateInto(a.S.bags.flatMap(a.physical));}
function near(actual,expected,note){assert(Math.abs(actual-expected)<1e-7,`${note}: ${actual} versus ${expected}`);}
function invariants(A){
  const entries=[...A.slots.flatMap(s=>s.items),...A.spill];
  A.slots.forEach(s=>{assert(s.left>=-1e-8,`overfill ${s.key}`);near(s.items.reduce((n,k)=>n+k.vol,0)+s.left,s.cap,'bag capacity');s.items.forEach(k=>assert(a.fitsLength(k,s),'length violation'));});
  const deckIds=new Set(a.deckClaims().map(k=>k.id));
  a.activeKit().forEach(k=>{
    if(deckIds.has(k.id))return;
    const pieces=entries.filter(x=>x.id===k.id);
    near(pieces.reduce((n,x)=>n+x.vol,0),a.itemL(k),'volume '+k.id);
    near(pieces.reduce((n,x)=>n+a.placedKg(x),0),a.itemKg(k),'mass '+k.id);
    if(!k.divisible)near(pieces.reduce((n,x)=>n+x.units,0),a.S.qty[k.id]||1,'whole units '+k.id);
  });
  const m=a.getChecklistModel(A);assert.equal(m.items.length,a.activeKit().length,'one canonical row per selected item');
  assert.equal(new Set(m.items.map(k=>k.id)).size,m.items.length);
  m.items.forEach(k=>near(k.placements.reduce((n,p)=>n+p.L,0),k.L,'checklist volume'));
}
let cases=0;
function test(name,fn){reset();fn();cases++;process.stdout.write('PASS '+name+'\n');}
test('food shortages from 0.01 to 0.05 L remain visible',()=>{
  [1.35,1.34,1.33,1.32,1.31].forEach(L=>{reset(['food']);a.S.bags=[bag(1,'bar',L)];const A=allocation();invariants(A);assert.equal(A.spill.length,1);assert(A.spill[0].vol>0&&A.spill[0].vol<=0.05);assert(A.spill[0].part);});
});
test('food fills tiny gaps and exact decimal capacity',()=>{
  reset(['food']);a.S.bags=[bag(1,'bar',1.33),bag(2,'top',0.04)];const A=allocation();invariants(A);assert.equal(A.spill.length,0);near(A.slots.find(s=>s.key==='2-0').items[0].vol,0.03,'tiny share');
});
test('custom rigid food length blocks undersized bags',()=>{
  reset(['food']);a.S.custom.food={L:1.2,kg:0.7,rigid:60};a.S.bags=[bag(1,'bar',10,{longestCm:40})];const A=allocation();invariants(A);assert.equal(A.spill[0].tooLong,true);
});
test('pair redistribution respects food length and mass',()=>{
  reset(['food','base1','pump']);a.S.custom.food={L:1.2,kg:0.7,rigid:40};
  const k=id=>a.KIT.find(x=>x.id===id);
  const slots=[{uid:1,key:'1-0',pos:'fork',longestCm:30,cap:3,left:2.5,items:[{...k('base1'),vol:0.5,units:1}]},
    {uid:1,key:'1-1',pos:'fork',longestCm:50,cap:3,left:1.5,items:[{...k('pump'),vol:0.3,units:1},{...k('food'),vol:1.2,part:true}]}];
  a.rebalancePairs(slots);slots.forEach(s=>s.items.forEach(x=>assert(a.fitsLength(x,s))));near(slots.reduce((n,s)=>n+a.weightIn(s),0),a.itemKg(k('base1'))+a.itemKg(k('pump'))+a.itemKg(k('food')),'rebalanced weight');
});
test('four half-litre garments fit as two whole pieces per fork bag',()=>{
  reset(['base1']);a.S.qty.base1=4;a.S.bags=[bag(1,'fork',1.5,{pair:true})];const A=allocation();invariants(A);assert.equal(A.spill.length,0);A.slots.forEach(s=>{assert.equal(s.items.length,1);assert.equal(s.items[0].units,2);near(a.weightIn(s),0.3,'bag mass');});
  const m=a.getChecklistModel(A);assert.equal(m.items[0].status,'split');assert(m.items[0].placementLabel.includes('2 of 4'));assert.equal(m.totals.items,1);
});
test('individual pieces never split fractionally to fill bags',()=>{
  reset(['base1']);a.S.qty.base1=2;a.S.custom.base1={L:1.5,kg:0.3,rigid:0};a.S.bags=[bag(1,'fork',1.5,{pair:true})];const A=allocation();invariants(A);assert.equal(A.spill[0].units,2);near(A.spill[0].vol,3,'whole piece overflow');assert(A.slots.every(s=>!s.items.length));
});
test('partial quantity overflow preserves pieces and mass',()=>{
  reset(['base1']);a.S.qty.base1=4;a.S.bags=[bag(1,'fork',1.5)];const A=allocation();invariants(A);assert.equal(A.slots[0].items[0].units,2);assert.equal(A.spill[0].units,2);near(a.placedKg(A.spill[0]),0.3,'overflow mass');
});
test('Lightweight preserves a valid pin in an otherwise removable bag',()=>{
  reset(['base1']);a.S.mode='light';a.S.bags=[bag(1,'fork',10),bag(2,'seat',10)];a.S.pinned.base1='2-0';const A=a.allocate();invariants(A);assert(A.slots.find(s=>s.key==='2-0').items.some(k=>k.id==='base1'&&k.pinned));assert(!A.barely.some(s=>s.key==='2-0'),'pinned bag must not be suggested for removal');
});
test('rack pin prevents comfortable no-rack branch dropping its bag',()=>{
  reset(['base1']);a.S.mode='light';a.S.bags=[bag(1,'frame',6),bag(2,'rack',15,{pair:true})];a.S.pinned.base1='2-1';const A=a.allocate();invariants(A);assert(A.slots.find(s=>s.key==='2-1').items.some(k=>k.pinned));
});
test('a stale length-incompatible pin falls back to a fitting bag',()=>{
  reset(['pump']);a.S.mode='light';a.S.custom.pump={L:0.3,kg:0.1,rigid:35};a.S.bags=[bag(1,'fork',5,{longestCm:20}),bag(2,'frame',5,{longestCm:40})];a.S.pinned.pump='1-0';const A=a.allocate();invariants(A);assert.equal(A.spill.length,0);assert(A.slots.find(s=>s.key==='2-0').items.some(k=>k.id==='pump'&&!k.pinned));assert.equal(JSON.stringify(a.currentPlan().hand.notKept.map(n=>[n.id,n.key,n.reason,n.nowIn])),'[["pump","1-0","too long","2-0"]]');
});
test('one pannier from an owned pair remains allowed',()=>{
  reset(['base1']);a.S.mode='light';a.S.bags=[bag(1,'rack',15,{pair:true})];const A=a.allocate();invariants(A);assert.equal(A.chosen.length,1);assert.equal(A.unused.length,1);
});
test('handlebar food contributes its mass to bag and front zone',()=>{
  reset(['food']);a.S.bags=[bag(1,'bar',5)];const A=allocation();invariants(A);near(a.weightIn(A.slots[0]),0.7,'handlebar mass');near(a.loadByZone(A.slots).front,0.7,'front zone');
});
test('rack top tent and mat contribute rear mass without bag allocation',()=>{
  reset(['tent','pad']);a.S.decks.rack=true;const A=allocation();invariants(A);assert.equal(A.spill.length,0);near(a.loadByZone(A.slots).rear,1.8,'rack deck mass');
});
test('quantity move suggestions never offer only part of a selected item',()=>{
  reset(['base1']);a.S.qty.base1=4;a.S.bags=[bag(1,'fork',1.5,{pair:true}),bag(2,'seat',0.8)];const A=allocation();invariants(A);assert.equal(a.incomingFor(A,'2-0').length,0);assert.equal(a.moveTargets(A,'1-0','base1').length,0);
});
test('whole quantity can consolidate into an eligible bag with an existing share',()=>{
  reset(['base1']);a.S.qty.base1=4;
  const k=a.KIT.find(x=>x.id==='base1');const A={slots:[{...bag(1,'fork',3),key:'1-0',left:1.6,items:[{...k,vol:1,units:2}]},{...bag(2,'seat',3),key:'2-0',left:1.6,items:[{...k,vol:1,units:2}]}],spill:[]};
  const targets=a.moveTargets(A,'2-0','base1');assert(targets.some(s=>s.key==='1-0'));const incoming=a.incomingFor(A,'1-0');assert.equal(incoming.length,1);near(incoming[0].vol,2,'complete move volume');
});
test('selection and canonical checklist keep packed quantity as one tick',()=>{
  reset(['base1']);a.S.qty.base1=4;a.S.bags=[bag(1,'fork',1.5,{pair:true})];a.S.packed.base1=true;const A=a.allocate();invariants(A);const m=a.getChecklistModel(A);assert.equal(m.totals.packed,1);assert.equal(m.totals.remaining,0);
});

test('tiny food overflow remains an overflow in the summary',()=>{
  reset(['food']);a.S.custom.food={L:.1,kg:.07,rigid:0};a.S.bags=[bag(1,'top',.1)];
  const A=a.allocate(),summary=a.packingSummary(A);invariants(A);assert(summary.over);near(summary.spilled,.01,'small overflow');near(summary.delta,.01,'over verdict');
});

test('per-day custom food preserves centilitres and grams',()=>{
  reset(['food']);a.S.custom.food={L:.03,kg:.07,rigid:0};a.S.bags=[bag(1,'top',1)];
  const A=a.allocate();invariants(A);near(a.packingSummary(A).kit,.03,'food volume');near(a.weightIn(A.slots[0]),.07,'food mass');
});

test('spare capacity is identical in the verdict and comfort suggestions',()=>{
  reset(['base1','tool']);a.S.qty.base1=3;a.S.custom.base1={L:5.2,kg:.15,rigid:0};a.S.custom.tool={L:1.05,kg:.1,rigid:0};
  a.S.bags=[bag(1,'top',.1),bag(2,'frame',6),bag(3,'bar',12),bag(4,'seat',14)];
  const A=a.allocate(),summary=a.packingSummary(A);invariants(A);near(summary.kit,16.65,'exact kit total');near(summary.spare,11.6,'spare');near(a.comfortFill(A).freeL,summary.spare,'matching spare');
});

test('unplaced rain gear cannot earn an accessible-rain-kit success',()=>{
  reset(['tool','rain']);a.S.qty.rain=2;a.S.custom.tool={L:.1,kg:.1,rigid:0};a.S.custom.rain={L:1,kg:.2,rigid:0};
  a.S.bags=[bag(1,'top',.5)];let access=a.rainAccess(a.allocate());assert.equal(access.ready,false);assert.equal(access.unplaced[0].units,2);
  a.S.bags=[bag(1,'frame',1.5)];access=a.rainAccess(a.allocate());assert.equal(access.ready,false);assert.equal(access.unplaced[0].units,1);
  a.S.bags=[bag(1,'frame',6)];access=a.rainAccess(a.allocate());assert.equal(access.ready,true);assert.equal(access.unplaced.length,0);
  a.S.bags=[bag(1,'bar',6)];access=a.rainAccess(a.allocate());assert.equal(access.ready,false);assert(access.buried.length>0);
});

// Execute the real rendering and saved-prediction functions with a minimal DOM.
// This checks the user-facing claims as well as the underlying model.
const {appVM}=require('./app-vm.cjs'),renderVM=appVM();
renderVM.context.assert=assert;
renderVM.run(section('function renderResult(){','/* ==== 84-packing-checklist.js ==== */'));
renderVM.run("buildThumb=()=>'';");
test('rendered results flag unplaced rain gear instead of claiming success',()=>{
  renderVM.run(`S.kit={tool:true,rain:true};S.qty={rain:2};S.custom={tool:{L:.1,kg:.1,rigid:0},rain:{L:1,kg:.2,rigid:0}};S.bags=[{uid:1,pos:'top',L:.5}];renderResult();`);
  const result=renderVM.nodes.get('resultBox').innerHTML;
  assert(result.includes('Some rain kit has no fitting bag'));assert(!result.includes('Rain kit is where it should be'));assert(result.includes('rain kit has no bag'));
});
test('rendered verdict and saved setup preserve a 0.01 L overflow',()=>{
  renderVM.run(`S.kit={food:true};S.qty={};S.custom={food:{L:.1,kg:.07,rigid:0}};S.foodMode=1;S.bags=[{uid:1,pos:'top',L:.1}];renderResult();
    assert.equal(snapshotAt(S.nights).spilled,.01);assert.equal(snapshotSetup('QA','').predicted.spilled,.01);`);
  assert(renderVM.nodes.get('verdictBox').innerHTML.includes('0.01 litres over'));
  assert(renderVM.nodes.get('resultBox').innerHTML.includes('<em>0.01 L</em>'));
  renderVM.run('S.step=4;drawRig();');
  assert(renderVM.nodes.get('rigFoot').innerHTML.includes('0.01 L over'));
  assert(renderVM.nodes.get('rigFoot').innerHTML.includes('0.09 L'));
});
test('comfortable mode avoids claiming all mounted bags are necessary',()=>{
  renderVM.run(`S.mode='comfort';S.kit={tool:true};S.qty={};S.custom={tool:{L:.1,kg:.1,rigid:0}};S.bags=[{uid:1,pos:'top',L:1},{uid:2,pos:'seat',L:14}];renderResult();`);
  const result=renderVM.nodes.get('resultBox').innerHTML;
  assert(!result.includes('all needed'));assert(!result.includes('Every bag you own is earning its place'));assert(result.includes('none suggested'));assert(result.includes('Switch to Lightweight'));
});
test('a lightly used bag is not suggested for removal when its contents would spill',()=>{
  reset(['tool']);a.S.mode='light';a.S.custom.tool={L:.1,kg:.1,rigid:0};a.S.bags=[bag(1,'top',1)];
  const A=a.allocate();assert.equal(A.spill.length,0);assert.equal(A.barely.length,0);
});
let randomized=0,seed=932841;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<400;i++){
  reset();a.S.mode=i%2?'light':'comfort';a.S.nights=i%13;a.S.foodMode=[1,2,'all'][i%3];a.S.sleep=i%4?'camp':'indoor';
  a.S.decks.rack=i%7===0;
  a.KIT.forEach(k=>{a.S.kit[k.id]=rand()<0.25;if(k.qtyable)a.S.qty[k.id]=1+Math.floor(rand()*6);if(rand()<0.12)a.S.custom[k.id]={L:+(0.1+rand()*3).toFixed(2),kg:+(0.01+rand()).toFixed(2),rigid:rand()<0.3?Math.floor(rand()*70):0};});
  ['top','frame','bar','seat','fork','rack','pack'].forEach((pos,n)=>{if(rand()<0.6)a.S.bags.push(bag(n+1,pos,+(0.1+rand()*15).toFixed(1),{pair:(pos==='fork'||pos==='rack')&&rand()<0.5,longestCm:10+Math.floor(rand()*65)}));});
  if(a.S.bags.length&&i%3===0){const active=a.activeKit().filter(k=>!k.divisible);if(active.length)a.S.pinned[active[0].id]=a.S.bags[a.S.bags.length-1].uid+'-0';}
  invariants(a.currentPlan());randomized++;
}
console.log(JSON.stringify({focusedCases:cases,generatedConfigurations:randomized,seed:932841,status:'passed'}));
