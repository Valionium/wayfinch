// The bag planner's automatic balancing (the owner's decision of 8 Nov 2026, weight map design §7): at the packing step, on top of the
// planner's own packing (the frozen rules, unchanged), advisor.js's balancing in the rider's own bags, applied only when it is clearly
// better, with one line and Undo, and stored as kept placements. Source-level: the page's functions in the QA VM, nothing printed of it.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');

let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

const q=appVM();
const {run}=q;
const json=code=>JSON.parse(run(`JSON.stringify(${code})`));
run('DRAFT_READY=true');
// the kit as the page starts it (a test below takes a thing out; the tests added after it start from this kit again)
const KIT0=JSON.stringify(json('S.kit')),NIGHTS0=json('S.nights');
const fresh=(more='')=>`S.kit=${KIT0};S.nights=${NIGHTS0};${more}`;
const bike={id:'qa_bal',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'}},look:{bars:'drop'},frontTyre:'47-584',rearTyre:'47-584'};
// A plan at the packing step: these bags and decks, the kit as the page starts it, nothing kept yet.
const plan=(bags,decks={},extra='')=>run(`(()=>{S.bikeProfile=normaliseBikeProfile(${JSON.stringify(bike)});S.bags=${JSON.stringify(bags)}.map(b=>({...b}));
  S.nextUid=1+Math.max(0,...S.bags.map(b=>b.uid));S.decks={bar:false,rack:false,...${JSON.stringify(decks)}};S.pinned={};S.packed={};S.placements=null;
  BALANCE.checked=null;BALANCE.last=null;BALANCE.reverted=null;BALANCE.undone=new Set();BALANCE.pins=null;TRIAL=null;
  S.step=4;${extra};currentPlan();return true;})()`);
const SETS={
  bikepacking:[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:13},{uid:3,pos:'frame',L:4.5},{uid:4,pos:'top',L:1,slot:'front'},{uid:5,pos:'fork',L:3,pair:true}],
  'full bags and a backpack':[{uid:1,pos:'seat',L:9},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6},{uid:4,pos:'pack',L:30}],
  'seat, frame and bar':[{uid:1,pos:'seat',L:14},{uid:2,pos:'frame',L:4.5},{uid:3,pos:'bar',L:13}],
  touring:[{uid:1,pos:'rack',L:20,pair:true},{uid:2,pos:'bar',L:9},{uid:3,pos:'bottle',slot:'dt',L:0.75},{uid:4,pos:'pack',L:12}],
  'a backpack alone':[{uid:1,pos:'pack',L:30}],
};
// What a packing gives, as the advisor reads it, and its handling score.
const READ=`(()=>{const r=advisorResult(currentPlan()),W=window.WayfinchAdvisor.WEIGHTS;
  return {r,score:Math.round(Object.entries(r.kgByPos).reduce((t,[p,k])=>t+(k||0)*W[p],0)*100)/100,items:currentPlan().items};})()`;
const state=()=>json(`JSON.stringify([S.bags,S.pinned,S.kit,S.decks,S.qty,S.mode])`);

