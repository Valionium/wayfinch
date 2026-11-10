// The Bag planner's "Handling first" (design of 10 Nov 2026, the owner's answers of 10 Nov): one press at the packing check packs by
// weight over the frozen packing (advisor.js's handlingFirst through idealTrial/planWith, as the automatic balancing), stored as kept
// placements, with its line, tips and Undo; never by itself, never in the small view, never another bag. Source-level: the page's
// functions in the QA VM, nothing printed of it.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');

let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

const q=appVM();
const {run}=q;
const json=code=>JSON.parse(run(`JSON.stringify(${code})`));
run('DRAFT_READY=true');
// the page's own starting kit, for the one full-kit mix (review of PRs 116/117, M3)
const FULLKIT=JSON.stringify(json('S.kit'));
// a smaller kit than the page's own, so each press runs a few hundred trials less (the QA suites run within LC-QA-ALL's time)
const KIT0=JSON.stringify(Object.fromEntries(['tent','quilt','pad','stove','pot','lock','tool','pump','bank','puffy','rain','firstaid','wash','camp','tubes','phone'].map(k=>[k,true]))),NIGHTS0=json('S.nights');
const bike={id:'qa_hf',fit:{style:'diamond-sloping',size:{kind:'letter',value:'M'}},look:{bars:'drop'},frontTyre:'47-584',rearTyre:'47-584'};
// A plan at the packing step: these bags and decks, the kit as the page starts it, nothing kept yet; with `balanced`, the automatic
// balancing as the page applies it at the first look (it takes its time, so only where a test needs it).
const plan=(bags,decks={},extra='',balanced=false,kit=KIT0)=>run(`(()=>{S.kit=${kit};S.nights=${NIGHTS0};S.foodMode=2;S.mode='comfort';SMALL_VIEW=false;
  S.bikeProfile=normaliseBikeProfile(${JSON.stringify(bike)});S.bags=${JSON.stringify(bags)}.map(b=>({...b}));
  S.nextUid=1+Math.max(0,...S.bags.map(b=>b.uid));S.decks={bar:false,rack:false,...${JSON.stringify(decks)}};S.pinned={};S.packed={};S.placements=null;
  resetBalance();TRIAL=null;DRAFT_FROZEN=false;S.step=4;${extra};currentPlan();${balanced?'autoBalancePlan();':''}return true;})()`);
const SETS={
  bikepacking:[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:13},{uid:3,pos:'frame',L:4.5},{uid:4,pos:'top',L:1,slot:'front'},{uid:5,pos:'fork',L:3,pair:true}],
  'full bags and a backpack':[{uid:1,pos:'seat',L:9},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6},{uid:4,pos:'pack',L:30}],
  'seat, bar and frame 6':[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6}],
  touring:[{uid:1,pos:'rack',L:20,pair:true},{uid:2,pos:'bar',L:9},{uid:3,pos:'bottle',slot:'dt',L:0.75},{uid:4,pos:'pack',L:12}],
};
const PAIR_GAP=json('PAIR_NOTE_GAP');
// a plan where a press moves food (review of PRs 116/117, M2)
const FOOD_BAGS=[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6}];
const SCORE=`(r=>Math.round(Object.entries(r.kgByPos).reduce((t,[p,k])=>t+(k||0)*window.WayfinchAdvisor.WEIGHTS[p],0)*100)/100)(advisorResult(currentPlan()))`;
const state=()=>json(`JSON.stringify([S.bags,S.pinned,S.kit,S.decks,S.qty,S.mode,S.packed])`);
const press=()=>json('startHandling({now:true})');
const line=()=>json('balanceLine()');

