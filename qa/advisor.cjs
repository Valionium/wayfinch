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

test('[GA-TRIAL-FN] gains are measured against a fresh re-plan of the plan: a trip cut from 3 nights to 0 after the plan was kept never credits the re-plan\'s gain to a suggested bag (review of PR 60, I1)',async()=>{
  const p=page({setup:"S.bags=[{uid:1,pos:'frame',shape:0,L:6},{uid:2,pos:'bar',L:12},{uid:3,pos:'seat',L:14},{uid:4,pos:'top',slot:'front',L:1}];S.nextUid=5;"
    +"S.nights=3;S.sleep='camp';applyTripKitDefaults();currentPlan();S.nights=0;applyTripKitDefaults();"});
  const W=p.json('window.WayfinchAdvisor.WEIGHTS');
  const score=r=>Math.round(Object.entries(r.kgByPos).reduce((n,[pos,kg])=>n+kg*W[pos],0)*100)/100;
  const kept=p.json('advisorResult(currentPlan())'),fresh=p.json('planWith({placements:null},advisorResult)');
  assert.ok(score(kept)-score(fresh)>=0.5,'this plan drifted: a re-plan alone gains 0.5 or more');
  p.run('openAdvisor()');p.run("setAdvisor('style','either');setAdvisor('goal','handling')");await p.run('ADVISOR_DONE');
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
  for(const v of ['rack','no-rack','either'])assert.ok(html.includes(`name="advStyle" value="${v}"`),v);
  for(const v of ['handling','backpack'])assert.ok(html.includes(`name="advGoal" value="${v}"`),v);
  // one or two steps chosen: no search, and the answer says what is missing
  await ask(p,{style:'no-rack'});
  assert.equal(p.json('ADVISOR.answer'),null,'no answer with the goal missing');
  assert.ok(/Choose/.test(textOf(view(p).answer)));
  p.run("setAdvisor('style',null)");await ask(p,{goal:'handling'});
  assert.equal(p.json('ADVISOR.answer'),null,'no answer with the style missing');
  await ask(p,{style:'no-rack',goal:'handling'});
  assert.ok(p.json('ADVISOR.answer.kind'),'all three: an answer');
});

test('[GA-STEPS] with no rack mounts the rack choice is disabled and a line says why; Not sure and Yes leave it open',()=>{
  const p=page({setup:R2,bike:GRAVEL});
  p.run('openAdvisor()');
  const html=view(p).steps;
  assert.ok(/name="advStyle" value="rack"[^>]*disabled/.test(html),'disabled');
  assert.ok(textOf(html).includes("Your bike has no rack mounts, so panniers aren't offered."));
  for(const bike of [FULL,BARE]){
    const q=page({setup:R2,bike});q.run('openAdvisor()');
    assert.ok(!/name="advStyle" value="rack"[^>]*disabled/.test(view(q).steps),bike.id+': open');
    assert.ok(!textOf(view(q).steps).includes('no rack mounts'),bike.id+': no line');
  }
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
  for(const [riding,style] of [['touring','rack'],['road','no-rack'],['gravel','no-rack'],['mtb','no-rack'],['everyday','either']]){
    p.run(`ADVISOR.style=null;ADVISOR.styleTouched=false;setAdvisor('riding','${riding}')`);
    assert.equal(p.json('ADVISOR.style'),style,riding+' pre-selects '+style);
  }
  p.run("setAdvisor('style','either');setAdvisor('riding','road')");
  assert.equal(p.json('ADVISOR.style'),'either','a style the rider chose stays');
  const q=a=>p.json(`(()=>{const q=advisorQuestionnaire(${JSON.stringify(a)});return {...q,base:{...q.base,kit:undefined},kitSame:JSON.stringify(q.base.kit)===JSON.stringify(tripKitDefaults(${a.nights},'${a.sleep}',S.bikeProfile))};})()`);
  const light=q({riding:'mtb',nights:1,sleep:'camp',carry:'light'});
  assert.deepEqual(light.bags,[{uid:1,pos:'pack',L:15}],'a 15 L backpack');
  assert.equal(light.nextUid,2);
  assert.equal(light.noPanniers,true,'mountain bike trails: no panniers');
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
  assert.deepEqual([avg.base.nights,avg.base.sleep,avg.base.mode,avg.noPanniers],[4,'indoor','comfort',false]);
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
  await ask(p,{style:'no-rack',goal:'handling'});
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
    assert.ok(!/pannier|rack/i.test(what),'no rack under Without a rack');
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
    assert.equal(names[i],p.run('htmlEsc')(`Your bike with ${what.replace(/^./,c=>c.toLowerCase())}`),'drawing '+(i+1)+' named by its bag');
  });
  assert.equal(new Set(names).size,names.length,'no two drawings share a name');
});