test('[BAL-AUTO] at the packing step the plan is balanced in the rider\'s own bags when that lowers the score by MIN_GAIN_SCORE or more; the bags, kit and hand placements stay, and the frozen packing is the same',()=>{
  let applied=0;
  for(const [name,bags] of Object.entries(SETS)){
    plan(bags,{rack:bags.some(b=>b.pos==='rack')});
    const before=json(READ),inputs=state(),fresh=json('allocate()');
    // what the search finds from the planner's own packing, read the advisor's way, with its wider look (the owner's choice of 9 Nov 2026)
    const found=json(`(()=>{const s=idealTrial(S.bags,{},S.placements);const o=window.WayfinchAdvisor.autoBalance(s,(p,f)=>idealTrial(S.bags,p,f.state),balanceOptions(s));return {apply:o.apply,gain:o.gain,moves:o.balanced.moves};})()`);
    const did=json('autoBalancePlan()');
    const after=json(READ);
    assert.equal(did,found.apply,`${name}: applied exactly when the search says it is clearly better (${found.gain} points)`);
    assert.equal(state(),inputs,`${name}: bags, kit, decks and hand placements as they were`);
    assert.deepEqual(json('allocate()'),fresh,`${name}: the planner's own fresh packing (the frozen rules) is the same`);
    if(did){
      applied++;
      assert.ok(before.score-after.score>=json('window.WayfinchAdvisor.MIN_GAIN_SCORE')-1e-9,`${name}: ${before.score} to ${after.score}, clearly better`);
      assert.ok(found.moves.length>0);
      for(const m of found.moves)assert.equal(after.items[m.id][0][0],m.to,`${name}: ${m.id} now in ${m.to}`);
    } else assert.deepEqual(after.items,before.items,`${name}: nothing moves when it is not clearly better`);
    // a second look at the same plan does nothing more
    assert.equal(json('autoBalancePlan()'),false,`${name}: balanced once`);
  }
  assert.ok(applied>=2,`the balancing applies on real plans (${applied})`);
  assert.equal(json('window.WayfinchAdvisor.MIN_GAIN_SCORE'),0.5,"the advisor's threshold");
});

test('[BAL-AUTO] never before the packing step, never during a trial of the Gear advisor, never on a draft another tab froze',()=>{
  const bags=SETS.bikepacking;
  for(const [why,extra] of [['the kit step','S.step=3'],['a trial','TRIAL={before:{},uids:[]}'],['a frozen draft','DRAFT_FROZEN=true']]){
    plan(bags,{},extra);
    const before=json('S.placements');
    assert.equal(json('autoBalancePlan()'),false,why);
    assert.deepEqual(json('S.placements'),before,`${why}: the plan is as it was`);
    run('TRIAL=null;DRAFT_FROZEN=false');
  }
  // the same plan at the packing step is balanced
  plan(bags);
  assert.equal(json('autoBalancePlan()'),true);
});

test('[BAL-KEEPS] it keeps hand placements, must-reach things within reach and things ticked as packed where they are, everything fitting, nothing more on the back and nothing more out of reach',()=>{
  for(const [name,bags] of Object.entries(SETS)){
    plan(bags,{rack:bags.some(b=>b.pos==='rack')});
    const own=json(READ);
    // the first thing the balancing would move is placed there by hand; the next ticked as packed
    const moves=json(`(()=>{const s=idealTrial(S.bags,{},S.placements);return window.WayfinchAdvisor.balance(s,(p,f)=>idealTrial(S.bags,p,f.state),{fixed:balanceFixed(s)}).moves;})()`);
    const pin=moves[0],tick=moves.find(m=>pin&&m.id!==pin.id);
    plan(bags,{rack:bags.some(b=>b.pos==='rack')},
      (pin?`S.pinned=${JSON.stringify({[pin.id]:pin.from})};`:'')+(tick?`S.packed=${JSON.stringify({[tick.id]:true})};`:''));
    const start=json(READ);
    const reach=json(`currentPlan().slots.flatMap(s=>s.items.filter(k=>!k.part&&isMustReach(k)&&reachableFor(k,s.pos)).map(k=>[k.id,s.key]))`);
    json('autoBalancePlan()');
    const after=json(READ);
    if(pin)assert.equal(after.items[pin.id][0][0],pin.from,`${name}: the hand placement stays`);
    if(tick)assert.equal(after.items[tick.id][0][0],tick.from,`${name}: a thing ticked as packed stays`);
    for(const [id,key] of reach)assert.ok(after.items[id].some(e=>e[0]===key),`${name}: ${id}, needed while riding, stays within reach where it was`);
    assert.ok(after.r.overL<=start.r.overL+0.005,`${name}: nothing more left over`);
    assert.ok(after.r.spillIds.every(id=>start.r.spillIds.includes(id)),`${name}: nothing newly left over`);
    assert.ok(after.r.backL<=start.r.backL+0.005,`${name}: nothing more on the back`);
    assert.ok(after.r.outOfReach<=start.r.outOfReach,`${name}: nothing more out of reach`);
    assert.ok(own.score>=after.score-1e-9);
  }
});