test('[HF-STORED] a press is stored as kept placements only: the bags, kit and hand placements stay, the draft carries it, a reload packs the same, and the automatic balancing finds nothing to do on top',()=>{
  let packed=0;
  for(const [name,bags] of Object.entries(SETS)){
    plan(bags,{rack:bags.some(b=>b.pos==='rack')},'',true);
    const inputs=state(),keys=Object.keys(json('capturePlan()')).sort(),before=json(SCORE),fresh=json('allocate()');
    assert.equal(json('handlingAvailable()'),true,`${name}: the button is there`);
    const did=press();
    assert.equal(state(),inputs,`${name}: bags, kit, decks, hand placements and ticks as they were`);
    assert.deepEqual(json('allocate()'),fresh,`${name}: the planner's own fresh packing (the frozen rules) is the same`);
    assert.deepEqual(Object.keys(json('capturePlan()')).sort(),keys,`${name}: nothing new stored`);
    assert.ok(json(SCORE)<=before,`${name}: never worse (${before} to ${json(SCORE)})`);
    if(!did){assert.match(line(),/Already packed for handling|Nothing moved/,name);continue;}
    packed++;
    // better, or (review of PRs 116/117, C1) a pair evened out at no cost
    assert.ok(json(SCORE)<=before-0.01||json('HANDLING.last.route')==='even',`${name}: better or a pair evened`);
    const items=json('currentPlan().items'),placements=json('S.placements');
    assert.deepEqual(json('capturePlan().placements'),placements,`${name}: the draft carries the packing`);
    // no automatic balance on top: it looks at the new packing and stays quiet
    assert.equal(json('autoBalancePlan()'),false,`${name}: no automatic balance after the press`);
    assert.deepEqual(json('currentPlan().items'),items);
    // another page: the draft's placements loaded, the same packing, no balancing of its own
    const other=appVM({storage:q.store});
    other.run('DRAFT_READY=true');
    const ojson=code=>JSON.parse(other.run(`JSON.stringify(${code})`));
    other.run(`S.bikeProfile=normaliseBikeProfile(${JSON.stringify(bike)});S.bags=${JSON.stringify(json('S.bags'))};S.nextUid=${json('S.nextUid')};S.decks=${JSON.stringify(json('S.decks'))};
      S.kit=${JSON.stringify(json('S.kit'))};S.qty=${JSON.stringify(json('S.qty'))};S.foodMode=2;S.step=4;keepPlan({load:${JSON.stringify(placements)}})`);
    assert.deepEqual(ojson('currentPlan().items'),items,`${name}: a reload packs the same`);
    assert.equal(ojson('autoBalancePlan()'),false,`${name}: nothing more to move`);
    assert.equal(ojson('handlingAvailable()&&HANDLING.last'),null,`${name}: a loaded plan is never run through Handling first by itself`);
  }
  assert.ok(packed>=1,`Handling first packs real plans after the automatic balancing (${packed})`);
});

test('[HF-STORED] a plan in My plans changes only when the rider saves it; a loaded plan is never run through Handling first by itself',async()=>{
  plan(SETS.bikepacking);
  run("SETUPS=[];buildThumb=()=>''");
  assert.equal(await run("saveSetup('Before handling','')"),true);
  const stored=q.values.get('loadcheck:setups');
  assert.equal(press(),true);
  assert.equal(q.values.get('loadcheck:setups'),stored,'the saved plan is as it was');
  // the saved plan loaded again: its own packing, no press
  const saved=json('SETUPS[0]');
  run(`restorePlan(${JSON.stringify(saved)},false)`);
  json('currentPlan()');
  assert.equal(json('HANDLING.last'),null);
  assert.equal(json('HANDLING.run'),null,'no search started by the load');
  assert.doesNotMatch(line(),/handling/i);
});

