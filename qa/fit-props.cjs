'use strict';
// LC-FIT-PROPS (sub-project 6, Task 8; spec 15 row 6): frame fit over generated plans and bikes, on the page's own code. On top of
// selection-fixtures.cjs and bike-fit.cjs, which hold the hand-made cases. Fixed seeds; nothing here prints the page.
const assert=require('node:assert/strict');
const fc=require('fast-check');
const {appVM}=require('./app-vm.cjs');
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
const p=appVM();
p.run('renderBikeProfiles=()=>{};renderKit=()=>{};drawRig=()=>{};renderBags=()=>{};DRAFT_READY=true;');
const json=code=>JSON.parse(p.run(`JSON.stringify(${code})`)??'null');

const STYLES=['unknown','diamond-level','diamond-sloping','compact','trapeze','mixte','step-through','full-suspension'];
const POS=['top','frame','fork','bar','seat','rack','pack','bottle','bottleU'];
const bagArb=fc.record({pos:fc.constantFrom(...POS),L:fc.constantFrom(0.5,1,2,3,4.5,6,8,12,15),pair:fc.boolean(),slot:fc.constantFrom('front','rear','st','dt'),userL:fc.boolean(),shape:fc.constantFrom(undefined,0,1,2)});
const planArb=fc.record({bags:fc.array(bagArb,{maxLength:8}),kit:fc.subarray(['tent','pad','bag','stove','pot','tubes','pump','tools','jacket','food','water','pillow','shoes','towel','lock']),
  nights:fc.integer({min:0,max:5}),mode:fc.constantFrom('comfort','light'),rack:fc.boolean(),bar:fc.boolean()});
const answer=fc.constantFrom('yes','no','unknown');
const fitArb=fc.record({style:fc.constantFrom(...STYLES),size:fc.constantFrom(null,'XS','S','M','L','XL'),st:answer,dt:answer,un:answer,top:answer,
  tri:fc.option(fc.record({top:fc.integer({min:40,max:65}),seat:fc.integer({min:35,max:60}),down:fc.integer({min:50,max:75})}),{nil:null})});
// What a rider can enter outside the frame: never a reason for the plan to change.
const otherArb=fc.record({name:fc.string({maxLength:20}),tyres:fc.constantFrom('unknown','tubes','tubeless'),frontTyre:fc.constantFrom('','40-622','2.25"'),
  look:fc.option(fc.record({colour:fc.constantFrom('#2563b8','#c62f2a'),bars:fc.constantFrom('drop','flat'),ebike:fc.boolean()}),{nil:null}),
  pressure:fc.record({bikeKg:fc.option(fc.integer({min:8,max:30}),{nil:null})}),maxWeight:fc.option(fc.record({v:fc.integer({min:60,max:200}),u:fc.constant('kg'),includes:fc.constant('bike')}),{nil:null})});

function setPlan(plan,bike){
  const bags=plan.bags.map((b,i)=>{
    const bottle=b.pos==='bottle'||b.pos==='bottleU';
    const slot=b.pos==='bottleU' ? 'un' : bottle ? (['st','dt'].includes(b.slot) ? b.slot : 'st') : b.pos==='top' ? (b.slot==='rear' ? 'rear' : 'front') : undefined;
    return {uid:i+1,pos:b.pos,L:bottle ? Math.min(b.L,1) : b.L,...(b.pair&&(b.pos==='fork'||b.pos==='rack') ? {pair:true} : {}),...(slot ? {slot} : {}),
      ...(b.userL&&!bottle ? {userL:true} : {}),...(b.pos==='frame'&&b.shape!==undefined ? {shape:b.shape} : {})};
  });
  p.context.qaBike=JSON.stringify(bike);
  p.run(`S.place=null;S.place2=null;S.gpx=null;S.kit=Object.fromEntries(KIT.map(k=>[k.id,false]));S.kitTouched={};S.qty={};S.custom={};S.pinned={};S.packed={};S.placements=null;
    S.bags=${JSON.stringify(bags)};S.nextUid=${bags.length+1};S.decks={bar:${plan.bar},rack:${plan.rack}};S.nights=${plan.nights};S.mode='${plan.mode}';S.sleep='camp';S.foodMode='all';
    for(const id of ${JSON.stringify(plan.kit)}) if(S.kit[id]!==undefined) S.kit[id]=true;
    S.bikeProfile=normaliseBikeProfile(JSON.parse(qaBike));`);
  return bags;
}
// The plan as the rider sees it: which bag holds what, how full, what is over.
const planOf=()=>json(`(()=>{const A=selectBags();return {slots:A.slots.map(s=>[s.key,s.pos,s.cap,s.left,s.items.map(k=>k.id+':'+(k.units||'')+':'+(k.vol||''))]),spill:A.spill.map(k=>k.id)};})()`);

