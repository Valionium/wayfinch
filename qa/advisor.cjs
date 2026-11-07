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
  // go(n), the step change, is in the page's start-up part, which the VM leaves out: here it only sets the step
  q.run(`renderKit=()=>{};drawRig=()=>{};renderBags=()=>{};closeBagPop=()=>{};go=n=>{S.step=n;};
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
  const input=p.run("(()=>{const i=advisorInput('bags-first','handling');return JSON.stringify({...i,usable:undefined,trial:undefined,"
    +"seat:i.usable({uid:9,pos:'seat',L:16}),top:i.usable({uid:9,pos:'top',slot:'rear',L:2})});})()");
  const i=JSON.parse(input);
  assert.deepEqual(i.bags.map(b=>[b.uid,b.pos,!!b.hand]),[[1,'bar',false],[2,'top',true],[3,'pack',false],[4,'bottle',false]]);
  assert.deepEqual([i.style,i.goal,i.camping,i.nextUid,i.rackMounts],['bags-first','handling',true,5,'yes']);
  assert.deepEqual(i.decks,{bar:false,rack:false});
  assert.deepEqual(i.topSlotsFree,['rear'],'the front slot is taken');
  assert.equal(i.frameReason,null);
  assert.equal(i.frameSize,'M');assert.equal(i.seatGapCm,30);
  assert.deepEqual(i.seat,{ok:true,reason:null,band:'likely'},'bagSpec\'s verdict and band');
  assert.equal(i.top.ok,true);
  const sum=p.run("JSON.stringify(advisorInput('bags-first','handling').trial(S.bags,S.decks).items)");
  assert.equal(sum,p.run('JSON.stringify(currentPlan().items)'),'its trial is advisorTrial');
});

test('[GA-TRIAL-FN] gains are measured against a fresh re-plan of the plan: a trip cut from 3 nights to 0 after the plan was kept never credits the re-plan\'s gain to a suggested bag (review of PR 60, I1)',async()=>{
  const p=page({setup:"S.bags=[{uid:1,pos:'frame',shape:0,L:6},{uid:2,pos:'bar',L:12},{uid:3,pos:'seat',L:14},{uid:4,pos:'top',slot:'front',L:1}];S.nextUid=5;"
    +"S.nights=3;S.sleep='camp';applyTripKitDefaults();currentPlan();S.nights=0;applyTripKitDefaults();"});
  const W=p.json('window.WayfinchAdvisor.WEIGHTS');
  const score=r=>Math.round(Object.entries(r.kgByPos).reduce((n,[pos,kg])=>n+kg*W[pos],0)*100)/100;
  const kept=p.json('advisorResult(currentPlan())'),fresh=p.json('planWith({placements:null},advisorResult)');
  assert.ok(score(kept)-score(fresh)>=0.5,'this plan drifted: a re-plan alone gains 0.5 or more');
  p.run('openAdvisor()');p.run("setAdvisor('style','bags-first');setAdvisor('goal','handling')");await p.run('ADVISOR_DONE');
  assert.equal(score(p.json('advisorBase(ADVISOR.input).result')),score(fresh),'the base is the fresh re-plan');
  const a=p.json('ADVISOR.answer');
  for(const s of a.kind==='suggestions' ? a.items : [])assert.ok(score(fresh)-s.score>=0.5-1e-9,`${p.json(`advisorWhat(${JSON.stringify(s)},ADVISOR.input)`)}: its own gain over the re-plan is ${(score(fresh)-s.score).toFixed(2)}`);
  // the moves and the drawing read the same fresh plan
  assert.equal(p.run('JSON.stringify(advisorPlan(advisorBase(ADVISOR.input).bags,advisorBase(ADVISOR.input).decks,ADVISOR.input).items)'),JSON.stringify(fresh.items));
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
        const v=q.json(`advisorInput('bags-first','handling').usable(${JSON.stringify(bag)})`);
        assert.equal(v.ok,true,`${bike.id}: ${pos} ${L} L is usable`);
        if(pos==='seat' && bike===FULL)assert.equal(v.band,'likely',`${bike.id}: seat ${L} L in a 30 cm gap`);
      }
    }
    // frame bags: the bike's own shapes at bikeFit's litres, never below the cage floor
    const shapes=q.json("advisorInput('bags-first','handling').frameShapes");
    const fit=q.json('bikeFit(S.bikeProfile).frameBag.shapes.map(s=>({shape:s.shape,L:s.L,source:s.source}))');
    assert.deepEqual(shapes,fit,bike.id+': the frame litres are bikeFit\'s');
    for(const s of shapes)assert.equal(q.json(`advisorInput('bags-first','handling').usable({uid:9,pos:'frame',shape:${s.shape},L:${s.L}})`).ok,true);
  }
  assert.equal(page({bike:FULL}).json("advisorInput('bags-first','handling').frameShapes.every(s=>s.source==='measured')"),true);
  // a cage inside the triangle raises the floor: the full shape is not offered
  const caged=page({setup:"S.bags=[{uid:1,pos:'bottle',slot:'st',L:0.75}];S.nextUid=2;"});
  assert.deepEqual(caged.json("advisorInput('bags-first','handling').frameShapes.map(s=>s.shape)"),[1,2]);
  // step-through: NO_MOUNT; XS with two cages in the triangle: NO_ROOM; neither has a frame bag to offer
  const step=page({bike:STEP}).json("(()=>{const i=advisorInput('bags-first','handling');return [i.frameShapes,i.frameReason,NO_MOUNT];})()");
  assert.deepEqual(step[0],[]);assert.equal(step[1],step[2]);
  const xs=page({bike:XS,setup:"S.bags=[{uid:1,pos:'bottle',slot:'st',L:0.75},{uid:2,pos:'bottle',slot:'dt',L:0.75}];S.nextUid=3;"})
    .json("(()=>{const i=advisorInput('bags-first','handling');return [i.frameShapes,i.frameReason,NO_ROOM,i.usable({uid:9,pos:'frame',shape:2,L:1.3}).reason];})()");
  assert.deepEqual(xs[0],[]);assert.equal(xs[1],xs[2]);assert.equal(xs[3],xs[2],'bagSpec says the same');
});

test('[GA-FROZEN] LC-FREEZE-01 and the selection fixtures pass unchanged (run, not edited)',()=>{
  const {spawnSync}=require('node:child_process');
  const r=spawnSync(process.execPath,[require('node:path').join(__dirname,'selection-fixtures.cjs')],{encoding:'utf8'});
  assert.equal(r.status,0,'the selection fixtures pass');
  assert.ok(r.stdout.includes('LC-FREEZE-01 ok'));
  assert.ok(/"status":"passed"/.test(r.stdout));
});

// ---- Task 5: the advisor's view ----

// The view's text without its markup, for reading what the rider sees.
const textOf=html=>String(html).replace(/<svg[\s\S]*?<\/svg>/g,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const view=p=>({steps:p.context.document.getElementById('advisorSteps').innerHTML,answer:p.context.document.getElementById('advisorAnswer').innerHTML,
  bike:p.context.document.getElementById('advisorBike').innerHTML,progress:p.context.document.getElementById('advisorProgress').textContent});
const R2="S.bags=[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:12},{uid:3,pos:'top',slot:'front',L:1},{uid:4,pos:'bottle',slot:'dt',L:0.75},{uid:5,pos:'bottle',slot:'st',L:0.75}];S.nextUid=6;S.nights=2;S.sleep='camp';S.mode='comfort';applyTripKitDefaults();";
const GRAVEL={id:'gravel',name:'Gravel',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'},bolts:{st:'yes',dt:'yes'}},rackMounts:'no'};
async function ask(p,choices){
  p.run('openAdvisor()');
  for(const [k,v] of Object.entries(choices))p.run(`setAdvisor(${JSON.stringify(k)},${JSON.stringify(v)})`);
  await p.run('ADVISOR_DONE');
}

test('[GA-STEPS] the three steps in order, as headings; each choice is a labelled radio; the answer needs all three',async()=>{
  const p=page({setup:R2,bike:GRAVEL});
  p.run('openAdvisor()');
  const html=view(p).steps;
  const heads=[...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m=>textOf(m[1]));
  assert.deepEqual(heads.map(h=>h.slice(0,2)),['1.','2.','3.'],'three steps, in order, each a heading');
  // every choice: a radio inside its own label, with words
  const radios=[...html.matchAll(/<label class="adv-choice[^"]*"[^>]*>([\s\S]*?)<\/label>/g)];
  assert.ok(radios.length>=5,'style and goal choices at least');
  for(const [,inner] of radios){assert.ok(/<input type="radio" name="adv\w+" value="[^"]+"/.test(inner),'a radio');assert.ok(textOf(inner).length>2,'with words');}
  // step 1, the owner's ruling of 7 Nov: What kind of setup do you want?
  assert.ok(heads[0]==='1. What kind of setup do you want?');
  for(const v of ['bags','bags-first','panniers'])assert.ok(html.includes(`name="advStyle" value="${v}"`),v);
  for(const w of ['Bikepacking bags only','Bags first, panniers only if needed','Panniers are fine'])assert.ok(textOf(html).includes(w),w);
  for(const v of ['handling','backpack'])assert.ok(html.includes(`name="advGoal" value="${v}"`),v);
  // one or two steps chosen: no search, and the answer says what is missing
  // Bags first is chosen when the view opens (the default); the goal is still to choose
  assert.equal(p.json('ADVISOR.style'),'bags-first','the default setup');
  await ask(p,{style:'bags'});
  assert.equal(p.json('ADVISOR.answer'),null,'no answer with the goal missing');
  assert.ok(/Choose/.test(textOf(view(p).answer)));
  // the view opens with Bags first chosen; a setup taken away again (in the open view) leaves no answer
  p.run("setAdvisor('style',null);setAdvisor('goal','handling')");await p.run('ADVISOR_DONE');
  assert.equal(p.json('ADVISOR.answer'),null,'no answer with the style missing');
  await ask(p,{style:'bags',goal:'handling'});
  assert.ok(p.json('ADVISOR.answer.kind'),'all three: an answer');
});

test('[GA-STEPS] with no rack mounts and no rack in the plan a line says no rack or panniers are offered; every setup stays open; Not sure, Yes or a rack fitted: no line (the owner, 7 Nov)',()=>{
  const p=page({setup:R2,bike:GRAVEL});
  p.run('openAdvisor()');
  const html=view(p).steps;
  assert.ok(!/name="advStyle"[^>]*disabled/.test(html),'no setup is closed');
  assert.ok(textOf(html).includes('Your bike has no rack mounts, so no rack or panniers are offered.'));
  for(const bike of [FULL,BARE]){
    const q=page({setup:R2,bike});q.run('openAdvisor()');
    assert.ok(!textOf(view(q).steps).includes('no rack mounts'),bike.id+': no line');
  }
  const fitted=page({setup:R2+"S.bags.push({uid:6,pos:'rack',L:15});S.nextUid=7;",bike:GRAVEL});fitted.run('openAdvisor()');
  assert.ok(!textOf(view(fitted).steps).includes('no rack mounts'),'a rack fitted: no line in step 1 (the answer says it stays)');
});

test('[GA-PLAN-INPUT] with a plan: N items and M bags are the plan\'s; the switch moves to the questionnaire and back without changing S',()=>{
  const p=page({setup:R2+"S.bags.push({uid:6,pos:'fork',pair:true,L:3});S.nextUid=7;"});
  const before=snapshot(p);
  p.run('openAdvisor()');
  const n=p.json('activeKit().length'),m=p.json('gearBags().reduce((t,b)=>t+countOf(b),0)');
  assert.equal(m,5,'seat, bar, top tube and two fork cages; the bottles are not bags');
  assert.ok(textOf(view(p).steps).includes(`Using your packing: ${n} items, ${m} bags`));
  p.run("setAdvisor('source','questionnaire')");
  assert.ok(textOf(view(p).steps).includes('Starting from a 15 L backpack'),'the questionnaire');
  assert.ok(view(p).steps.includes('name="advRiding"'));
  p.run("setAdvisor('source','plan')");
  assert.ok(textOf(view(p).steps).includes('Using your packing'));
  p.run('closeAdvisor()');
  assert.equal(snapshot(p),before,'S as it was');assert.deepEqual(p.writes,[],'nothing written');
});

test('[GA-QUESTIONNAIRE] each answer maps as decision 5: riding pre-selects the style, nights and sleep go to the trip, the kit is tripKitDefaults, light / average / a lot',()=>{
  const p=page({setup:'S.bags=[];S.nextUid=1;'});
  p.run('openAdvisor()');
  assert.equal(p.json('ADVISOR.source'),'questionnaire','no plan: the questionnaire');
  // the riding picks the setup, by advisor.js's DECIDED.ridingSetup (the owner's ruling of 7 Nov)
  assert.deepEqual(p.json('window.WayfinchAdvisor.DECIDED.ridingSetup'),{touring:'panniers',road:'bags',gravel:'bags',mtb:'bags',everyday:'bags-first'});
  for(const [riding,style] of [['touring','panniers'],['road','bags'],['gravel','bags'],['mtb','bags'],['everyday','bags-first']]){
    p.run(`ADVISOR.style=null;ADVISOR.styleTouched=false;setAdvisor('riding','${riding}')`);
    assert.equal(p.json('ADVISOR.style'),style,riding+' pre-selects '+style);
  }
  p.run("setAdvisor('style','panniers');setAdvisor('riding','road')");
  assert.equal(p.json('ADVISOR.style'),'panniers','a setup the rider chose stays');
  const q=a=>p.json(`(()=>{const q=advisorQuestionnaire(${JSON.stringify(a)});return {...q,base:{...q.base,kit:undefined},kitSame:JSON.stringify(q.base.kit)===JSON.stringify(tripKitDefaults(${a.nights},'${a.sleep}',S.bikeProfile))};})()`);
  const light=q({riding:'mtb',nights:1,sleep:'camp',carry:'light'});
  assert.deepEqual(light.bags,[{uid:1,pos:'pack',L:15}],'a 15 L backpack');
  assert.equal(light.nextUid,2);
  assert.equal(light.kitSame,true,'the kit is tripKitDefaults(nights, sleep, bike)');
  assert.deepEqual([light.base.nights,light.base.sleep,light.base.mode],[1,'camp','light']);
  const tiers=p.json('Object.fromEntries(KIT.filter(k=>k.tiers).map(k=>[k.id,k.tiers]))');
  const lot=q({riding:'touring',nights:4,sleep:'indoor',carry:'lot'});
  for(const [id,list] of Object.entries(tiers)){
    const lightest=[...list].sort((a,b)=>a.kg-b.kg||a.L-b.L)[0],bulkiest=[...list].sort((a,b)=>b.L-a.L||b.kg-a.kg)[0];
    assert.deepEqual([light.base.custom[id].L,light.base.custom[id].kg],[lightest.L,lightest.kg],id+': light takes the lightest tier');
    assert.deepEqual([lot.base.custom[id].L,lot.base.custom[id].kg],[bulkiest.L,bulkiest.kg],id+': a lot takes the bulkiest tier');
  }
  assert.equal(lot.base.mode,'comfort');
  const avg=q({riding:'touring',nights:4,sleep:'indoor',carry:'average'});
  assert.deepEqual([avg.base.nights,avg.base.sleep,avg.base.mode],[4,'indoor','comfort']);
  assert.deepEqual(avg.base.custom,{},'average: the default kit');
  assert.deepEqual([avg.base.qty,avg.base.pinned,avg.base.placements,avg.base.carried],[{},{},null,{}],'nothing of the plan carries over');
});

test('[GA-QUESTIONNAIRE] the starting 15 L backpack is named; the plan, the draft and S are unchanged after the answer',async()=>{
  const p=page({setup:'S.bags=[];S.nextUid=1;'});
  const before=snapshot(p);
  await ask(p,{riding:'gravel',nights:2,sleep:'camp',carry:'average',goal:'backpack'});
  assert.ok(p.json('ADVISOR.answer.kind'));
  assert.ok(textOf(view(p).steps).includes('Starting from a 15 L backpack'));
  assert.ok(textOf(view(p).answer).includes('Starting from a 15 L backpack'),'named with the answer too');
  p.run('closeAdvisor()');
  assert.equal(snapshot(p),before,'S, the kept plan and storage as they were');
  assert.deepEqual(p.writes,[],'nothing written: no draft, no summary');
});

test('[GA-ANSWER] each suggestion shows type and size range, the bike drawn with it, where things move and why; no brand word; the style rule on screen',async()=>{
  const brands=require('./fixtures/advisor/brands.json').brands;
  const p=page({setup:R2,bike:GRAVEL});
  await ask(p,{style:'bags',goal:'handling'});
  const a=p.json('ADVISOR.answer');
  assert.equal(a.kind,'suggestions');
  const html=view(p).answer;
  const items=html.split('<li class="adv-sugg"').slice(1);
  assert.equal(items.length,a.items.length,'one entry per suggestion');
  a.items.forEach((s,i)=>{
    const t=textOf(items[i]);
    const what=p.json(`advisorWhat(ADVISOR.answer.items[${i}],ADVISOR.input)`);
    assert.ok(t.includes(what),'what to get: '+what);
    assert.ok(/\d L/.test(what),'with its size');
    assert.ok(/<svg[^>]*class="bk/.test(items[i]),'the bike, drawn');
    assert.ok(/Why it helps/.test(t),'why');
    for(const tag of s.tags)assert.ok(t.includes(tag),'its tags: '+tag);
    assert.ok(!/pannier|rack/i.test(what),'no rack under Bikepacking bags only');
  });
  assert.ok(/→/.test(textOf(html)),'where things move: from → to');
  for(const b of brands)assert.ok(!new RegExp(`\\b${b}\\b`).test(textOf(html)),'no brand: '+b);
  // the drawing has the new bag: the first suggestion's position is in the drawn view
  const drawn=p.json('advisorBagView(advisorTrialBags(ADVISOR.answer.items[0],ADVISOR.input),ADVISOR.answer.items[0].decks,ADVISOR.input)');
  for(const bag of a.items[0].add)assert.ok(drawn.items.some(x=>x.pos===bag.pos),'drawn with the '+bag.pos);
  // each card's drawing is named by its bag, the bike's own name hidden inside it (review of PR 60, m4)
  const names=items.map(it=>(/<div class="adv-drawing" role="img" aria-label="([^"]+)">/.exec(it)||[])[1]);
  a.items.forEach((s,i)=>{
    const what=p.json(`advisorWhat(ADVISOR.answer.items[${i}],ADVISOR.input)`);
    // a swap reads as the new bag instead of the old one (re-check of PR 60)
    const name=s.kind==='swap' ? null : `Your bike with ${what.replace(/^./,c=>c.toLowerCase())}`;
    if(name)assert.equal(names[i],p.run('htmlEsc')(name),'drawing '+(i+1)+' named by its bag');
    // the bike image inside is hidden: the card's drawing has one name, its own
    assert.ok(/<div class="adv-drawing" role="img" aria-label="[^"]+"><svg aria-hidden="true"/.test(items[i]),'drawing '+(i+1)+': the inner bike image hidden');
  });
  const swap=a.items.findIndex(s=>s.kind==='swap');
  assert.ok(swap>=0,'R2 has a swap among its suggestions');
  assert.equal(names[swap],'Your bike with a 15 L handlebar roll instead of your 12 L handlebar roll');
  assert.ok(names.every(n=>!/with replace/i.test(n)),'never "with replace"');
  assert.equal(new Set(names).size,names.length,'no two drawings share a name');
});

test('[GA-SCREEN] the answer is not a live region: one short status line says what changed, so a screen reader does not read every card again (review of PR 60, m3)',async()=>{
  assert.ok(!/id="advisorAnswer"[^>]*aria-live/.test(page().html.slice(page().html.indexOf('id="advisorBox"'))),'#advisorAnswer is not aria-live');
  const p=page({setup:R2,bike:GRAVEL});
  const status=()=>p.context.document.getElementById('advisorStatus').textContent;
  p.run('openAdvisor()');
  assert.equal(status(),'Choose all three steps to see what to get.');
  await ask(p,{style:'bags',goal:'handling'});
  const n=p.json('ADVISOR.answer.items.length');
  assert.equal(status(),`${n} suggestions, best first.`);
  const say=a=>{p.run(`ADVISOR.answer=${JSON.stringify(a)};renderAdvisorAnswer()`);return status();};
  const common={tried:40,frameReason:null,partial:false};
  assert.equal(say({kind:'already-good',...common}),'Your bags already suit this; nothing to add.');
  assert.equal(say({kind:'nothing-helps',closest:null,...common}),'Nothing helps within this style.');
  assert.equal(say({kind:'cannot-reduce',backL:3,...common}),'No bag takes more off your back.');
  assert.equal(say({kind:'already-good',...common,partial:true}),'Your bags already suit this; nothing to add. This search stopped early.');
});

test('[GA-ANSWER] a bike whose rack mounts are Not sure (no field, as sub-project 11 stores it) and no rack fitted: every rack or pannier shown says "if your bike has rack mounts"',async()=>{
  const p=page({bike:BARE,setup:"S.bags=[{uid:1,pos:'pack',L:15}];S.nextUid=2;S.nights=2;S.sleep='camp';applyTripKitDefaults();"});
  assert.equal(p.json("advisorInput('bags-first','backpack').rackMounts"),null,'no field');
  await ask(p,{style:'panniers',goal:'backpack'});
  const a=p.json('ADVISOR.answer');
  const racks=[...a.items,...(a.ahead ? [a.ahead] : [])].filter(s=>s.deck || s.add.some(b=>b.pos==='rack'));
  assert.ok(racks.length>0,'a rack is among the suggestions');
  for(const s of racks)assert.ok(s.tags.includes('if your bike has rack mounts'));
  assert.ok(textOf(view(p).answer).includes('if your bike has rack mounts'),'and the tag is on screen');
});

test('[GA-ANSWER] the words of each answer: a swap, a pair, already good, cannot reduce, nothing helps with what stays over, a search cut short',()=>{
  const p=page({setup:R2});
  const input="advisorInput('bags-first','handling')";
  const sugg=(kind,add,remove)=>({kind,add,remove,decks:{bar:false,rack:false},newBags:add.length,litres:add.reduce((n,b)=>n+b.L,0),tags:[],
    result:{overL:0,spillIds:[],backL:0,backKg:0,outOfReach:0,kgByPos:{},items:{}},score:0,rangeL:[add[0].L,add[0].L+2]});
  p.context.qaSwap=JSON.stringify({...sugg('swap',[{uid:9,pos:'frame',shape:0,L:6}],1),rangeL:[6,6]});
  assert.equal(p.json(`advisorWhat(JSON.parse(qaSwap),${input})`),'Replace your 14 L seat pack with a 6 L frame bag (full triangle)');
  p.context.qaAdd=JSON.stringify(sugg('add',[{uid:9,pos:'fork',pair:true,L:3}],null));
  assert.equal(p.json(`advisorWhat(JSON.parse(qaAdd),${input})`),'Fork cages, 2 × 3–5 L');
  const say=a=>textOf(p.run(`advisorAnswerHtml(${JSON.stringify(a)},${input})`));
  const common={tried:40,frameReason:null,partial:false};
  assert.ok(say({kind:'already-good',...common}).includes('Your bags already suit this; nothing to add.'));
  assert.ok(say({kind:'cannot-reduce',backL:3,...common}).includes('3 L stay on your back'));
  // exact: the search answers cannot-reduce when nothing takes 0.5 L or more off (decision 6), so the sentence says so (PR 60, m2)
  assert.ok(say({kind:'cannot-reduce',backL:3,...common}).includes('No bag within this style takes 0.5 L or more off your back: 3 L stay on your back.'));
  // the 0.5 L is table.ts's MIN_GAIN_BACK_L, as advisor.js hands it over, never typed into the page (re-check of PR 60)
  assert.equal(p.json('window.WayfinchAdvisor.MIN_GAIN_BACK_L'),0.5);
  p.run('window.WayfinchAdvisor={...window.WayfinchAdvisor,MIN_GAIN_BACK_L:0.7}');
  assert.ok(say({kind:'cannot-reduce',backL:3,...common}).includes('takes 0.7 L or more off your back'),'the sentence follows the table');
  const none=say({kind:'nothing-helps',closest:{...sugg('add',[{uid:9,pos:'seat',L:16}],null),rangeL:[16,16],result:{overL:2.4,spillIds:['tent','stove'],backL:0,backKg:0,outOfReach:0,kgByPos:{},items:{}}},...common});
  assert.ok(none.includes('Nothing helps'),'says so plainly');
  assert.ok(/Closest: Seat pack, 16 L/.test(none),'the closest option');
  assert.ok(none.includes('2.4 L') && none.includes('Tent') && none.includes('Stove and gas'),'what would still be left over');
  assert.ok(say({kind:'already-good',...common,partial:true}).includes('This search stopped early'),'a search cut short says so');
  assert.ok(say({kind:'already-good',...common,frameReason:p.run('NO_MOUNT')}).includes("Frame bags aren't offered. No mount on this bike."),'the planner\'s own reason');
});

test('[GA-ANSWER] a single fork cage or pannier reads as one bag, a pair as 2 ×; Looking ahead reads as Minimal\'s first plus the bag it adds, a swap included (the owner, 7 Nov)',()=>{
  const p=page({setup:R2});
  const input="advisorInput('bags-first','handling')";
  const what=s=>{p.context.qaS=JSON.stringify(s);return p.json(`advisorWhat(JSON.parse(qaS),${input})`);};
  const drawn=s=>{p.context.qaS=JSON.stringify(s);return p.json(`advisorDrawnName(JSON.parse(qaS),${input})`);};
  const s=(kind,add,remove,rangeL)=>({kind,add,remove,decks:{bar:false,rack:false},newBags:add.length,litres:0,tags:[],rangeL:rangeL||[add[0].L,add[0].L],
    result:{overL:0,spillIds:[],backL:0,backKg:0,outOfReach:0,kgByPos:{},items:{}},score:0});
  assert.equal(what(s('add',[{uid:9,pos:'fork',L:4}],null,[4,5])),'Fork cage, 4–5 L');
  assert.equal(what(s('add',[{uid:9,pos:'fork',pair:true,L:4}],null,[4,5])),'Fork cages, 2 × 4–5 L');
  // R2 has no rack fitted: panniers come with a rack to fit (the owner's ruling of 7 Nov)
  assert.equal(what(s('add',[{uid:9,pos:'rack',L:10}],null,[10,12])),'Rack and pannier, 10–12 L');
  assert.equal(what(s('add',[{uid:9,pos:'rack',pair:true,L:10}],null,[10,12])),'Rack and panniers, 2 × 10–12 L');
  assert.equal(what(s('swap',[{uid:9,pos:'fork',L:4}],1,[4,5])),'Replace your 14 L seat pack with a 4–5 L fork cage');
  const ahead=s('ahead',[{uid:9,pos:'seat',L:16},{uid:10,pos:'bar',L:6}],null);
  assert.equal(what(ahead),'Seat pack, 16 L, plus handlebar roll, 6 L');
  assert.equal(drawn(ahead),'Your bike with seat pack, 16 L, plus handlebar roll, 6 L');
  const swapAhead=s('ahead',[{uid:9,pos:'frame',shape:0,L:6},{uid:10,pos:'fork',L:3}],2);
  assert.equal(what(swapAhead),'Replace your 12 L handlebar roll with a 6 L frame bag (full triangle), plus fork cage, 3 L');
  assert.equal(drawn(swapAhead),'Your bike with a 6 L frame bag (full triangle) and a 3 L fork cage instead of your 12 L handlebar roll');
});

test('[GA-ANSWER] two kinds of answer, each labelled: "Minimal" over the fewest bags that do it, "Looking ahead" over one set that covers more, or a line saying there is none (the owner, 7 Nov)',async()=>{
  const p=page({setup:'S.bags=[];S.nextUid=1;'});
  await ask(p,{riding:'mtb',nights:1,sleep:'camp',carry:'light',goal:'backpack'});
  const a=p.json('ADVISOR.answer');
  assert.equal(a.kind,'suggestions');
  assert.ok(a.ahead,'R4-like: a set that covers more');
  const html=view(p).answer;
  const heads=[...html.matchAll(/<h4[^>]*>([\s\S]*?)<\/h4>/g)].map(m=>textOf(m[1]));
  assert.deepEqual(heads,['Minimal','Looking ahead'],'two labelled parts, in that order');
  const [minimal,later]=html.split(/<h4[^>]*>Looking ahead<\/h4>/);
  assert.ok(textOf(minimal).includes('The fewest new bags that do it.'));
  assert.equal(minimal.split('<li class="adv-sugg"').length-1,a.items.length,'Minimal holds the suggestions');
  const aheadWhat=p.json('advisorWhat(ADVISOR.answer.ahead,ADVISOR.input)');
  assert.ok(textOf(later).includes(aheadWhat),'Looking ahead holds its set: '+aheadWhat);
  assert.ok(/, plus /.test(aheadWhat),'Minimal\'s first plus one more');
  assert.ok(/<svg[^>]*class="bk/.test(later) && /Why it helps/.test(textOf(later)),'drawn, and why');
  // its card is reached like the others, with an id of its own
  const ids=[...html.matchAll(/aria-labelledby="(advS\d+)"/g)].map(m=>m[1]);
  // Looking ahead's set and its alternatives side by side (the owner's ruling on PR 61)
  assert.equal(new Set(ids).size,a.items.length+1+a.aheadAlts.length,'one card each, ids unique');
  // with nothing better, the Looking ahead part says so
  p.run('ADVISOR.answer={...ADVISOR.answer,ahead:null};renderAdvisorAnswer()');
  assert.ok(textOf(view(p).answer).includes('No further bag would help much more than Minimal.'));
});

// ---- Task 6: the example riders ----

const RIDERS=require('./fixtures/advisor/riders.json').riders;
// Each item's lightest or bulkiest tier, as the questionnaire's light and a lot take them (decision 5).
const CARRY={light:"S.mode='light';S.custom=Object.fromEntries(KIT.filter(k=>k.tiers).map(k=>{const t=[...k.tiers].sort((a,b)=>a.kg-b.kg||a.L-b.L)[0];return [k.id,{L:t.L,kg:t.kg,rigid:t.rigid}];}));",
  average:"S.mode='comfort';S.custom={};",
  lot:"S.mode='comfort';S.custom=Object.fromEntries(KIT.filter(k=>k.tiers).map(k=>{const t=[...k.tiers].sort((a,b)=>b.L-a.L||b.kg-a.kg)[0];return [k.id,{L:t.L,kg:t.kg,rigid:t.rigid}];}));"};
async function rider(r,style=r.style){
  const plan=r.plan;
  const setup=plan
    ? `S.bags=${JSON.stringify(plan.bags)};S.nextUid=${Math.max(...plan.bags.map(b=>b.uid))+1};S.decks=${JSON.stringify(plan.decks)};S.nights=${plan.nights};S.sleep='${plan.sleep}';applyTripKitDefaults();${CARRY[plan.carry]}`
    : 'S.bags=[];S.nextUid=1;';
  const p=page({bike:r.bike,setup});
  p.run('openAdvisor()');
  if(r.questionnaire)for(const [k,v] of Object.entries(r.questionnaire))p.run(`setAdvisor(${JSON.stringify(k)},${JSON.stringify(v)})`);
  p.run(`setAdvisor('style',${JSON.stringify(style)});setAdvisor('goal',${JSON.stringify(r.goal)})`);
  await p.run('ADVISOR_DONE');
  return p;
}
// The answer as the fixture holds it: its kind, and each suggestion's kind, what to get (type and size range) and tags: Minimal's
// items and Looking ahead's set (the owner, 7 Nov).
const summary=p=>p.json(`(()=>{const a=ADVISOR.answer,i=ADVISOR.input,one=s=>({kind:s.kind,what:advisorWhat(s,i),tags:s.tags});
  return {kind:a.kind,partial:a.partial,...(a.kind==='suggestions' ? {items:a.items.map(one),ahead:a.ahead && one(a.ahead),minimalSame:a.minimalSame,aheadAlts:a.aheadAlts.map(one)} : {}),
    ...(a.kind==='nothing-helps' ? {closest:a.closest && {...one(a.closest),overL:a.closest.result.overL,spill:a.closest.result.spillIds}} : {}),
    ...(a.kind==='cannot-reduce' ? {backL:a.backL} : {})};})()`);

test('[GA-RIDERS] each example rider gives exactly its written answer (qa/fixtures/advisor/riders.json, read by the owner at O2)',async()=>{
  const got={};
  for(const r of RIDERS){
    const p=await rider(r);
    got[r.id]=summary(p);
    // litres that round to nothing are nothing: never "0 L stay there"
    assert.ok(!/\b0 L stay/.test(textOf(p.context.document.getElementById('advisorAnswer').innerHTML)),r.id+': no "0 L stay"');
  }
  const missing=RIDERS.filter(r=>!r.expect).map(r=>r.id);
  assert.equal(missing.length,0,`riders with no written answer yet: ${missing}; computed: ${JSON.stringify(got)}`);
  for(const r of RIDERS)assert.deepEqual(got[r.id],r.expect,r.id+' '+r.about);
});

test('[GA-STYLE-PAGE] under Bikepacking bags only no example rider gets panniers or a rack to fit, in the search and in the answer\'s words; R3\'s own panniers leave the plan, its rack stays, and the answer says so; R4 (no rack mounts) never gets a rack, and its step 1 shows the line',async()=>{
  const r4=RIDERS.find(r=>r.id==='R4');
  for(const [r,style] of [[r4,'bags-first'],[r4,'panniers'],...RIDERS.map(r=>[r,'bags'])]){
    const p=await rider(r,style);
    const a=p.json('ADVISOR.answer');
    const fitted=p.json('advisorRackFitted(ADVISOR.input)');
    const shown=a.kind==='suggestions' ? [...a.items,...(a.ahead ? [a.ahead] : [])] : a.kind==='nothing-helps' && a.closest ? [a.closest] : [];
    for(const s of shown){
      if(style==='bags')assert.ok(!s.add.some(b=>b.pos==='rack'),`${r.id} ${style}: no pannier`);
      if(!fitted && (style==='bags' || r===r4))assert.ok(!s.deck && !s.add.some(b=>b.pos==='rack'),`${r.id} ${style}: no rack to fit`);
      if(style==='bags')assert.ok(!/pannier/i.test(p.json(`advisorWhat(${JSON.stringify(s)},ADVISOR.input)`)),`${r.id} ${style}: none on screen`);
    }
    const text=textOf(p.context.document.getElementById('advisorAnswer').innerHTML);
    const out='With bikepacking bags only, your panniers are left out of these suggestions; your rack stays for its top deck.';
    if(style==='bags')assert.ok(!/\bpanniers?\b/i.test(text.replace(out,'')),`${r.id} ${style}: no pannier in the answer's words`);
    if(r.id==='R3' && style==='bags')assert.ok(text.includes(out),'R3, bags only: the line says its panniers are left out and its rack stays');
    if(r===r4)assert.ok(textOf(p.context.document.getElementById('advisorSteps').innerHTML).includes('Your bike has no rack mounts, so no rack or panniers are offered.'),'R4: the line');
  }
});