test("[BAL-STORED] the balance is stored as kept placements: the plan read again, the draft and a reload give the same packing and nothing more moves; a plan loaded in the planner's own packing is balanced at its first look",()=>{
  plan(SETS.bikepacking);
  const own=json('S.placements');
  assert.equal(json('autoBalancePlan()'),true);
  const items=json('currentPlan().items'),placements=json('S.placements');
  assert.deepEqual(json('BALANCE.last.balanced.items'),items,'the plan read again is the balance');
  const draft=json('capturePlan()');
  assert.deepEqual(draft.placements,placements,'the draft carries the balanced placements');
  // another page: the draft's placements loaded, the same packing, no balancing of its own
  const other=appVM({storage:q.store});
  other.run('DRAFT_READY=true');
  const ojson=code=>JSON.parse(other.run(`JSON.stringify(${code})`));
  other.run(`S.bikeProfile=normaliseBikeProfile(${JSON.stringify(bike)});S.bags=${JSON.stringify(SETS.bikepacking)};S.nextUid=6;S.kit=${JSON.stringify(json('S.kit'))};S.qty=${JSON.stringify(json('S.qty'))};S.step=4;keepPlan({load:${JSON.stringify(placements)}})`);
  assert.deepEqual(ojson('currentPlan().items'),items,'a reload packs the same');
  assert.equal(ojson('autoBalancePlan()'),false,'a balanced plan loaded: nothing more to move');
  assert.equal(ojson('balanceLine()'),'','and no line');
  // the planner's own packing loaded (a plan from before, or one put back with Undo in another visit): balanced, with its line and Undo
  other.run(`keepPlan({load:${JSON.stringify(own)}});BALANCE.checked=null`);
  assert.equal(ojson('autoBalancePlan()'),true);
  assert.deepEqual(ojson('currentPlan().items'),items,'the same balance');
  assert.match(ojson('balanceLine()'),/Packed for better balance/);
});

test('[BAL-LINE] one quiet line names the moves with Undo; Undo restores the packing before the balance, says so, and the things put back are not moved again',()=>{
  plan(SETS.bikepacking);
  const own=json('currentPlan().items'),ownPlacements=json('S.placements');
  assert.equal(json('autoBalancePlan()'),true);
  const moves=json('BALANCE.last.moves');
  const line=json('balanceLine()');
  assert.match(line,/^<div class="balance-line" role="status"><span>Packed for better balance: [^<]+ ·<\/span> <button class="linky" type="button" data-balance-undo="1">Undo<\/button><\/div>$/);
  const named=json(`BALANCE.last.moves.map(m=>kitById(m.id).name.replace(/^[A-Z](?![A-Z])/,c=>c.toLowerCase()))`);
  if(moves.length<=3)for(const n of named)assert.ok(line.includes(n),`the line names ${n}`);
  else assert.match(line,/\d+ more things/);
  // the moves that do the most come first; with more than three, the first two and how many more
  const shown=moves.length>3?2:moves.length;
  assert.ok(json(`BALANCE.last.moves.slice(0,${shown}).every(m=>${JSON.stringify(line)}.includes(kitById(m.id).name.replace(/^[A-Z](?![A-Z])/,c=>c.toLowerCase())+' to the '+unitLabel(currentPlan().slots.find(s=>s.key===m.to)).toLowerCase()))`),'and where each goes');
  if(moves.length>3)assert.ok(line.includes(`and ${moves.length-2} more things`));
  // Undo
  json('undoBalance()');
  assert.deepEqual(json('currentPlan().items'),own,"Undo: the planner's own packing");
  assert.deepEqual(json('S.placements.items'),ownPlacements.items);
  assert.equal(json('balanceLine()'),'<div class="balance-line" role="status"><span>Back to the packing before this balance.</span></div>');
  assert.equal(json('autoBalancePlan()'),false,'not balanced again at once');
  // a later change: the things put back stay where the planner put them
  const drop=json(`Object.keys(currentPlan().items).find(id=>!${JSON.stringify(moves.map(m=>m.id))}.includes(id)&&S.kit[id])`);
  run(`S.kit[${JSON.stringify(drop)}]=false;currentPlan()`);
  assert.notDeepEqual(json('currentPlan().items'),own,'the plan changed');
  json('autoBalancePlan()');
  const now=json('currentPlan().items');
  for(const m of moves)if(now[m.id])assert.deepEqual(now[m.id].map(e=>e[0]),[m.from],`${m.id} stays where the planner put it after Undo`);
  assert.equal(json('balanceLine()').includes('Back to'),false,'the Undo line goes with the next change');
});

