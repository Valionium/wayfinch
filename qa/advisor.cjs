'use strict';
// The Gear advisor in the bag planner (sub-project 13, group 2), on the page's own code: its trial function over the frozen planWith,
// the size table checked against the real bagSpec, the view and the example riders. tests/e2e/app-advisor.spec.ts runs it in a
// real browser. Nothing here prints the page: assertions compare short values and booleans.
const assert=require('node:assert/strict');
const {appVM,sharedStore}=require('./app-vm.cjs');
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

// Bikes: one with every detail the planner reads, one with none (Not sure everywhere), and the two the planner refuses a frame bag on.
const FULL={id:'full',name:'Full details',fit:{style:'diamond-level',size:{kind:'letter',value:'M'},bolts:{st:'yes',dt:'yes',un:'no'},
  topTubeBag:'yes',triangleCm:{top:55,seat:48,down:62},seatGapCm:30,barWidthCm:50},rackMounts:'yes'};
const BARE={id:'bare',name:'Bare'};
const STEP={id:'step',name:'Step-through',fit:{style:'step-through'},rackMounts:'no'};
const XS={id:'xs',name:'Small',fit:{style:'diamond-sloping',size:{kind:'letter',value:'XS'},bolts:{st:'yes',dt:'yes'}}};

// A page with the draft ready, as after start-up, every write to storage counted. `setup` is run in the page.
function page({bike=FULL,setup='',storage=sharedStore()}={}){
  const q=appVM({storage});
  q.context.document.removeEventListener=()=>{};
  const writes=[];
  const set=q.localStorage.setItem;
  q.localStorage.setItem=(k,v)=>{writes.push(k);set(k,v);};
  q.context.qaBike=JSON.stringify(bike);
  q.run(`renderKit=()=>{};drawRig=()=>{};renderBags=()=>{};closeBagPop=()=>{};
    S.bikeProfile=normaliseBikeProfile(JSON.parse(qaBike));applyTripKitDefaults();DRAFT_READY=true;${setup}`);
  writes.length=0;
  const json=code=>JSON.parse(q.run(`JSON.stringify(${code})`)??'null');
  return {...q,writes,json};
}
const snapshot=p=>p.run('JSON.stringify([S,PLAN_CACHE.sig,KIT.filter(k=>k.added)])')+JSON.stringify([...p.values]);
const BAGS="S.bags=[{uid:1,pos:'bar',L:12},{uid:2,pos:'top',slot:'front',L:1},{uid:3,pos:'pack',L:15},{uid:4,pos:'bottle',slot:'dt',L:0.75}];S.nextUid=5;S.nights=2;S.sleep='camp';applyTripKitDefaults();";

// ---- Task 4: the page's trial function ----

test('[GA-TRIAL-FN] advisorTrial with today\'s bags is the current plan: the same items, overflow and back litres',()=>{
  const p=page({setup:BAGS});
  const plan=p.json('(()=>{const a=currentPlan();return {items:a.items,overL:a.summary.overL,backL:backOf(a),spill:a.spill.map(k=>k.id),out:a.reach.outOfReach.length,kg:a.byPositionKg};})()');
  const trial=p.json('advisorTrial(S.bags,S.decks)');
  assert.deepEqual(trial.items,plan.items,'the same items');
  assert.equal(trial.overL,plan.overL,'the same overflow');
  assert.equal(trial.backL,plan.backL,'the same back litres');
  assert.ok(plan.backL>0,'this rider carries something on the back');
  assert.deepEqual(trial.spillIds,[...new Set(plan.spill)]);
  assert.equal(trial.outOfReach,plan.out);
  assert.equal(trial.backKg,plan.kg.pack||0);
  for(const [pos,kg] of Object.entries(plan.kg))assert.equal(trial.kgByPos[pos],kg,pos);
});