test('[LC-FIT-PROPS] without frame details, bikeFit gives today\'s values and the plan is byte-identical to the plan with no bike',()=>{
  const today=json('bikeFit(null)');
  assert.equal(today.details,false);
  fc.assert(fc.property(planArb,otherArb,fc.constantFrom(undefined,null,{},{style:'unknown',bolts:{st:'unknown',dt:'unknown',un:'unknown'},topTubeBag:'unknown'}),(plan,other,fit)=>{
    setPlan(plan,null);
    const none=planOf();
    setPlan(plan,{id:'gen_bike',...other,...(fit===undefined ? {} : {fit})});
    assert.deepEqual(json('bikeFit(S.bikeProfile)'),today);
    assert.deepEqual(planOf(),none);
  }),{numRuns:150,seed:6201});
});

test('[LC-FIT-PROPS] a bag the frame can\'t take is never used and never dropped; a typed size never changes',()=>{
  fc.assert(fc.property(planArb,fitArb,(plan,f)=>{
    const fit={style:f.style,...(f.size ? {size:{kind:'letter',value:f.size}} : {}),bolts:{st:f.st,dt:f.dt,un:f.un},topTubeBag:f.top,...(f.tri ? {triangleCm:f.tri} : {})};
    const bags=setPlan(plan,{id:'gen_fit',name:'Fit',fit});
    const unusable=json('S.bags.filter(b=>!bagSpec(b).usable).map(b=>b.uid)');
    p.run('currentPlan();syncFrameBags();currentPlan();');
    const after=json('S.bags');
    assert.deepEqual(after.map(b=>b.uid),bags.map(b=>b.uid),'no bag is dropped');
    const used=new Set(json('currentPlan().slots.map(s=>s.uid)'));
    for(const uid of unusable)assert.ok(!used.has(uid),'a bag the frame can\'t take holds nothing');
    for(const b of bags.filter(x=>x.userL))assert.equal(after.find(x=>x.uid===b.uid).L,b.L,'a typed size stays as typed');
  }),{numRuns:200,seed:6202});
});

test('[LC-FIT-PROPS] each other value comes from the first available source: the rider\'s answer, then the frame\'s estimate, then today\'s',()=>{
  fc.assert(fc.property(fitArb,f=>{
    const fit={style:f.style,...(f.size ? {size:{kind:'letter',value:f.size}} : {}),bolts:{st:f.st,dt:f.dt,un:f.un},topTubeBag:f.top,...(f.tri ? {triangleCm:f.tri} : {})};
    p.context.qaBike=JSON.stringify({id:'gen_src',name:'Src',fit});
    const got=json('bikeFit(normaliseBikeProfile(JSON.parse(qaBike)))');
    for(const k of ['st','dt','un']){
      const said=f[k];
      assert.equal(got.cageSource[k],said!=='unknown' ? 'rider' : f.style==='unknown' ? 'today' : 'estimate',k);
      if(said!=='unknown')assert.equal(got.cages[k],said==='yes','the rider\'s answer wins: '+k);
    }
    if(f.top!=='unknown' && f.style!=='step-through')assert.equal(got.topMounts.front,f.top==='yes','the rider\'s top-tube answer wins');
    const family=f.style==='unknown'||f.style.startsWith('diamond') ? 'diamond' : f.style;
    const measured=!!f.tri && (family==='diamond'||family==='compact') && json('triangleLitres(JSON.parse(qaBike).fit.triangleCm)')!==null;
    const sources=new Set(got.frameBag.shapes.map(s=>s.source));
    if(f.style==='step-through')assert.equal(got.frameBag.shapes.length,0);
    else if(measured)assert.deepEqual([...sources],['measured'],'measured lengths come first');
    else if(f.style==='unknown' && !f.size)assert.deepEqual([...sources],['today'],'nothing entered: today\'s three shapes');
    else assert.deepEqual([...sources],['estimate'],'then the estimate for the frame');
  }),{numRuns:300,seed:6203});
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} fit property tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