// ---- The rack, the owner's ruling of 7 Nov: use what you have, a rack does the job, new bags, panniers last ----

// The owner's example: a tent in the backpack. A pair of panniers full of the rest, or none; two nights camping.
const TENT_IN_PACK="S.nights=2;S.sleep='camp';applyTripKitDefaults();S.mode='comfort';S.nextUid=5;";
test('[GA-DECK] a tent in the backpack, with a rack fitted: "Put the tent … on your rack, no new bag needed", the whole Minimal answer; with rack mounts no, the rack stays and a line says so',async()=>{
  for(const bike of [FULL,GRAVEL]){
    const p=page({bike,setup:TENT_IN_PACK+"S.bags=[{uid:1,pos:'rack',pair:true,L:10},{uid:2,pos:'pack',L:20}];S.decks={bar:false,rack:false};"});
    const planned=p.json("(()=>{const a=currentPlan();return Object.keys(a.items).filter(id=>(a.items[id]||[]).some(e=>String(e[0]).split('-')[0]==='2'));})()");
    assert.ok(planned.includes('tent'),bike.id+': the backpack holds the tent today');
    await ask(p,{style:'bags-first',goal:'backpack'});
    const a=p.json('ADVISOR.answer');
    assert.equal(a.kind,'suggestions',bike.id);
    assert.deepEqual(a.items.map(s=>[s.kind,s.newBags,s.add.length]),[['deck',0,0]],bike.id+': the rack deck, no new bag, alone');
    const what=p.json('advisorWhat(ADVISOR.answer.items[0],ADVISOR.input)');
    assert.ok(/^Put the .*tent.* on your rack, no new bag needed$/.test(what),what);
    const text=textOf(view(p).answer);
    assert.ok(text.includes(what));
    assert.equal(text.includes('Your bike is set to no rack mounts, but your plan has a rack: it stays in these suggestions.'),bike===GRAVEL,bike.id+': the line when the mounts say no');
  }
});