test('[GA-TRIAL-FN] with a bag added, advisorTrial is the plan after really adding that bag; the rack deck\'s kit counts as deck',()=>{
  const cases=[
    ['a seat pack',"[...S.bags,{uid:S.nextUid,pos:'seat',L:10}]",'{...S.decks}',"addBag('seat');S.bags.find(b=>b.pos==='seat').L=10;"],
    ['a frame bag, half frame',"[...S.bags,{uid:S.nextUid,pos:'frame',shape:2,L:bikeFit(S.bikeProfile).frameBag.shapes.find(s=>s.shape===2).L}]",'{...S.decks}',
      "addBag('frame');setFrameShape(S.bags.find(b=>b.pos==='frame').uid,2);"],
    ['a pair of panniers with the rack deck',"[...S.bags,{uid:S.nextUid,pos:'rack',pair:true,L:12}]",'{...S.decks,rack:true}',
      "addBag('rack');addBag('rack');S.bags.find(b=>b.pos==='rack').L=12;S.decks.rack=true;"],
  ];
  for(const [name,bags,decks,really] of cases){
    const p=page({setup:BAGS});
    const trial=p.json(`advisorTrial(${bags},${decks})`);
    p.run(really);
    const plan=p.json('(()=>{const a=currentPlan();return {items:a.items,overL:a.summary.overL,backL:backOf(a),decked:deckedIds()};})()');
    assert.deepEqual(trial.items,plan.items,name+': the same items');
    assert.equal(trial.overL,plan.overL,name+': the same overflow');
    assert.equal(trial.backL,plan.backL,name+': the same back litres');
    assert.equal(plan.decked.length>0,name.includes('rack deck'),name+': the deck carries kit only with the rack deck');
    if(plan.decked.length){
      const kg=p.json(`+deckedIds().reduce((n,id)=>n+itemKg(kitById(id)),0).toFixed(2)`);
      assert.ok(kg>0);assert.equal(trial.kgByPos.deck,kg,name+': the decked kit\'s kilos as deck');
    }
  }
});

test('[GA-TRIAL-FN] S, the kept plan and storage are unchanged after 100 trials, a questionnaire base included',()=>{
  const p=page({setup:BAGS+'currentPlan();'});
  const before=snapshot(p);
  p.run(`for(let i=0;i<100;i++){
    advisorTrial([...S.bags,{uid:S.nextUid,pos:'seat',L:4+(i%13)}],{...S.decks,rack:i%2===0});
    advisorTrial([{uid:1,pos:'pack',L:15}],{bar:false,rack:false},{kit:tripKitDefaults(3,'camp',S.bikeProfile),nights:3,sleep:'camp',mode:'light',custom:{},qty:{},pinned:{},placements:null,carried:{}});
  }`);
  assert.equal(snapshot(p),before,'nothing changed');
  assert.deepEqual(p.writes,[],'nothing written');
});

test('[GA-TRIAL-FN] advisorInput reads the plan, the bike and the planner\'s own bagSpec; a bag holding a hand placement is marked',()=>{
  const p=page({setup:BAGS+"currentPlan();S.pinned={rain:'2-0'};"});
  const input=p.run("(()=>{const i=advisorInput('either','handling');return JSON.stringify({...i,usable:undefined,trial:undefined,"
    +"seat:i.usable({uid:9,pos:'seat',L:16}),top:i.usable({uid:9,pos:'top',slot:'rear',L:2})});})()");
  const i=JSON.parse(input);
  assert.deepEqual(i.bags.map(b=>[b.uid,b.pos,!!b.hand]),[[1,'bar',false],[2,'top',true],[3,'pack',false],[4,'bottle',false]]);
  assert.deepEqual([i.style,i.goal,i.noPanniers,i.camping,i.nextUid,i.rackMounts],['either','handling',false,true,5,'yes']);
  assert.deepEqual(i.decks,{bar:false,rack:false});
  assert.deepEqual(i.topSlotsFree,['rear'],'the front slot is taken');
  assert.equal(i.frameReason,null);
  assert.equal(i.frameSize,'M');assert.equal(i.seatGapCm,30);
  assert.deepEqual(i.seat,{ok:true,reason:null,band:'likely'},'bagSpec\'s verdict and band');
  assert.equal(i.top.ok,true);
  const sum=p.run("JSON.stringify(advisorInput('either','handling').trial(S.bags,S.decks).items)");
  assert.equal(sum,p.run('JSON.stringify(currentPlan().items)'),'its trial is advisorTrial');
});

