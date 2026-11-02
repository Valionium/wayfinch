'use strict';
// The weight check (design 11, spec 7.4): it only reports, never moves a bag, never asks for the rider's weight.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),originalGet=app.context.document.getElementById;
const get=id=>{
  const node=originalGet(id);
  if(!node.uiMock){
    node.uiMock=true;const classes=new Set(['maxWeightBox','bikeDetailsBox'].includes(id)?['hidden']:[]);
    node.classList={add(...n){n.forEach(x=>classes.add(x));},remove(...n){n.forEach(x=>classes.delete(x));},
      contains(n){return classes.has(n);},toggle(n,f){const on=f??!classes.has(n);on?classes.add(n):classes.delete(n);return on;}};
    node.focus=()=>{app.context.document.activeElement=node;};
  }
  return node;
};
app.context.document.getElementById=get;app.context.document.removeEventListener=()=>{};
app.run('renderKit=()=>{};drawRig=()=>{};renderResult=()=>{};queueDraftSave=()=>{};renderBikeProfiles=()=>{};renderPressureHelper=()=>{};closeBagPop=()=>{};renderPackingChecklist=()=>{};applyTheme=()=>{};syncGPXControl=()=>{};renderClimate=()=>{};');
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const J=code=>JSON.parse(app.run(`JSON.stringify(${code})`)??'null');
const field=(id,value)=>{get(id).value=value;};
const wc=({max,bikeKg=null,luggage,bags=null,bikeId='wb'})=>J(`weightCheck({carriedKg:${luggage},unplacedKg:0,decksKg:0,waterKg:0},
  normaliseBikeProfile({id:'${bikeId}',name:'W',maxWeight:${JSON.stringify(max)},pressure:{bikeKg:${bikeKg}}}),${bags})`);
const kg=(v,includes)=>({v,u:'kg',includes}),lb=(v,includes)=>({v,u:'lb',includes});