test('[GA-SCREEN] the answer is not a live region: one short status line says what changed, so a screen reader does not read every card again (review of PR 60, m3)',async()=>{
  assert.ok(!/id="advisorAnswer"[^>]*aria-live/.test(page().html.slice(page().html.indexOf('id="advisorBox"'))),'#advisorAnswer is not aria-live');
  const p=page({setup:R2,bike:GRAVEL});
  const status=()=>p.context.document.getElementById('advisorStatus').textContent;
  p.run('openAdvisor()');
  assert.equal(status(),'Choose all three steps to see what to get.');
  await ask(p,{style:'no-rack',goal:'handling'});
  const n=p.json('ADVISOR.answer.items.length');
  assert.equal(status(),`${n} suggestions, best first.`);
  const say=a=>{p.run(`ADVISOR.answer=${JSON.stringify(a)};renderAdvisorAnswer()`);return status();};
  const common={tried:40,frameReason:null,partial:false};
  assert.equal(say({kind:'already-good',...common}),'Your bags already suit this; nothing to add.');
  assert.equal(say({kind:'nothing-helps',closest:null,...common}),'Nothing helps within this style.');
  assert.equal(say({kind:'cannot-reduce',backL:3,...common}),'No bag takes more off your back.');
  assert.equal(say({kind:'already-good',...common,partial:true}),'Your bags already suit this; nothing to add. This search stopped early.');
});

test('[GA-ANSWER] a bike whose rack mounts are Not sure (no field, as sub-project 11 stores it): every pannier shown says "if your bike has rack mounts"',async()=>{
  const p=page({bike:BARE,setup:"S.bags=[{uid:1,pos:'pack',L:15}];S.nextUid=2;S.nights=0;applyTripKitDefaults();"});
  assert.equal(p.json("advisorInput('either','backpack').rackMounts"),null,'no field');
  await ask(p,{style:'either',goal:'backpack'});
  const a=p.json('ADVISOR.answer');
  const racks=a.items.filter(s=>s.add.some(b=>b.pos==='rack'));
  assert.ok(racks.length>0,'panniers are among the suggestions');
  for(const s of racks)assert.ok(s.tags.includes('if your bike has rack mounts'));
  assert.ok(textOf(view(p).answer).includes('if your bike has rack mounts'),'and the tag is on screen');
});

test('[GA-ANSWER] the words of each answer: a swap, a pair, already good, cannot reduce, nothing helps with what stays over, a search cut short',()=>{
  const p=page({setup:R2});
  const input="advisorInput('either','handling')";
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
  const none=say({kind:'nothing-helps',closest:{...sugg('add',[{uid:9,pos:'seat',L:16}],null),rangeL:[16,16],result:{overL:2.4,spillIds:['tent','stove'],backL:0,backKg:0,outOfReach:0,kgByPos:{},items:{}}},...common});
  assert.ok(none.includes('Nothing helps'),'says so plainly');
  assert.ok(/Closest: Seat pack, 16 L/.test(none),'the closest option');
  assert.ok(none.includes('2.4 L') && none.includes('Tent') && none.includes('Stove and gas'),'what would still be left over');
  assert.ok(say({kind:'already-good',...common,partial:true}).includes('This search stopped early'),'a search cut short says so');
  assert.ok(say({kind:'already-good',...common,frameReason:p.run('NO_MOUNT')}).includes("Frame bags aren't offered. No mount on this bike."),'the planner\'s own reason');
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
// The answer as the fixture holds it: its kind, and each suggestion's kind, what to get (type and size range) and tags.
const summary=p=>p.json(`(()=>{const a=ADVISOR.answer,i=ADVISOR.input,one=s=>({kind:s.kind,what:advisorWhat(s,i),tags:s.tags});
  return {kind:a.kind,partial:a.partial,...(a.kind==='suggestions' ? {items:a.items.map(one)} : {}),
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

test('[GA-STYLE-PAGE] R4 and every rider under Without a rack get no pannier and no rack deck; R4\'s step 1 shows the no-mounts line',async()=>{
  const r4=RIDERS.find(r=>r.id==='R4');
  for(const [r,style] of [[r4,r4.style],...RIDERS.map(r=>[r,'no-rack'])]){
    const p=await rider(r,style);
    const a=p.json('ADVISOR.answer');
    const shown=a.kind==='suggestions' ? a.items : a.kind==='nothing-helps' && a.closest ? [a.closest] : [];
    for(const s of shown){
      assert.ok(!s.add.some(b=>b.pos==='rack'),`${r.id} ${style}: no pannier`);
      assert.equal(s.decks.rack,false,`${r.id} ${style}: no rack deck`);
      assert.ok(!/pannier/i.test(p.json(`advisorWhat(${JSON.stringify(s)},ADVISOR.input)`)),`${r.id} ${style}: none on screen`);
    }
    const text=textOf(p.context.document.getElementById('advisorAnswer').innerHTML);
    // the lines saying why are the only place panniers are named
    const why=["Without a rack, your panniers and rack deck are left out of these suggestions.","On mountain bike trails, panniers aren't offered."];
    assert.ok(!/\bpanniers?\b/i.test(why.reduce((t,w)=>t.replace(w,''),text)),`${r.id} ${style}: no pannier in the answer's words`);
    if(r===r4 && style==='either')assert.ok(text.includes(why[1]),'R4 under Either: the trails line says why');
    // the tourer's own panniers and rack deck leave the plan under Without a rack (review of PR 57, R1), and the answer says so
    if(r.id==='R3' && style==='no-rack')assert.ok(text.includes(why[0]),'R3 without a rack: the line says its rack kit is left out');
    if(r===r4)assert.ok(textOf(p.context.document.getElementById('advisorSteps').innerHTML).includes("Your bike has no rack mounts, so panniers aren't offered."),'R4: the line');
  }
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} advisor tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