test('[GA-DECK] a tent in the backpack, no rack fitted, rack mounts yes: "a rack" comes first, one new thing; Not sure: tagged; never under Bikepacking bags only, nor with rack mounts no',async()=>{
  const setup=TENT_IN_PACK+"S.bags=[{uid:1,pos:'seat',L:10},{uid:2,pos:'pack',L:15}];S.decks={bar:false,rack:false};";
  for(const [bike,style] of [[FULL,'bags-first'],[FULL,'panniers'],[BARE,'bags-first']]){
    const p=page({bike,setup});
    await ask(p,{style,goal:'backpack'});
    const first=p.json('ADVISOR.answer.items[0]');
    assert.deepEqual([first.kind,first.newBags,first.decks.rack],['deck',1,true],`${bike.id} ${style}: a rack first`);
    const what=p.json('advisorWhat(ADVISOR.answer.items[0],ADVISOR.input)');
    assert.ok(/^A rack, with the .*tent.* on its top deck$/.test(what),what);
    assert.equal(first.tags.includes('if your bike has rack mounts'),bike===BARE,bike.id+': tagged when Not sure');
  }
  for(const [bike,style] of [[FULL,'bags'],[GRAVEL,'panniers']]){
    const p=page({bike,setup});
    await ask(p,{style,goal:'backpack'});
    const a=p.json('ADVISOR.answer');
    const shown=a.kind==='suggestions' ? [...a.items,...(a.ahead ? [a.ahead] : [])] : [];
    assert.ok(!shown.some(s=>s.deck || s.add.some(b=>b.pos==='rack')),`${bike.id} ${style}: no rack, no panniers`);
  }
});