test('[BAL-LINE] a change made by hand (a move, a forgotten placement) is not balanced in the same step; the note of a fresh placement stays beside the line',()=>{
  plan(SETS.bikepacking);
  const moves=json(`(()=>{const s=idealTrial(S.bags,{},S.placements);return window.WayfinchAdvisor.balance(s,(p,f)=>idealTrial(S.bags,p,f.state),{fixed:balanceFixed(s)}).moves;})()`);
  json('autoBalancePlan()');
  // the rider moves one thing by hand: that step is the rider's own
  const m=moves[0];
  run(`S.pinned[${JSON.stringify(m.id)}]=${JSON.stringify(m.from)};currentPlan()`);
  const handStep=json('S.placements');
  assert.equal(json('autoBalancePlan()'),false,'the hand move is not followed by a balance');
  assert.deepEqual(json('S.placements'),handStep);
  // bags changed: the kit is placed afresh, the balance applies, and the note saying why stays with the line
  run('S.bags=S.bags.filter(b=>b.pos!=="fork");S.pinned={};currentPlan()');
  assert.equal(json('currentPlan().notes.replan&&currentPlan().notes.replan.reason'),'bags');
  if(json('autoBalancePlan()'))assert.equal(json('currentPlan().notes.replan.reason'),'bags','the "placed afresh" note is kept');
});

// Review of PR 79, I1: a thing the rider ticked as packed where the balance put it is never moved back by Undo.
test('[BAL-KEEPS] Undo never moves a thing ticked as packed: while a thing the balance moved is ticked, the line keeps the balance without Undo and says why; unticked, Undo is back',()=>{
  for(const name of ['bikepacking','full bags and a backpack','touring']){
    const bags=SETS[name];
    plan(bags,{rack:bags.some(b=>b.pos==='rack')},fresh());
    const own=json('currentPlan().items');
    assert.equal(json('autoBalancePlan()'),true,name);
    const m=json('BALANCE.last.moves[0]'),balanced=json('currentPlan().items');
    // the rider packs it where the balance put it and ticks it (a tick is a screen key: the plan and the line stay)
    run(`S.packed[${JSON.stringify(m.id)}]=true;currentPlan()`);
    assert.equal(json('BALANCE.last.placements===S.placements'),true,`${name}: the plan is the balanced one`);
    const line=json('balanceLine()');
    assert.doesNotMatch(line,/data-balance-undo/,`${name}: no Undo while a moved thing is ticked`);
    assert.match(line,/^<div class="balance-line" role="status"><span>Packed for better balance: [^<]+\. You have started packing it this way, so it stays\.<\/span><\/div>$/,`${name}: the line says why`);
    assert.equal(json('undoBalance()'),false,`${name}: Undo does nothing`);
    assert.deepEqual(json('currentPlan().items'),balanced,`${name}: nothing moved`);
    assert.equal(json(`currentPlan().items[${JSON.stringify(m.id)}][0][0]`),m.to,`${name}: ${m.id} stays where it is packed`);
    assert.equal(json(`S.packed[${JSON.stringify(m.id)}]`),true);
    // unticked: Undo is offered again and brings the packing before back
    run(`delete S.packed[${JSON.stringify(m.id)}];currentPlan()`);
    assert.match(json('balanceLine()'),/data-balance-undo="1">Undo</,`${name}: Undo is back`);
    assert.equal(json('undoBalance()'),true);
    assert.deepEqual(json('currentPlan().items'),own,`${name}: the packing before the balance`);
  }
});

