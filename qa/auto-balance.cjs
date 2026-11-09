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
const bike={id:'qa_bal',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'}},look:{bars:'drop'},frontTyre:'47-584',rearTyre:'47-584'};
// A plan at the packing step: these bags and decks, the kit as the page starts it, nothing kept yet.
const plan=(bags,decks={},extra='')=>run(`(()=>{S.bikeProfile=normaliseBikeProfile(${JSON.stringify(bike)});S.bags=${JSON.stringify(bags)}.map(b=>({...b}));
  S.nextUid=1+Math.max(0,...S.bags.map(b=>b.uid));S.decks={bar:false,rack:false,...${JSON.stringify(decks)}};S.pinned={};S.packed={};S.placements=null;
  BALANCE.checked=null;BALANCE.last=null;BALANCE.reverted=null;BALANCE.undone=new Set();BALANCE.pins=null;BALANCE.loaded=null;TRIAL=null;
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
    // what the search finds from the planner's own packing, read the advisor's way
    const found=json(`(()=>{const s=idealTrial(S.bags,{},S.placements);const o=window.WayfinchAdvisor.autoBalance(s,(p,f)=>idealTrial(S.bags,p,f.state),{fixed:balanceFixed(s)});return {apply:o.apply,gain:o.gain,moves:o.balanced.moves};})()`);
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

test('[BAL-LINE] one quiet line names the moves with Undo; Undo restores the planner\'s own packing, says so, and the things put back are not moved again',()=>{
  plan(SETS.bikepacking);
  const own=json('currentPlan().items'),ownPlacements=json('S.placements');
  assert.equal(json('autoBalancePlan()'),true);
  const moves=json('BALANCE.last.moves');
  const line=json('balanceLine()');
  assert.match(line,/^<div class="balance-line" role="status"><span>Packed for better balance: [^<]+ ·<\/span> <button class="linky" type="button" data-balance-undo="1">Undo<\/button><\/div>$/);
  const named=json(`BALANCE.last.moves.map(m=>kitById(m.id).name.toLowerCase())`);
  if(moves.length<=3)for(const n of named)assert.ok(line.includes(n),`the line names ${n}`);
  else assert.match(line,/\d+ more things/);
  // the moves that do the most come first; with more than three, the first two and how many more
  const shown=moves.length>3?2:moves.length;
  assert.ok(json(`BALANCE.last.moves.slice(0,${shown}).every(m=>${JSON.stringify(line)}.includes(kitById(m.id).name.toLowerCase()+' to the '+unitLabel(currentPlan().slots.find(s=>s.key===m.to)).toLowerCase()))`),'and where each goes');
  if(moves.length>3)assert.ok(line.includes(`and ${moves.length-2} more things`));
  // Undo
  json('undoBalance()');
  assert.deepEqual(json('currentPlan().items'),own,"Undo: the planner's own packing");
  assert.deepEqual(json('S.placements.items'),ownPlacements.items);
  assert.equal(json('balanceLine()'),'<div class="balance-line" role="status"><span>Back to the planner\'s own packing.</span></div>');
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

for(const [name,fn] of tests){fn();passed++;console.log('ok',name);}
console.log(`${passed} automatic balancing tests passed`);