test('[GA-STYLE] a giant backpack holding the tent and the sleeping bag, no rack fitted: a rack with panniers is offered under Bags first and Panniers are fine, never under Bikepacking bags only',async()=>{
  const setup="S.nights=4;S.sleep='camp';applyTripKitDefaults();"+CARRY.lot+"S.bags=[{uid:1,pos:'pack',L:50},{uid:2,pos:'seat',L:8}];S.nextUid=3;S.decks={bar:false,rack:false};";
  const offered={};
  for(const style of ['bags','bags-first','panniers']){
    const p=page({bike:FULL,setup});
    const inPack=p.json("(()=>{const a=currentPlan();return ['tent','quilt'].filter(id=>(a.items[id]||[]).some(e=>String(e[0]).split('-')[0]==='1'));})()");
    assert.deepEqual(inPack,['tent','quilt'],'the backpack holds the tent and the sleeping bag');
    await ask(p,{style,goal:'backpack'});
    const a=p.json('ADVISOR.answer');
    const shown=a.kind==='suggestions' ? [...a.items,...(a.ahead ? [a.ahead] : [])] : [];
    offered[style]=shown.some(s=>s.add.some(b=>b.pos==='rack'));
  }
  assert.deepEqual(offered,{bags:false,'bags-first':true,panniers:true});
});