// Review of PR 79, m1: after an earlier balance, the packing before this one still carries the earlier moves; the line says what it is.
test('[BAL-LINE] Undo after a second balance says it goes back to the packing before this balance, and brings exactly that back',()=>{
  plan(SETS['full bags and a backpack'],{},fresh('S.nights=2'));
  assert.equal(json('autoBalancePlan()'),true,'a first balance');
  run('S.kit.quilt=false;currentPlan()');
  const before=json('currentPlan().items');
  assert.equal(json('autoBalancePlan()'),true,'a second balance after the quilt is taken out');
  assert.notDeepEqual(json('currentPlan().items'),before);
  assert.equal(json('undoBalance()'),true);
  assert.deepEqual(json('currentPlan().items'),before,'the packing just before this balance');
  assert.equal(json('balanceLine()'),'<div class="balance-line" role="status"><span>Back to the packing before this balance.</span></div>');
});

// Review of PR 79, m2
test('[BAL-LINE] the line keeps a name\'s capitals ("ID, cards, insurance") and a thing the rider added as typed; only a kit name\'s first letter is lowered',()=>{
  plan(SETS.bikepacking,{},fresh());
  run("KIT.push({id:'x_kindle',name:'Kindle',cat:'Person',L:0.3,kg:0.2,rigid:0,pref:prefFor('Person',0.3),qtyable:true,added:true,comfort:false,on:false});currentPlan()");
  try{
    const keys=json("(()=>{const A=currentPlan(),k=p=>A.slots.find(s=>s.pos===p).key;return {frame:k('frame'),bar:k('bar'),seat:k('seat')};})()");
    run(`BALANCE.last={placements:S.placements,moves:[{id:'docs',from:'${keys.seat}',to:'${keys.frame}'},{id:'x_kindle',from:'${keys.seat}',to:'${keys.bar}'},{id:'lock',from:'${keys.bar}',to:'${keys.frame}'}]};BALANCE.reverted=null`);
    const line=json('balanceLine()');
    assert.ok(line.includes('Packed for better balance: ID, cards, insurance to the frame bag, Kindle to the handlebar roll and bike lock to the frame bag ·'),line);
  }finally{run("KIT.splice(KIT.findIndex(k=>k.id==='x_kindle'),1);BALANCE.last=null;currentPlan()");}
});

// Review of PR 79, m3: the balancing's memory belongs to one plan.
test('[BAL-STORED] a plan loaded after another and a plan started again are looked at afresh: balanced at their first look, with the line, and what Undo put back in the other plan is not held there',()=>{
  // plan B has a hand placement; plan A, open before it, none, and the rider put A's balance back with Undo
  plan(SETS.bikepacking,{},fresh("S.pinned={pot:'5-1'}"));
  const other=json('capturePlan()');
  plan(SETS.bikepacking,{},fresh());
  assert.equal(json('autoBalancePlan()'),true);
  assert.equal(json('undoBalance()'),true);
  run(`restorePlan(${JSON.stringify(other)},false)`);
  assert.equal(json('S.step'),4);
  assert.equal(json('BALANCE.undone.size'),0,'nothing of plan A is held');
  assert.equal(json('autoBalancePlan()'),true,'the loaded plan is balanced at its first look');
  assert.match(json('balanceLine()'),/Packed for better balance/);
  assert.equal(json('currentPlan().items.pot[0][0]'),'5-1','its hand placement stays');
  // Start again clears the hand placements: a fresh plan, not a step made by hand
  plan(SETS.bikepacking,{},fresh("S.pinned={pot:'5-1'}"));
  assert.equal(json('autoBalancePlan()'),true);
  run('startAgain();currentPlan()');
  assert.equal(json('autoBalancePlan()'),true,'Start again is balanced at its first look');
  assert.equal(json('currentPlan().notes.replan&&currentPlan().notes.replan.reason'),'startAgain','its note stays beside the line');
  assert.match(json('balanceLine()'),/Packed for better balance/);
});