// [LC-WT-02..08] the spec's values
{
  const a=wc({max:kg(120,'bike'),bikeKg:10,luggage:22.6,bags:2.4});
  check(a.state==='room' && a.totalKg===35 && a.roomKg===85 && !a.atMost,'LC-WT-02 35.0 kg, leaves 85.0 kg');
  check(a.sentence==='Bike 10.0 kg + luggage and water 22.6 kg + empty bags 2.4 kg = 35.0 kg. Under the 120 kg you entered (includes the bike), that leaves 85.0 kg for you, dressed.','LC-WT-02 the sentence');
  const b=wc({max:kg(125,'no-bike'),bikeKg:9.5,luggage:18,bags:1.5}),b2=wc({max:kg(125,'no-bike'),bikeKg:null,luggage:18,bags:1.5});
  check(b.roomKg===105.5 && b2.roomKg===105.5 && b.sentence===b2.sentence.replace(/^/,'') && !/Bike/.test(b.sentence.slice(0,6)),'LC-WT-03 rider and luggage only: 105.5, the same without a bike weight');
  check(wc({max:kg(120,'unsure'),bikeKg:12,luggage:20,bags:2}).roomKg===86,'LC-WT-04 not sure counts the bike: 86.0');
  const c=wc({max:kg(120,'bike'),bikeKg:12,luggage:20,bags:null});
  check(c.atMost && c.roomKg===88 && /at most 88\.0 kg/.test(c.sentence) && /Not entered: your bags' own weight\.$/.test(c.sentence),'LC-WT-05 bags missing: at most 88.0 kg');
  const d=wc({max:kg(120,'bike'),bikeKg:null,luggage:20,bags:2});
  check(d.atMost && d.roomKg===98 && /at most 98\.0 kg/.test(d.sentence) && /Not entered: your bike's weight\.$/.test(d.sentence),'LC-WT-06 bike weight missing: at most 98.0 kg');
  const e=wc({max:lb(400,'no-bike'),luggage:60,bags:3});
  check(e.roomKg===118.4 && /400 lb \(181\.4 kg\)/.test(e.sentence),'LC-WT-07 400 lb: leaves 118.4 kg');
  const f=wc({max:lb(100,'bike'),bikeKg:12,luggage:30,bags:4});
  check(f.state==='over' && f.overKg===0.7 && f.sentence==='Bike and luggage are 0.7 kg over the 100 lb (45.4 kg) you entered, before counting you. Leave something at home, or check the figure you entered.','LC-WT-08 0.7 kg over, rounded up');
  const g=wc({max:lb(100,'no-bike'),bikeKg:12,luggage:46,bags:0});
  check(/^Luggage and water are/.test(g.sentence),'LC-WT-08 rider and luggage only: "Luggage and water are …"');
  check(wc({max:kg(120,'bike'),bikeKg:10,luggage:22.6,bags:2.4}).state!=='over' && app.run('weightCheck({carriedKg:1},null,1).state')==='off','LC-WT-02 no maximum: the check is off');
  // in the checklist and in print
  app.run(`S.bags=[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14}];S.bikeProfile=normaliseBikeProfile({id:'w',name:'W',maxWeight:{v:20,u:'kg',includes:'bike'},pressure:{bikeKg:12}});S.tyrePressure={...normaliseTyrePressure(S.tyrePressure),bagKg:4};`);
  const model=J('getChecklistModel()');
  check(model.warnings.some(w=>/over the 20 kg you entered/.test(w)),'LC-WT-08 the over-weight finding is in the packing checklist');
  app.run('renderPrintableChecklist()');
  check([...app.nodes.values()].some(n=>/over the 20 kg you entered/.test(n.innerHTML||'')),'LC-WT-08 and in print');
}
// [LC-WT-09] pounds query and bounds
{
  const issue=(v,u='kg')=>app.run(`maxWeightIssue({v:${v},u:'${u}',includes:'bike'})`);
  check(issue(300)==='Did you mean 300 lb (136 kg)?','LC-WT-09 300 kg asks about pounds');
  check(/20 to 400 kg/.test(issue(500)) && /20 to 400 kg/.test(issue(10)),'LC-WT-09 500 kg and 10 kg are rejected');
  check(issue(300,'lb')==='' && issue(250)==='' && issue(20)==='','LC-WT-09 300 lb, 250 kg and 20 kg pass');
}
// [LC-WT-10..13] the pop-up
const reset=()=>app.run(`S.step=4;S.bags=[{uid:1,pos:'frame',L:6}];S.bikeProfile=null;BIKE_PROFILES=[];MAX_WEIGHT_SKIPPED=false;DIALOGS.length=0;
  WEIGHT_PROMPT_BLOCKS.handoffBar=false;WEIGHT_PROMPT_BLOCKS.carriedQuestion=false;document.getElementById('maxWeightBox').classList.add('hidden');`);
(async()=>{
  reset();
  app.run(`S.bikeProfile=normaliseBikeProfile({id:'bike_a',name:'A'});BIKE_PROFILES=[S.bikeProfile];`);
  check(app.run('weightPromptDue()') && app.run('maybeAskMaxWeight()') && !get('maxWeightBox').classList.contains('hidden'),'LC-WT-10 the first Step 4 asks');
  field('mwValue','120,5');field('mwUnit','kg');field('mwIncludes','bike');
  check(await app.run('saveMaxWeight()'),'LC-WT-17 "120,5" saves');
  check(app.run('S.bikeProfile.maxWeight.v')===120.5 && app.run('S.bikeProfile.maxWeightAsked') && app.run('BIKE_PROFILES[0].maxWeight.v')===120.5 && app.run('BIKE_PROFILES[0].maxWeightAsked'),'LC-WT-17 means 120.5, set on the plan\'s bike and the saved bike');
  check(get('maxWeightBox').classList.contains('hidden') && !app.run('weightPromptDue()'),'LC-WT-10 asked once');
  app.run('restorePlan(JSON.parse(JSON.stringify(captureDraft())),true)');
  check(!app.run('weightPromptDue()'),'LC-WT-10 and not after a reload');
  app.run(`S.bikeProfile=normaliseBikeProfile({id:'bike_b',name:'B'});`);
  check(app.run('weightPromptDue()'),'LC-WT-10 another bike gets it once');
  app.run('WEIGHT_PROMPT_BLOCKS.handoffBar=true');
  check(!app.run('maybeAskMaxWeight()') && get('maxWeightBox').classList.contains('hidden'),'LC-WT-10 weightPromptBlocked() true means no pop-up');
  app.run('WEIGHT_PROMPT_BLOCKS.handoffBar=false;WEIGHT_PROMPT_BLOCKS.carriedQuestion=true');
  check(!app.run('maybeAskMaxWeight()'),'LC-WT-10 nor over a carried-over question');
  app.run('WEIGHT_PROMPT_BLOCKS.carriedQuestion=false;DIALOGS.push({root:{}})');
  check(!app.run('maybeAskMaxWeight()'),'LC-WT-10 nor over another dialog');
  app.run('DIALOGS.length=0;S.bags=[]');
  check(!app.run('weightPromptDue()') && !app.run('maybeAskMaxWeight()'),'LC-WT-10 a plan with no bags gets none');

  // Skip, and Escape counts as Skip
  reset();
  app.run(`S.bikeProfile=normaliseBikeProfile({id:'bike_c',name:'C'});BIKE_PROFILES=[S.bikeProfile];`);
  app.run('maybeAskMaxWeight()');
  const entry=app.run('DIALOGS.find(d=>d.root===document.getElementById("maxWeightBox"))');
  check(entry && app.run('DIALOGS.find(d=>d.root===document.getElementById("maxWeightBox")).onClose')===app.run('skipMaxWeight'),'LC-WT-11 Escape or closing runs Skip');
  await app.run('DIALOGS.find(d=>d.root===document.getElementById("maxWeightBox")).onClose()');
  check(app.run('S.bikeProfile.maxWeightAsked') && app.run('S.bikeProfile.maxWeight')===null && app.run('weightCheck(currentPlan()).state')==='off','LC-WT-11 Skip: asked, nothing entered, the check is off');
  const html=app.run('weightSectionHtml(currentPlan()).body'),head=JSON.parse(JSON.stringify(app.run('weightSectionHtml(currentPlan())')));
  check(/Add your bike&#39;s maximum weight|Add your bike's maximum weight/.test(html) && /maxWeightChange/.test(html),'LC-WT-11 the button opens the pop-up');
  check(head.tone==='muted' && !/zonebar|style="flex/.test(head.body) && /not entered/.test(head.head),'LC-WT-11 no range, bar or colour');
  // LC-WT-16: always shown, never green, no bar
  const states=[];
  for(const code of ["S.bikeProfile=normaliseBikeProfile({id:'x',name:'x',maxWeight:{v:200,u:'kg',includes:'bike'}})","S.bikeProfile=normaliseBikeProfile({id:'x',name:'x',maxWeight:{v:20,u:'kg',includes:'bike'},pressure:{bikeKg:15}})",'S.bikeProfile=null']){
    app.run(code);states.push(JSON.parse(JSON.stringify(app.run('weightSectionHtml(currentPlan())'))));
  }
  check(states.every(s=>s.body.includes('Planned weights are estimates; weigh yourself and the loaded bike if you are close.')),'LC-WT-16 the estimates sentence is always shown');
  check(states.every(s=>['amber','muted'].includes(s.tone)) && states[1].tone==='amber' && states[0].tone==='muted' && states.every(s=>!/zonebar/.test(s.body)),'LC-WT-16 amber or neutral, never green, no bar');
  check(/\.dot\.muted\{/.test(app.html),'LC-WT-16 the neutral dot exists');

  // No bike in the plan
  reset();
  const before=JSON.stringify(app.run('tripKitDefaults(S.nights,S.sleep,null)'));
  app.run('maybeAskMaxWeight()');field('mwValue','130');field('mwUnit','kg');field('mwIncludes','unsure');
  check(await app.run('saveMaxWeight()') && app.run('S.bikeProfile.name')==='My bike' && app.run('BIKE_PROFILES.length')===0,'LC-WT-12 Save creates "My bike" for this plan only');
  check(JSON.stringify(app.run('tripKitDefaults(S.nights,S.sleep,S.bikeProfile)'))===before,'LC-WT-12 its kit defaults equal those with no bike');
  reset();
  app.run('maybeAskMaxWeight()');
  await app.run('skipMaxWeight()');
  check(app.values.get('loadcheck:maxWeightSkipped')==='true' && !app.run('weightPromptDue()') && app.run('S.bikeProfile')===null,'LC-WT-12 Skip is remembered in loadcheck:maxWeightSkipped');

  // LC-WT-13: no rider weight anywhere
  const dump=[...app.values.entries()].map(([k,v])=>k+'='+v).join('\n');
  check(!/rider[A-Za-z]*"?\s*[:=]\s*"?\d/i.test(dump) && ![...app.values.keys()].some(k=>/rider|body/i.test(k)),'LC-WT-13 no storage key gains a rider-weight value');
  check(!/id="(mw|fitMax)[^"]*"[^>]*>[^<]*rider weight/i.test(app.html),'LC-WT-13 the pop-up never asks for it');

  // LC-WT-14: the 18 kg note
  const src=app.script,at=src.indexOf('kg of luggage and water</b>');
  const note=src.slice(at,at+900);
  check(at>0 && !/unsafe/.test(note) && !/28 kg/.test(note) && /as you entered it/.test(note) && /Plus the bike itself/.test(note),'LC-WT-14 the 18 kg note names the entered weight or "the bike itself"');

  // LC-WT-15 / 17: the bags' own weight is one value, a comma is a decimal point
  reset();
  app.run('S.tyrePressure={...normaliseTyrePressure(S.tyrePressure),bagKg:1.5}');
  check(app.run('weightSectionHtml(currentPlan()).body').includes('value="1.5"'),'LC-WT-15 the tyre helper\'s empty-luggage value is the one shown');
  check(app.run("commitBagsOwnKg('2,4')") && app.run('normaliseTyrePressure(S.tyrePressure).bagKg')===2.4,'LC-WT-17 "2,4" means 2.4');
  check(app.run('weightSectionHtml(currentPlan()).body').includes('value="2.4"') && /bagKg/.test(app.script.slice(app.script.indexOf('const PRESSURE_PLAN_INPUTS'),app.script.indexOf('const PRESSURE_PLAN_INPUTS')+200)),'LC-WT-15 both places edit this one value');
  check(!app.run("commitBagsOwnKg('60')") && !app.run("commitBagsOwnKg('abc')") && app.run('normaliseTyrePressure(S.tyrePressure).bagKg')===2.4,'LC-WT-17 out of range or not a number keeps the last value');

  // LC-WT-01: the selection fixtures hold the report-only pairs
  const dir=path.join(__dirname,'fixtures','selection');
  const fx=JSON.parse(fs.readFileSync(path.join(dir,'weight.json'),'utf8'));
  const {runFixture}=require('./fixtures/selection/steps.cjs');
  const {planKit}=require('./plan-kit.cjs');
  const kit=planKit();
  for(const f of fx){
    const states=runFixture(kit,f);
    const same=JSON.stringify(states[states.length-1])===JSON.stringify(f.expect[f.expect.length-1]);
    check(same && JSON.stringify(f.expect[0]).length>0,'LC-WT-01 fixture '+f.id+' runs');
    const reportAt=f.steps.findIndex(s=>s.report)+1;
    check(JSON.stringify(f.expect[reportAt])===JSON.stringify(f.expect[reportAt-1]),'LC-WT-01 '+f.id+': placements, summary and weights are byte-identical with and without the report-only values');
  }
  // and the packing list
  {
    const k=planKit();k.setPlan({bags:[{uid:1,pos:'frame',L:6},{uid:2,pos:'seat',L:14},{uid:3,pos:'bar',L:12}],kit:['rain','tool','tubes','pump','lock','food','stove','tent'],nights:2,sleep:'camp'});
    const list=()=>k.vm.run('JSON.stringify(getChecklistModel().items.map(r=>[r.id,r.placementLabel,r.status]))');
    const a=list();
    k.vm.run("S.bikeProfile=normaliseBikeProfile({id:'p',name:'P',maxWeight:{v:90,u:'kg',includes:'bike'},fit:{seatGapCm:15}});S.tyrePressure={...normaliseTyrePressure(S.tyrePressure),bagKg:2};");
    check(a===list(),'LC-WT-01 the packing list is byte-identical');
  }
  console.log(JSON.stringify({suite:'bike-weight',checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});