// ---- The review of PR 61 ----

test('[GA-ANSWER] a rack with panniers is one rack: Looking ahead beside "a rack" names the rack once, in what to get and in the drawing\'s name, and says what rides on its top deck (review of PR 61, I3)',async()=>{
  // the reviewer's rider: a 30 L backpack holding the tent, two nights camping, no rack, Panniers are fine
  const p=page({bike:FULL,setup:"S.nights=2;S.sleep='camp';applyTripKitDefaults();S.mode='comfort';S.bags=[{uid:1,pos:'pack',L:30}];S.nextUid=2;S.decks={bar:false,rack:false};"});
  await ask(p,{style:'panniers',goal:'backpack'});
  const a=p.json('ADVISOR.answer');
  const shown=[...a.items.map((_,i)=>`ADVISOR.answer.items[${i}]`),...(a.ahead ? ['ADVISOR.answer.ahead'] : [])];
  const racks=t=>(t.match(/\brack\b/gi)||[]).length;
  let panniers=0;
  for(const ref of shown){
    const s=p.json(ref),what=p.json(`advisorWhat(${ref},ADVISOR.input)`),drawn=p.json(`advisorDrawnName(${ref},ADVISOR.input)`);
    assert.ok(racks(what)<=1,'one rack in: '+what);
    assert.ok(racks(drawn)<=1,'one rack in: '+drawn);
    if(s.add.some(b=>b.pos==='rack')){panniers++;assert.ok(/on its top deck/.test(what),'the deck that comes with the rack is said: '+what);}
  }
  assert.ok(panniers>0,'a rack with panniers is among them');
});