// The owner's choice of 9 Nov 2026 ("Yes, wider balancing"): the balancing also tries the moves the weight map's wider look found (a thing
// moved the heavier way, so the re-pack puts heavier things where it was), so the planner reaches the best balance by itself.
test('[BAL-AUTO] the wider look: the balancing tries every single placement of one thing either way once no usual move or swap helps, and so balances plans the usual search left as they were',()=>{
  const plans={...SETS,'seat, frame and bar':[{uid:1,pos:'seat',L:14},{uid:2,pos:'frame',L:4.5},{uid:3,pos:'bar',L:13}],
    'seat, bar and frame 6':[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6}],
    'the frame bag and two fork cages':[{uid:1,pos:'frame',L:4.5},{uid:2,pos:'fork',L:5,pair:true}]};
  plan(SETS.bikepacking);
  const opts=json('(()=>{const s=idealTrial(S.bags,{},S.placements);const o=balanceOptions(s);return {wide:o.wide,max:o.maxTrials,extra:Array.isArray(o.extra)};})()');
  assert.deepEqual(opts,{wide:true,max:json('BALANCE_TRIALS'),extra:true});
  let wider=0;
  for(const [name,bags] of Object.entries(plans)){
    plan(bags,{rack:bags.some(b=>b.pos==='rack')});
    const narrow=json(`(()=>{const s=idealTrial(S.bags,{},S.placements);const o=window.WayfinchAdvisor.autoBalance(s,(p,f)=>idealTrial(S.bags,p,f.state),{fixed:balanceFixed(s)});return {apply:o.apply,gain:o.gain};})()`);
    const before=json(READ),did=json('autoBalancePlan()'),after=json(READ);
    if(did&&!narrow.apply)wider++;
    if(narrow.apply)assert.equal(did,true,`${name}: what the usual search balanced is still balanced`);
    if(did)assert.ok(before.score-after.score>=json('window.WayfinchAdvisor.MIN_GAIN_SCORE')-1e-9,`${name}: clearly better (${before.score} to ${after.score})`);
  }
  assert.ok(wider>=1,`plans only the wider look balances (${wider})`);
});

// The page never blocks: at the packing check the balancing runs in slices between frames, "Checking the balance…" meanwhile; a search
// for a plan that changed since never applies.
test('[BAL-AUTO] in slices: the packing check asks for the balance, says "Checking the balance…", and applies it once the search is done; a stale search never applies',()=>{
  plan(SETS.bikepacking);
  const own=json('S.placements');
  assert.equal(json('autoBalancePlan({later:true})'),false,'nothing applied at once');
  assert.deepEqual(json('S.placements'),own,'the plan as it was while the search runs');
  assert.equal(json('!!BALANCE.run'),true);
  assert.match(json('balanceLine()'),/Checking the balance…/);
  assert.equal(json('autoBalancePlan({later:true})'),false,'looked at once: no second search');
  let slices=0;
  while(json('!!BALANCE.run')){run('balanceSlice(BALANCE.run)');slices++;assert.ok(slices<100,'the search ends');}
  assert.ok(slices>=2,`run in slices (${slices})`);
  assert.notDeepEqual(json('S.placements'),own,'balanced once done');
  assert.match(json('balanceLine()'),/^<div class="balance-line" role="status"><span>Packed for better balance: /);
  // the same in one go: the same balance
  const sliced=json('currentPlan().items');
  plan(SETS.bikepacking);
  assert.equal(json('autoBalancePlan()'),true);
  assert.deepEqual(json('currentPlan().items'),sliced,'the slices give the same balance as one go');
  // a search for a plan changed since never applies
  plan(SETS.bikepacking);
  json('autoBalancePlan({later:true})');
  run('var qaStale=BALANCE.run;balanceSlice(qaStale)');
  run(`S.bags=S.bags.filter(b=>b.pos!=='top');currentPlan()`);
  const changed=json('S.placements');
  for(let i=0;i<40;i++)run('balanceSlice(qaStale)');
  assert.deepEqual(json('S.placements'),changed,'the stale search changed nothing');
  assert.equal(json('BALANCE.run===qaStale'),false,'and was dropped');
});

