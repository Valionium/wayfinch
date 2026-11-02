/* Run with VS Code's runtime (see the release routine). Design 9.1: one cached plan, one trial function. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {planKit}=require('./plan-kit.cjs');
const bag=(uid,pos,L,extra={})=>({uid,pos,L,...extra});
const SETUP={bags:[bag(1,'seat',8),bag(2,'bar',6),bag(3,'frame',4)],kit:['tent','pad','quilt','stove','food','tool'],mode:'comfort',nights:2,sleep:'camp',foodMode:1};
let cases=0;
function test(name,fn){fn();cases++;process.stdout.write('PASS '+name+'\n');}
const counted=kit=>{kit.vm.run('globalThis.__selections=0;{const real=selectBags;selectBags=function(){__selections++;return real.apply(this,arguments);};}');return ()=>kit.vm.run('__selections');};

test('[LC-PLAN-01] two currentPlan() calls with no change work the plan out once',()=>{
  const kit=planKit().setPlan(SETUP);
  kit.vm.run('globalThis.__keeps=0;{const real=keepPlan;keepPlan=function(){__keeps++;return real.apply(this,arguments);};}');
  kit.vm.run('currentPlan();currentPlan();');
  assert.equal(kit.vm.run('__keeps'),1);
  kit.vm.run('S.kit.warmers=true;currentPlan();currentPlan();');
  assert.equal(kit.vm.run('__keeps'),2,'a real change works it out once more');
});
test('[LC-PLAN-02] ticking and printing run no selection',()=>{
  const kit=planKit().setPlan(SETUP),runs=counted(kit);
  kit.vm.run('currentPlan();');
  const before=runs();
  kit.step({tick:'tent'});
  kit.vm.run('getChecklistModel();renderPrintableChecklist();');
  assert.equal(runs(),before,'tick and print read the cache');
});
test('[LC-PLAN-02] the hover, drawing and bag pop-up readers take the plan from currentPlan()',()=>{
  const html=fs.readFileSync(require('./paths.cjs').page,'utf8');
  const part=(a,b)=>{const s=html.indexOf(a),e=html.indexOf(b,s+a.length);assert(s>=0&&e>s,a);return html.slice(s,e);};
  const readers=[part('/* ==== 60-diagram.js ==== */','/* ==== 70-steps.js ==== */'),part('/* ==== 80-result.js ==== */','/* ==== 84-packing-checklist.js ==== */'),
    part('/* ==== 90-inspector.js ==== */','/* ==== 95-init.js ==== */'),part('/* ==== 95-init.js ==== */','/* ==== 98-legal.js ==== */'),
    part('/* ==== 85-storage.js ==== */','/* ==== 88-route-map.js ==== */')];
  readers.forEach((source,i)=>assert(!/\ballocate\(\)/.test(source),`reader ${i} still calls allocate()`));
});
test('[LC-PLAN-03] planWith leaves state, storage and currentPlan() byte-identical',()=>{
  const kit=planKit().setPlan(SETUP);
  const first=JSON.stringify(kit.plan());
  const state=kit.vm.run('JSON.stringify(S)'),stored=JSON.stringify(kit.stored());
  const trial=JSON.parse(kit.vm.run("JSON.stringify(planWith({ add:'warmers' }))"));
  assert.notEqual(JSON.stringify(trial.items),JSON.stringify(kit.plan().items),'the trial really differs');
  assert.equal(kit.vm.run('JSON.stringify(S)'),state);
  assert.equal(JSON.stringify(kit.stored()),stored);
  assert.equal(JSON.stringify(kit.plan()),first);
});
test('[LC-PLAN-04] planDiff lists exactly the moved item, and food is excluded',()=>{
  const a={inUse:['1-0','2-0'],items:{tent:[['1-0',1,5]],pad:[['2-0',1,2]]},food:{'1-0':1},overflow:[{id:'warmers',pieces:1,litres:.5,tooLong:false},{id:'food',pieces:1,litres:.2,tooLong:false}]};
  const b={inUse:['1-0','2-0'],items:{tent:[['2-0',1,5]],pad:[['2-0',1,2]],warmers:[['1-0',1,.5]]},food:{'2-0':1},overflow:[{id:'food',pieces:1,litres:.2,tooLong:false}]};
  const kit=planKit();
  const diff=JSON.parse(kit.vm.run(`JSON.stringify(planDiff(${JSON.stringify(a)},${JSON.stringify(b)}))`));
  assert.deepEqual(diff,{moved:[{id:'tent',from:'1-0',to:'2-0'}],placedFromOverflow:['warmers']});
});
test('[LC-PLAN-05] a plan with no bags: the plan is empty and the readers do not throw',()=>{
  const kit=planKit().setPlan({...SETUP,bags:[]});
  const plan=kit.plan();
  assert.deepEqual(plan.inUse,[]);assert.deepEqual(plan.units,{});
  assert.equal(plan.hand.kept.length,0);
  kit.vm.run('getChecklistModel();renderPrintableChecklist();packingSummary(currentPlan());rainAccess(currentPlan());strapOptions(currentPlan());fixSuggestion();snapshotAt(3);');
  assert(kit.texts().checklist.length>0,'the checklist still lists the kit');
});
test("currentPlan keeps today's allocation fields for the readers",()=>{
  const kit=planKit().setPlan(SETUP);
  const plan=kit.plan();
  assert(plan.slots.length>0&&Array.isArray(plan.spill));
  assert.equal(JSON.stringify(plan.slots),kit.vm.run('JSON.stringify(allocate().slots)'),'same bags and items as allocate()');
  assert.deepEqual(plan.inUse,plan.slots.map(s=>s.key));
  assert.equal(plan.summary.mountedL,kit.vm.run('packingSummary(allocate()).mounted'));
});
test('the cached plan always equals the same plan worked out again, after any real change',()=>{
  const kit=planKit().setPlan(SETUP);
  const view='(p=>JSON.stringify([p.inUse,p.items,p.overflow,p.hand]))';
  const same=()=>{kit.plan();assert.equal(kit.vm.run(view+'(currentPlan())'),kit.vm.run(view+'(planWith({}))'));};
  same();
  [{add:'warmers'},{mode:'light'},{nights:6},{qty:{tent:2}},{move:'stove',to:'2-0'},{remove:'pad'},{mode:'comfort'}].forEach(step=>{kit.step(step);same();});
  kit.vm.run("S.bags.push({uid:9,pos:'top',L:1.5});");same();
  kit.vm.run("S.custom.tent={L:9,kg:2,rigid:30};");same();
  kit.vm.run("S.decks.rack=true;");same();
});
console.log(JSON.stringify({status:'passed',cases}));