test('[HF-UNDO] Undo brings back exactly the packing before the press and says so; never while a thing it moved is ticked as packed',()=>{
  for(const name of ['full bags and a backpack']){
    plan(SETS[name]);
    const placements=json('S.placements'),items=json('currentPlan().items');
    assert.equal(press(),true,name);
    assert.match(line(),/data-handling-undo="1">Undo</,`${name}: Undo offered`);
    const m=json('HANDLING.last.moves[0]');
    // the rider packs it where it now is and ticks it: no Undo, and why
    run(`S.packed[${JSON.stringify(m.id)}]=true;currentPlan()`);
    assert.doesNotMatch(line(),/data-handling-undo/,`${name}: no Undo under a tick`);
    assert.match(line(),/You have started packing it this way, so it stays\./);
    assert.equal(json('undoHandling()'),false);
    assert.equal(json(`currentPlan().items[${JSON.stringify(m.id)}][0][0]`),m.to,`${name}: it stays where it is packed`);
    run(`delete S.packed[${JSON.stringify(m.id)}];currentPlan()`);
    assert.equal(json('undoHandling()'),true,`${name}: unticked, Undo works`);
    assert.deepEqual(json('S.placements'),placements,`${name}: exactly the packing before`);
    assert.deepEqual(json('currentPlan().items'),items);
    assert.match(line(),/^<div class="balance-line" role="status"><span>Back to the packing before Handling first\.<\/span><\/div>$/);
    assert.equal(json('autoBalancePlan()'),false,`${name}: the automatic balancing leaves the packing Undo brought back`);
  }
  // food ticked as packed holds Undo back too, when the press moved food (review of PRs 116/117, M2: a plan where it does)
  plan(FOOD_BAGS,{},'S.kit.food=true');
  const food=json('whereOf(currentPlan()).food||null');
  assert.ok(food,'food in the plan');
  assert.equal(press(),true);
  assert.notDeepEqual(json('whereOf(currentPlan()).food||null'),food,'the press moved food');
  run('S.packed.food=true;currentPlan()');
  assert.doesNotMatch(line(),/data-handling-undo/,'ticked food: no Undo');
  assert.equal(json('undoHandling()'),false,'ticked food: Undo does nothing');
  run('delete S.packed.food;currentPlan()');
  assert.equal(json('undoHandling()'),true);
});

test('[HF-LINE] one line in the place of the balance line: the moves that do the most first, "See all" for a long list, Undo; "Already packed" when there is nothing to gain',()=>{
  plan(SETS['full bags and a backpack']);
  assert.equal(press(),true);
  const moves=json('HANDLING.last.moves'),l=line();
  assert.match(l,/^<div class="balance-line hf-line" role="status"><span>Packed for handling: [^<]+ ·<\/span> /);
  const said=json(`HANDLING.last.moves.map(m=>kitWord(kitById(m.id))+' to the '+unitLabel(currentPlan().slots.find(s=>s.key===m.to)).toLowerCase())`);
  if(moves.length>3){
    assert.ok(l.includes(`${said[0]}, ${said[1]} and ${moves.length-2} more things`),l);
    assert.match(l,/<button class="linky" type="button" data-handling-all="1" aria-expanded="false" aria-controls="hfAll">See all<\/button>/);
    run('HANDLING.all=true');
    const all=line();
    assert.match(all,/aria-expanded="true"/);
    for(const s of json(`HANDLING.last.moves.map(m=>kitWord(kitById(m.id)))`))assert.ok(all.toLowerCase().includes(s.toLowerCase()+": from the "),`the list names ${s}`);
    assert.equal(((all.match(/<ul class="hf-all"[^>]*>(.*?)<\/ul>/)||['',''])[1].match(/<li>/g)||[]).length,moves.length,'every move in the list');
  } else for(const s of said)assert.ok(l.includes(s));
  // the moves that do the most first: kilos times the drop of the handling weight
  const worth=json(`HANDLING.last.moves.map(m=>{const W=window.WayfinchAdvisor.WEIGHTS,p=HANDLING.last.start.pieces.find(x=>x.id===m.id),t=currentPlan().slots.find(s=>s.key===m.to);return p.kg*(W[p.pos]-W[t.pos]);})`);
  for(let i=1;i<worth.length;i++)assert.ok(worth[i-1]>=worth[i]-1e-9,'sorted by what they do');
  // a second press: never worse (each search stops at its trials, so a second one may find a little more)
  const once=json(SCORE);
  press();
  assert.ok(json(SCORE)<=once);
  // the line goes with the next change of the plan
  run('S.kit.camp=false;currentPlan()');
  assert.doesNotMatch(line(),/handling/i);
  // nothing to gain: said so, with no Undo
  plan(SETS.touring,{rack:true},"S.mode='light'");
  const before=json('S.placements');
  assert.equal(press(),false);
  assert.deepEqual(json('S.placements'),before,'nothing changed');
  assert.match(line(),/^<div class="balance-line hf-line" role="status"><span>Already packed for handling: the heavy things sit as low and central as your bags allow\.<\/span><\/div>/);
  assert.doesNotMatch(line(),/data-handling-undo/);
});