test('[GA-RANGES-SPEC] the size table agrees with the real bagSpec, on a bike with full details and on one with none',()=>{
  const p=page();
  const A=p.json('window.WayfinchAdvisor.SIZE_RANGES');
  // the plan's size table (decision 3)
  assert.deepEqual(A,{top:{min:0.5,max:2,step:0.5,pair:false},fork:{min:2,max:5,step:1,pair:true},bar:{min:5,max:15,step:1,pair:false},
    seat:{min:4,max:16,step:1,pair:false},rack:{min:10,max:25,step:1,pair:true}});
  for(const bike of [FULL,BARE]){
    const q=page({bike});
    for(const [pos,row] of Object.entries(A)){
      for(const L of [row.min,row.max]){
        const bag={uid:9,pos,L,...(row.pair ? {pair:true} : {}),...(pos==='top' ? {slot:'front'} : {})};
        const v=q.json(`advisorInput('either','handling').usable(${JSON.stringify(bag)})`);
        assert.equal(v.ok,true,`${bike.id}: ${pos} ${L} L is usable`);
        if(pos==='seat' && bike===FULL)assert.equal(v.band,'likely',`${bike.id}: seat ${L} L in a 30 cm gap`);
      }
    }
    // frame bags: the bike's own shapes at bikeFit's litres, never below the cage floor
    const shapes=q.json("advisorInput('either','handling').frameShapes");
    const fit=q.json('bikeFit(S.bikeProfile).frameBag.shapes.map(s=>({shape:s.shape,L:s.L,source:s.source}))');
    assert.deepEqual(shapes,fit,bike.id+': the frame litres are bikeFit\'s');
    for(const s of shapes)assert.equal(q.json(`advisorInput('either','handling').usable({uid:9,pos:'frame',shape:${s.shape},L:${s.L}})`).ok,true);
  }
  assert.equal(page({bike:FULL}).json("advisorInput('either','handling').frameShapes.every(s=>s.source==='measured')"),true);
  // a cage inside the triangle raises the floor: the full shape is not offered
  const caged=page({setup:"S.bags=[{uid:1,pos:'bottle',slot:'st',L:0.75}];S.nextUid=2;"});
  assert.deepEqual(caged.json("advisorInput('either','handling').frameShapes.map(s=>s.shape)"),[1,2]);
  // step-through: NO_MOUNT; XS with two cages in the triangle: NO_ROOM; neither has a frame bag to offer
  const step=page({bike:STEP}).json("(()=>{const i=advisorInput('either','handling');return [i.frameShapes,i.frameReason,NO_MOUNT];})()");
  assert.deepEqual(step[0],[]);assert.equal(step[1],step[2]);
  const xs=page({bike:XS,setup:"S.bags=[{uid:1,pos:'bottle',slot:'st',L:0.75},{uid:2,pos:'bottle',slot:'dt',L:0.75}];S.nextUid=3;"})
    .json("(()=>{const i=advisorInput('either','handling');return [i.frameShapes,i.frameReason,NO_ROOM,i.usable({uid:9,pos:'frame',shape:2,L:1.3}).reason];})()");
  assert.deepEqual(xs[0],[]);assert.equal(xs[1],xs[2]);assert.equal(xs[3],xs[2],'bagSpec says the same');
});

test('[GA-FROZEN] LC-FREEZE-01 and the selection fixtures pass unchanged (run, not edited)',()=>{
  const {spawnSync}=require('node:child_process');
  const r=spawnSync(process.execPath,[require('node:path').join(__dirname,'selection-fixtures.cjs')],{encoding:'utf8'});
  assert.equal(r.status,0,'the selection fixtures pass');
  assert.ok(r.stdout.includes('LC-FREEZE-01 ok'));
  assert.ok(/"status":"passed"/.test(r.stdout));
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} advisor tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