test('[GA-DECK] the deck suggestion\'s moves include the tent and the sleeping mat going to the rack top deck (review of PR 61, m1)',async()=>{
  const p=page({bike:FULL,setup:TENT_IN_PACK+"S.bags=[{uid:1,pos:'rack',pair:true,L:10},{uid:2,pos:'pack',L:20}];S.decks={bar:false,rack:false};"});
  await ask(p,{style:'bags-first',goal:'backpack'});
  const moves=p.json('advisorMoves(ADVISOR.answer.items[0],ADVISOR.input)');
  assert.ok(moves.some(m=>/^Tent: .+ → rack top deck$/.test(m)),'the tent: '+JSON.stringify(moves));
  assert.ok(moves.some(m=>/^Sleeping mat: .+ → rack top deck$/.test(m)),'the mat: '+JSON.stringify(moves));
  assert.ok(textOf(view(p).answer).includes('→ rack top deck'),'on screen');
});

// ---- The owner's rulings on PR 61 (7 Nov) ----

// The reviewer's rider: a 30 L backpack holding about 25.7 L, two nights camping, no rack, Bags first.
const PACK30="S.nights=2;S.sleep='camp';applyTripKitDefaults();S.mode='comfort';S.bags=[{uid:1,pos:'pack',L:30}];S.nextUid=2;S.decks={bar:false,rack:false};";
test('[GA-MINIMAL] Get the backpack off, about 25.7 L on the back: Minimal shows only what takes a quarter or more off, so never a 2 L top tube bag, and the seat pack is there (the owner\'s ruling on PR 61, I2)',async()=>{
  const p=page({bike:FULL,setup:PACK30});
  await ask(p,{style:'bags-first',goal:'backpack'});
  const back=p.json('advisorBase(ADVISOR.input).result.backL');
  assert.ok(back>20,'a lot on the back: '+back);
  const items=p.json('ADVISOR.answer.items');
  assert.ok(!items.some(s=>s.add.some(b=>b.pos==='top')),'no top tube bag');
  assert.ok(items.some(s=>s.add.some(b=>b.pos==='seat')),'the seat pack');
  for(const s of items)assert.ok(back-s.result.backL>=0.25*back-1e-9,'each takes a quarter or more off');
});