test('[HF-LINE] in slices: "Packing for handling…" while the search runs, the page never blocked; a stale search never applies',()=>{
  plan(SETS.bikepacking);
  const own=json('S.placements');
  assert.equal(json('startHandling()'),true);
  assert.deepEqual(json('S.placements'),own,'nothing applied at once');
  assert.match(line(),/Packing for handling…/);
  // the button says so and takes no second press (review of PRs 116/117, c)
  run('fillHandling()');
  assert.equal(q.nodes.get('rigHandling').textContent,'Packing for handling…');
  const running=json('HANDLING.run.key');
  assert.equal(json('startHandling()'),false,'a second press while it runs does nothing');
  assert.equal(json('HANDLING.run.key'),running);
  let slices=0;
  while(json('!!HANDLING.run')){run('handlingSlice(HANDLING.run)');slices++;assert.ok(slices<400,'the search ends');}
  assert.ok(slices>=2,`run in slices (${slices})`);
  run('fillHandling()');
  assert.equal(q.nodes.get('rigHandling').textContent,'Handling first');
  const sliced=json('currentPlan().items');
  plan(SETS.bikepacking);
  press();
  assert.deepEqual(json('currentPlan().items'),sliced,'the slices give the same answer as one go');
  // a search for a plan changed since never applies
  plan(SETS.bikepacking);
  json('startHandling()');
  run('var qaStale=HANDLING.run;handlingSlice(qaStale)');
  run(`S.kit.camp=false;currentPlan()`);
  const changed=json('S.placements');
  for(let i=0;i<60;i++)run('handlingSlice(qaStale)');
  assert.deepEqual(json('S.placements'),changed,'the stale search changed nothing');
  assert.equal(json('HANDLING.run===qaStale'),false,'and was dropped');
});

test('[HF-FULL] a full frame bag is said in one line; a bigger frame bag is pointed to only when the frame takes one; the bags never change',()=>{
  // a half frame bag on a frame that takes a full one
  plan([{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:13},{uid:3,pos:'frame',L:3,shape:2},{uid:4,pos:'fork',L:3,pair:true}]);
  const bags=json('S.bags');
  press();
  assert.deepEqual(json('S.bags'),bags,'the bags as they were');
  const half=line();
  assert.match(half,/<li>Your frame bag is full( of the heaviest things)?; the [^<]+ ride[s]? in the [^<]+\.<\/li>/);
  assert.match(half,/<li>A (full|three-quarter) frame bag would fit your frame and take about \d+\.\d kg more of the heavy things\. The Gear advisor can show it\.<\/li>/);
  // the full frame bag: full perhaps, but no bigger one to point to
  plan([{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:13},{uid:3,pos:'frame',L:6,shape:0},{uid:4,pos:'fork',L:3,pair:true}]);
  press();
  assert.doesNotMatch(line(),/would fit your frame/);
});