// Review of PR 89, C2: Try in Bag planner while the search ran, then Remove: the search was dropped for the trial, yet the plan Remove
// brought back counted as looked at, so it was never balanced in this visit.
test('[BAL-STORED] a search dropped unfinished (Try in Bag planner, then Remove) leaves the plan to be looked at again: the restored plan is balanced',()=>{
  plan(SETS.bikepacking);
  const own=json('S.placements');
  json('autoBalancePlan({later:true})');
  run('balanceSlice(BALANCE.run)');
  assert.equal(json('!!BALANCE.run'),true,'the search under way');
  run(`TRIAL={before:{bags:S.bags,decks:S.decks,placements:S.placements,nextUid:S.nextUid,step:4,baseNights:S.baseNights,stepPrev:S.step_prev,cache:PLAN_CACHE},uids:[]};
    S.bags=[...S.bags,{uid:S.nextUid,pos:'rack',L:20,pair:true,trial:true}];S.nextUid++;currentPlan()`);
  run('balanceSlice(BALANCE.run)');
  assert.equal(json('BALANCE.run'),null,'dropped for the trial');
  // go() is the page's step change (stubbed here, as in qa/advisor.cjs); then the packing check's own look, as renderResult (a no-op in
  // this VM) starts it
  run("if(typeof go!=='function')var go=n=>{S.step_prev=S.step;S.step=n;};removeTrial();autoBalancePlan({later:true})");
  assert.deepEqual(json('S.placements'),own,'Remove brings the plan back');
  assert.equal(json('!!BALANCE.run'),true,'the restored plan is looked at again');
  while(json('!!BALANCE.run'))run('balanceSlice(BALANCE.run)');
  assert.match(json('balanceLine()'),/Packed for better balance/,'and balanced');
});

// Review of PR 89, C1: the weight map's line named must-reach things for a gain the balancing takes without moving them. They are named
// only when, with them held as the balancing holds them, less than MIN_GAIN_SCORE is to be had, and freeing them gives MIN_GAIN_SCORE
// or more; a plan the balancing has yet to balance never blames them.
test('[WM-NOTE] the line names the rider\'s things only for a gain that holding them costs: never on a plan the balancing can still balance without moving them',()=>{
  const MIN=json('window.WayfinchAdvisor.MIN_GAIN_SCORE');
  const NOTE=`(()=>{IDEAL_CACHE={key:null,value:null};const f=weightMapIdeal(true);const s=idealTrial(S.bags,{},S.placements);
    const held=window.WayfinchAdvisor.autoBalance(s,(p,x)=>idealTrial(S.bags,p,x.state),balanceOptions(s));
    return {text:f.note&&f.note.text,groups:f.note?f.note.groups.length:0,gain:f.gain,held:held.gain};})()`;
  for(const [name,bags] of Object.entries(SETS)){
    // the planner's own packing, not balanced yet (a plan stored before the wider look, or reopened before the balance lands)
    plan(bags,{rack:bags.some(b=>b.pos==='rack')});
    const before=json(NOTE);
    if(before.held>=MIN)assert.equal(before.groups,0,`${name}: the balancing can take ${before.held} itself, so nothing of the rider's is blamed (${before.text})`);
    // balanced: whatever the line names, holding it costs the gain
    json('autoBalancePlan()');
    const after=json(NOTE);
    if(after.groups)assert.ok(after.held<MIN&&after.gain>=MIN,`${name}: named for ${after.gain}, with ${after.held} to be had while they are held (${after.text})`);
  }
  // a hand placement that does cost the balance: the bike lock in a backpack, put there by hand
  plan([...SETS.bikepacking,{uid:6,pos:'pack',L:10}],{},"S.pinned={lock:'6-0'}");
  json('autoBalancePlan()');
  const lock=json(NOTE);
  assert.match(lock.text,/^Your hand placement in the backpack \(bike lock\) puts more weight on your back\./);
  assert.ok(lock.held<MIN&&lock.gain>=MIN);
  // must-reach things that do cost it: bikepacking bags on the page's starting kit, balanced
  plan(SETS.bikepacking,{},fresh());
  json('autoBalancePlan()');
  const reach=json(NOTE);
  assert.match(reach.text,/^Your must-reach things in the frame bag \([^)]+\) take room there that heavier things could use\./);
  assert.ok(reach.held<MIN&&reach.gain>=MIN);
});

for(const [name,fn] of tests){fn();passed++;console.log('ok',name);}
console.log(`${passed} automatic balancing tests passed`);