test('[GA-SCREEN] combinations that reach about the same result sit side by side: a row of 2–3 bike sketches, each a button named by its bags, with a one-line why and a one-line how, pointing at its card (the owner\'s ruling on PR 61)',async()=>{
  // R2, the gravel bikepacker: a half frame bag (19.73) and one fork cage (19.38) do about the same for handling
  const p=page({bike:GRAVEL,setup:R2});
  await ask(p,{style:'bags',goal:'handling'});
  const a=p.json('ADVISOR.answer');
  assert.ok(a.minimalSame.length>=2,'this rider has combinations side by side: '+JSON.stringify(a.minimalSame));
  const html=view(p).answer;
  const rows=html.split('<ul class="adv-combos"').slice(1).map(r=>r.slice(0,r.indexOf('</ul>')));
  assert.equal(rows.length,(a.minimalSame.length>=2 ? 1 : 0)+(a.ahead && a.aheadAlts.length ? 1 : 0),'one row per part that has combinations');
  const first=rows[0];
  const buttons=[...first.matchAll(/<button type="button" class="adv-combo" data-card="(advS\d+)" aria-label="([^"]+)" aria-describedby="([^"]+)">([\s\S]*?)<\/button>/g)];
  assert.equal(buttons.length,a.minimalSame.length,'one sketch per combination');
  buttons.forEach(([,card,label,described,inner],k)=>{
    const i=a.minimalSame[k];
    assert.equal(card,'advS'+i,'points at its card');
    assert.equal(label,p.run('htmlEsc')(p.json(`advisorDrawnName(ADVISOR.answer.items[${i}],ADVISOR.input)`)),'named by its bags');
    assert.ok(/<svg aria-hidden="true"[^>]*class="bk/.test(inner),'the planner\'s own bike drawing');
    const why=(/<span class="adv-combo-why" id="([^"]+)">([^<]+)<\/span>/.exec(inner)||[]),how=(/<span class="adv-combo-how" id="([^"]+)">([^<]+)<\/span>/.exec(inner)||[]);
    assert.ok(why[2] && how[2],'a why and a how');
    assert.deepEqual(described.split(' '),[why[1],how[1]],'described by them');
    assert.ok(html.includes(`<h5 id="advS${i}">`),'its card is there');
  });
});

test('[GA-ANSWER] every shape of suggestion reads cleanly, what to get and the drawing\'s name: one bag, two bags, a rack, a rack with panniers, two bags with a rack to fit, a swap, a swap set, the deck of a rack fitted; never "plus with", a doubled word or a dangling comma (re-check of PR 61, R1)',()=>{
  const res={overL:0,spillIds:[],backL:0,backKg:0,outOfReach:0,kgByPos:{},items:{}};
  const sg=(kind,add,remove,o={})=>({kind,add,remove,decks:{bar:false,rack:false},newBags:add.length,litres:0,deck:false,tags:[],rangeL:add[0] ? [add[0].L,add[0].L] : [0,0],result:res,score:0,...o});
  const deckOn={decks:{bar:false,rack:true}};
  // a camper with no rack (a rack to fit), and one with panniers on a rack (the deck of a rack fitted)
  const noRack=page({bike:FULL,setup:PACK30});
  const fitted=page({bike:FULL,setup:TENT_IN_PACK+"S.bags=[{uid:1,pos:'rack',pair:true,L:10},{uid:2,pos:'pack',L:20}];S.decks={bar:false,rack:false};"});
  const shapes=[
    [noRack,'one bag',sg('add',[{uid:9,pos:'seat',L:12}],null,{rangeL:[12,14]})],
    [noRack,'two bags',sg('add-two',[{uid:9,pos:'seat',L:12},{uid:10,pos:'bar',L:10}],null)],
    [noRack,'a rack',sg('deck',[],null,{...deckOn,deck:true})],
    [noRack,'a rack with panniers',sg('add',[{uid:9,pos:'rack',pair:true,L:15}],null,deckOn)],
    [noRack,'two bags with a rack to fit',sg('ahead',[{uid:9,pos:'frame',shape:0,L:6},{uid:10,pos:'rack',L:23}],null,deckOn)],
    [noRack,'a rack to fit beside a bag',sg('ahead',[{uid:9,pos:'seat',L:12}],null,{...deckOn,deck:true})],
    [noRack,'a swap to panniers on a rack to fit',sg('swap',[{uid:9,pos:'rack',L:21}],1,{...deckOn,rangeL:[21,23]})],
    [noRack,'a swap set',sg('ahead',[{uid:9,pos:'seat',L:12},{uid:10,pos:'fork',L:3}],1)],
    [fitted,'the deck of a rack fitted',sg('deck',[],null,{...deckOn,deck:true})],
    [fitted,'a bag beside the deck of a rack fitted',sg('ahead',[{uid:9,pos:'seat',L:8}],null,{...deckOn,deck:true})],
  ];
  const bad=t=>[/plus with/i.test(t) && 'plus with',/\b(\w+)\s+\1\b/i.test(t) && 'a doubled word',/,\s*,|,\s*$|^\s*,|,\s*plus\s*,/.test(t) && 'a dangling comma'].filter(Boolean);
  for(const [p,name,s] of shapes){
    p.context.qaS=JSON.stringify(s);
    const input="advisorInput('bags-first','backpack')";
    for(const [kind,text] of [['what',p.json(`advisorWhat(JSON.parse(qaS),${input})`)],['drawn',p.json(`advisorDrawnName(JSON.parse(qaS),${input})`)]]){
      assert.ok(text && text.length>5,`${name} ${kind}: some words`);
      assert.deepEqual(bad(text),[],`${name} ${kind}: ${text}`);
      assert.ok((text.match(/\brack\b/gi)||[]).length<=1,`${name} ${kind}: one rack: ${text}`);
    }
  }
  // the reviewer's case, word for word
  {
    const p=noRack;
    p.context.qaS=JSON.stringify(shapes[4][2]);
    assert.equal(p.json("advisorWhat(JSON.parse(qaS),advisorInput('bags-first','backpack'))"),
      'Frame bag, full triangle, 6 L, plus rack and pannier, 23 L, with the sleeping mat and tent on its top deck');
  }
});

// ---- Task 7: trial bags (decision 7) ----

// Every loadcheck:* value in storage.
const stored=p=>Object.fromEntries([...p.values].filter(([k])=>k.startsWith('loadcheck:')).sort(([a],[b])=>a<b?-1:1));
// An export with its own times set aside (`exported`, the draft's `updatedAt`): what it carries of the plan, the bikes and the setups.
const exported=p=>{const x=JSON.parse(p.run('exportAll()'));delete x.exported;delete x.draft.updatedAt;return JSON.stringify(x);};
// The plan's inputs a trial may touch, and the kept plan, as the draft holds them.
const planState=p=>p.json('({bags:S.bags,decks:S.decks,placements:(currentPlan(),S.placements),nextUid:S.nextUid,pinned:S.pinned,step:S.step})');
const draftWrites=p=>p.writes.filter(k=>k==='loadcheck:draft').length;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// A rider whose plan is saved, as after start-up and a first save: R2 on the gravel bike, a saved setup and a saved bike.
function saved(setup=R2,bike=GRAVEL){
  const p=page({bike,setup:setup+`buildThumb=()=>'';S.step=2;SETUPS=[snapshotSetup('Last summer','')];BIKE_PROFILES=[normaliseBikeProfile(JSON.parse(qaBike))];`});
  p.run(`store.set(SETUP_KEY,SETUPS);store.set(BIKE_PROFILE_KEY,BIKE_PROFILES);flushDraft();`);
  return p;
}
const cards="[...ADVISOR.answer.items,...(ADVISOR.answer.ahead?[ADVISOR.answer.ahead,...ADVISOR.answer.aheadAlts]:[])]";

test('[GA-TRY] Try in Bag planner closes the advisor and shows the plan with the suggestion\'s bags at the packing check, with the line of decision 7, Keep it and Remove it',async()=>{
  const p=saved();
  await ask(p,{style:'bags-first',goal:'handling'});
  const html=view(p).answer;
  const n=p.json(`${cards}.length`);
  assert.ok(n>=2,'some suggestions');
  for(let i=0;i<n;i++)assert.ok(new RegExp(`<button type="button" class="[^"]*adv-try[^"]*" data-try="${i}"[^>]*>Try in Bag planner</button>`).test(html),'a Try button on card '+i);
  const what=p.json(`advisorWhat(${cards}[0],ADVISOR.input)`),bags=p.json(`advisorTrialBags(${cards}[0],ADVISOR.input)`);
  p.run(`startTrial(${cards}[0])`);
  assert.equal(p.json('ADVISOR.open'),false,'the advisor is closed');
  assert.equal(p.json('S.step'),4,'the packing check');
  assert.deepEqual(p.json('S.bags'),bags,'the plan holds the suggestion\'s bags');
  assert.equal(p.context.document.getElementById('trialText').textContent,`Trying: ${what}. Not saved until you keep it`);
  assert.equal(p.context.document.getElementById('trialKeep').textContent,'Keep it');
  assert.equal(p.context.document.getElementById('trialRemove').textContent,'Remove it');
  // while it is on, a suggestion says to keep or remove it first; and an answer from the questionnaire offers no Try
  await ask(p,{style:'panniers',goal:'handling'});
  assert.equal(p.json('ADVISOR.answer.kind'),'suggestions');
  assert.ok(!/data-try=/.test(view(p).answer),'no second trial on top of one');
  assert.ok(textOf(view(p).answer).includes('Keep or remove the bag you are trying first.'));
  p.run('closeAdvisor();removeTrial()');
  await ask(p,{source:'questionnaire',riding:'gravel',carry:'average',style:'bags-first',goal:'handling'});
  assert.equal(p.json('ADVISOR.input.fromQuestionnaire'),true);
  assert.ok(!/data-try=/.test(view(p).answer),'no Try from the questionnaire');
  assert.ok(textOf(view(p).answer).includes('To try a bag in the Bag planner, use your own packing'),'and it says why');
  assert.equal(p.json('startTrial(ADVISOR.answer.items[0])'),false,'nor by hand');
});

test('[GA-KEEP] Keep it makes the trial\'s bags ordinary bags and saves the plan once',async()=>{
  const p=saved();
  await ask(p,{style:'bags-first',goal:'handling'});
  const bags=p.json(`advisorTrialBags(${cards}[0],ADVISOR.input)`);
  p.writes.length=0;
  p.run(`startTrial(${cards}[0])`);
  p.run('queueDraftSave()');await wait(400);
  assert.equal(draftWrites(p),0,'nothing saved during the trial');
  p.run('keepTrial()');
  assert.equal(p.json('TRIAL'),null);
  assert.equal(draftWrites(p),1,'saved once');
  assert.deepEqual(JSON.parse(p.values.get('loadcheck:draft')).bags,bags,'the kept bags are the plan\'s');
  p.run('queueDraftSave()');await wait(400);
  assert.equal(draftWrites(p),1,'and only once');
});

test('[GA-REMOVE] Remove it restores the bags, decks, kept placements and next bag number byte for byte, returns to the step, and saves the other changes made during the trial',async()=>{
  const p=saved(R2+"S.pinned={tent:'1-0'};");
  const before=planState(p);
  await ask(p,{style:'bags-first',goal:'handling'});
  p.run(`startTrial(${cards}[0])`);
  const uid=p.json('TRIAL.uids[0]');
  p.writes.length=0;
  // the rider changes the trip and puts something by hand into the trial bag meanwhile
  p.run(`S.nights=3;applyTripKitDefaults();S.pinned.stove='${uid}-0';queueDraftSave();`);await wait(400);
  assert.equal(draftWrites(p),0,'draft saves wait during the trial');
  p.writes.length=0;
  p.run('removeTrial()');
  const after=planState(p);
  for(const k of ['bags','decks','nextUid','step'])assert.deepEqual(after[k],before[k],k);
  assert.deepEqual(after.pinned,{tent:'1-0'},'the hand placement into the trial bag goes with it; the rider\'s own stays');
  assert.equal(p.json('TRIAL'),null);
  assert.equal(draftWrites(p),1,'the other changes are saved, once');
  const draft=JSON.parse(p.values.get('loadcheck:draft'));
  assert.equal(draft.trip.nights,3,'with the new nights');
  assert.deepEqual(draft.bags,before.bags,'and the bags of before');
  // with no other change, the kept plan comes back byte for byte
  const q=saved();const was=planState(q);
  await ask(q,{style:'bags-first',goal:'handling'});
  q.run(`startTrial(${cards}[0]);removeTrial()`);
  assert.deepEqual(planState(q),was,'byte for byte');
});

test('[GA-TRIAL-NO-TRACE] Try then Remove, Try then reload, Try then closing or hiding the tab: the draft, the bikes, the setups, the summary and every loadcheck:* key are as before; an export too',async()=>{
  for(const leave of ['remove','reload','close']){
    const p=saved();
    const keys=stored(p),out=exported(p),plan=planState(p);
    await ask(p,{style:'panniers',goal:'handling'});
    const n=p.json(`${cards}.length`);
    for(let i=0;i<n;i++){
      p.run(`startTrial(${cards}[${i}])`);
      assert.notDeepEqual(p.json('S.bags'),plan.bags,'a trial changes the plan');
      assert.equal(exported(p),out,leave+': an export during a trial carries no trial bag');
      if(leave!=='remove'){
        // the tab is hidden or closed (pagehide flushes the draft), then the page is opened again from storage
        p.run('flushDraft()');
        assert.deepEqual(stored(p),keys,leave+' '+i+': storage as before');
        if(leave==='reload'){
          // on a copy of the storage, as the reopened page finds it (its own start-up writes stay out of the comparison)
          const q=page({storage:{values:new Map(p.values),vms:new Set()},bike:GRAVEL});
          q.run('restorePlan(JSON.parse(window.localStorage.getItem(DRAFT_KEY)),true)');
          assert.deepEqual(planState(q),plan,'the reopened plan is the one of before');
        }
      }
      p.run('removeTrial()');
      await wait(350);
      assert.deepEqual(stored(p),keys,leave+' '+i+': every loadcheck:* key as before');
      assert.equal(exported(p),out,leave+' '+i+': the export as before');
      assert.deepEqual(planState(p),plan,leave+' '+i+': the plan as before');
      if(i<n-1)await ask(p,{style:'panniers',goal:'handling'});
    }
  }
});

test('[GA-TRIAL-NO-TRACE] during a trial Save setup and Export wait with the trial\'s line; a hidden tab saves the rider\'s other changes without the trial bag',async()=>{
  const p=saved();
  await ask(p,{style:'bags-first',goal:'handling'});
  const what=p.json(`advisorWhat(${cards}[0],ADVISOR.input)`),bags=p.json('S.bags'),setups=p.values.get('loadcheck:setups');
  p.run(`startTrial(${cards}[0])`);
  const line=`Trying: ${what}. Not saved until you keep it`;
  assert.equal(await p.run("saveSetup('With the trial','')"),false,'Save setup waits');
  assert.equal(p.values.get('loadcheck:setups'),setups,'no setup saved');
  assert.equal(p.json('SETUPS.length'),1);
  assert.equal(p.json('SAVE_MESSAGE'),line,'with the line');
  assert.equal(await p.run("saveSetup('','')"),false,'Save this plan too');
  assert.equal(p.json('exportPlanFile()'),false,'Export waits');
  assert.equal(p.context.document.getElementById('impMsg').textContent,line,'with the line');
  p.run('S.nights=4;applyTripKitDefaults();queueDraftSave();');
  p.writes.length=0;
  p.run('flushDraft()');
  assert.equal(draftWrites(p),1,'a hidden tab saves the other change');
  const draft=JSON.parse(p.values.get('loadcheck:draft'));
  assert.equal(draft.trip.nights,4);
  assert.deepEqual(draft.bags,bags,'without the trial bag');
  p.run('keepTrial()');
  assert.equal(await p.run("saveSetup('Kept','')"),true,'once kept, Save setup saves');
});

test('[GA-TRIAL-NO-TRACE] a plan another tab saved during a trial is taken: the trial ends, the other tab\'s plan stays as it saved it',async()=>{
  const store=sharedStore();
  const p=page({storage:store,bike:GRAVEL,setup:R2});p.run('flushDraft()');
  const q=page({storage:store,bike:GRAVEL,setup:R2});
  q.run('DRAFT_VERSION=JSON.parse(window.localStorage.getItem(DRAFT_KEY)).updatedAt;DRAFT_SIGNATURE=JSON.stringify(captureDraft());DRAFT_SAVE_STATUS={state:"saved",kind:"browser",serial:DRAFT_SIGNATURE};');
  await ask(p,{style:'bags-first',goal:'handling'});
  p.run(`startTrial(${cards}[0])`);
  q.run('S.nights=5;applyTripKitDefaults();flushDraft();');
  const theirs=p.values.get('loadcheck:draft');
  assert.equal(p.json('TRIAL'),null,'the trial ends');
  assert.equal(p.json('S.nights'),5,'the other tab\'s plan is taken');
  assert.ok(!p.json('S.bags').some(b=>b.uid>=6),'no trial bag');
  p.run('flushDraft()');
  assert.equal(p.values.get('loadcheck:draft'),theirs,'and stays as that tab saved it');
});

// The heart of decision 7 over 200 generated riders (GA-TRY-SAME) is tests/unit/tools/advisor-trial.test.ts: its real searches take
// about a minute and a half, and this suite runs inside LC-QA-ALL's time.

// ---- Task 8: from the Bag planner ----

test('[GA-LINK-PLANNER] the bags step ends with "Not happy with your bags? Ask the Gear advisor", which opens the advisor on the current plan',async()=>{
  const p=page({setup:R2,bike:GRAVEL});
  const html=p.html;
  const s2=html.slice(html.indexOf('<section id="s2"'),html.indexOf('<!-- STEP 3 -->'));
  const link=/<p class="adv-ask"[^>]*>Not happy with your bags\? <button type="button" class="linky" id="advisorAsk" aria-haspopup="dialog" aria-controls="advisorBox">Ask the Gear advisor<\/button><\/p>/;
  assert.ok(link.test(s2),'the line and its button, in the bags step');
  // its end: after the bag list and its buttons, before only the feedback slot and the step's way on
  const rest=s2.slice(s2.search(link)).replace(link,'');
  assert.ok(!/id="(bagList|addBag|addBottle|quickPick)"/.test(rest),'nothing of the bags comes after it');
  assert.ok(/<div class="nav">/.test(rest),'the way on follows');
  // a tap opens the advisor on the plan as it stands, even when the questionnaire was used last time
  p.run(`initialiseAdvisor();ADVISOR.source='questionnaire';`);
  p.run(`document.getElementById('advisorAsk').onclick()`);
  await p.run('ADVISOR_DONE');
  assert.equal(p.json('ADVISOR.open'),true,'the advisor is open');
  assert.equal(p.json('ADVISOR.source'),'plan','on the current plan');
  assert.ok(textOf(view(p).steps).includes('Using your packing: '),'the plan\'s packing');
});

(async()=>{
  // GA_ONLY=<text> runs only the tests whose name holds it (for watching one fail)
  for(const [name,fn] of tests){if(process.env.GA_ONLY && !name.includes(process.env.GA_ONLY))continue;await fn();passed++;console.log('ok',name);}
  console.log(`${passed} advisor tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