test('[HF-AIR] the packing tips: the heaviest things low in the frame bag; an outer bag (seat pack, bar roll, pannier, fork cage) under half full is rolled down and strapped tight',()=>{
  let air=0,pairs=0;
  for(const bags of [[{uid:1,pos:'seat',L:16},{uid:2,pos:'bar',L:13},{uid:3,pos:'frame',L:6},{uid:4,pos:'fork',L:5,pair:true}],
    [{uid:1,pos:'rack',L:25,pair:true},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6}]]){
  plan(bags,{rack:bags.some(b=>b.pos==='rack')});
  press();
  const l=line();
  assert.match(l,/<li>Frame bag: pack the heaviest things at the bottom, near the down tube\.<\/li>/);
  const fill=json(`currentPlan().slots.filter(s=>['seat','bar','rack','fork'].includes(s.pos)&&s.items.length).map(s=>[unitLabel(s),(s.cap-s.left)/s.cap,s.pos])`);
  for(const [name,f,pos] of fill){
    if(f<0.5&&(pos==='rack'||pos==='fork'))pairs++;
    const tip=new RegExp(`<li>${name} (nearly empty|about a quarter full|about a third full|under half full): roll it down and pull the straps tight so it does not sway\\.</li>`);
    if(f<0.5){assert.match(l,tip,`${name}, ${Math.round(f*100)}% full`);air++;}
    else assert.doesNotMatch(l,tip);
  }
  }
  assert.ok(air>=1,'a part-empty bag in these plans');
  assert.ok(pairs>=1,'a part-empty pannier or fork cage among them');
});

// Review of PRs 116/117, C1 and I1: on the page's own full kit, rear panniers, bar roll and frame bag with the rack deck, after the
// automatic balancing, a press left one pannier at 100 % and the other at 1 %. Each pair now stays as even as the pair note asks
// (PAIR_UNEVEN, the page's own measure), every move is named, and nothing reads "undefined".
test('[HF-KEEPS] side to side on the full kit: no pair ends uneven by the pair note\'s measure that was even, none more uneven; every move named',()=>{
  assert.equal(json('window.WayfinchAdvisor.PAIR_UNEVEN'),json('PAIR_NOTE_GAP'),'one measure: the pair note\'s');
  const fills=()=>json(`(()=>{const g={};currentPlan().slots.forEach(s=>{if(countOf(s)>1)(g[s.uid]=g[s.uid]||[]).push((s.cap-s.left)/s.cap);});return Object.values(g).filter(f=>f.length===2).map(f=>Math.abs(f[0]-f[1]));})()`);
  for(const [name,bags,decks] of [['touring',[{uid:1,pos:'rack',L:20,pair:true},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6}],{rack:true}],
    ['bikepacking',SETS.bikepacking,{}]]){
    plan(bags,decks,'',true,FULLKIT);
    const before=fills();
    press();
    const after=fills();
    before.forEach((g,i)=>{
      if(g<PAIR_GAP)assert.ok(after[i]<PAIR_GAP,`${name}: an even pair stays even (${g.toFixed(2)} to ${after[i].toFixed(2)})`);
      else assert.ok(after[i]<=g+1e-9,`${name}: an uneven pair gets no more uneven (${g.toFixed(2)} to ${after[i].toFixed(2)})`);
    });
    const l=line();
    assert.doesNotMatch(l,/undefined/,name);
    if(json('HANDLING.last.kind')==='packed'){
      assert.ok(json('HANDLING.last.moves.length')>0,`${name}: applied with moves`);
      run('HANDLING.all=true');
      assert.equal(((line().match(/<ul class="hf-all"[^>]*>(.*?)<\/ul>/)||['',''])[1].match(/<li>/g)||[]).length||json('HANDLING.last.moves.length'),json('HANDLING.last.moves.length'));
    }
  }
});

test('[HF-SMALL] not in the small view, nor before the packing step, during a trial or on a draft another tab froze',()=>{
  for(const [why,extra] of [['the small view','SMALL_VIEW=true'],['the kit step','S.step=3'],['a trial','TRIAL={before:{},uids:[]}'],['a frozen draft','DRAFT_FROZEN=true']]){
    plan(SETS.bikepacking,{},'');
    run(extra);
    const before=json('S.placements');
    assert.equal(json('handlingAvailable()'),false,why);
    assert.equal(json('startHandling({now:true})'),false,why);
    assert.deepEqual(json('S.placements'),before,`${why}: the plan is as it was`);
    run('SMALL_VIEW=false;TRIAL=null;DRAFT_FROZEN=false');
  }
});

(async()=>{for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} Handling first tests passed`);})().catch(e=>{console.error(e);process.exit(1);});
