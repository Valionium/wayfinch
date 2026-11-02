'use strict';
// Real profile helpers and checklist markup, exercised with source-level DOM
// mocks. This does not open the local page or request any external data.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),originalGet=app.context.document.getElementById;
const get=id=>{
  const node=originalGet(id);
  if(!node.uiMock){
    node.uiMock=true;const classes=new Set(id==='bikeRemovePrompt'?['hidden']:[]);
    node.classList={add(...names){names.forEach(name=>classes.add(name));},remove(...names){names.forEach(name=>classes.delete(name));},
      contains(name){return classes.has(name);},toggle(name,force){const on=force??!classes.has(name);on?classes.add(name):classes.delete(name);return on;}};
    node.focus=()=>{app.context.document.activeElement=node;};
    node.listeners=new Map();node.addEventListener=(type,handler)=>node.listeners.set(type,handler);
  }
  return node;
};
app.context.document.getElementById=get;
app.run('renderKit=()=>{};drawRig=()=>{};renderResult=()=>{};queueDraftSave=()=>{};');
const state=code=>JSON.parse(JSON.stringify(app.run(code))),field=(id,value)=>{get(id).value=value;};
let checks=0;
async function test(callback){await callback();checks++;}
async function audit(){
  await test(async()=>{
    app.run('initialiseBikeProfiles()');
    assert.equal(get('bikeSave').disabled,true);assert.equal(get('bikeName').disabled,true);
    assert.equal(await app.run('saveBikeProfile()'),false);assert.equal(state('BIKE_PROFILES').length,0);
    app.run('DRAFT_READY=true;renderBikeProfiles(true)');assert.equal(get('bikeSave').disabled,false);assert.equal(get('bikeName').value,'My bike');
  });
  await test(async()=>{
    field('bikeName','   ');let prevented=false;
    app.context.submitEvent={preventDefault(){prevented=true;}};
    assert.equal(await app.run('saveBikeProfile(submitEvent)'),false);assert.equal(prevented,true);
    assert.equal(state('BIKE_PROFILES').length,0);assert.match(get('bikeProfileStatus').textContent,/name before saving/);
    assert.equal(app.context.document.activeElement,get('bikeName'));
  });
  await test(async()=>{
    field('bikeName','Gravel bike');field('bikeTyres','tubeless');field('bikeValve','presta');field('bikeFrontTyre','40-622 (700 × 40C)');
    field('bikeRearTyre','45-622');field('bikeBrakes','hydraulic-disc');field('bikePads','L05A-RF');field('bikeDrive','derailleur');field('bikeShifting','electronic');
    field('bikeChain','12-speed exact chain');field('bikeHanger','UDH reference');field('bikeNotes','Check spare battery');
    assert.equal(await get('bikeProfileForm').onsubmit({preventDefault(){}}),true);
    const bike=state('S.bikeProfile');assert.equal(bike.name,'Gravel bike');assert.equal(bike.tyres,'tubeless');assert.equal(bike.frontTyre,'40-622 (700 × 40C)');
    assert.equal(state('BIKE_PROFILES').length,1);assert.equal(get('bikeSavedSelect').value,bike.id);
    assert.equal(get('bikeSave').textContent,'Update saved bike');
    assert.equal(JSON.parse(app.values.get('loadcheck:bikeProfiles'))[0].id,bike.id);assert.equal(JSON.parse(app.values.get('loadcheck:bikeProfile')).id,bike.id);
  });
  await test(async()=>{
    const id=state('S.bikeProfile.id');field('bikeName','Updated gravel bike');field('bikePads','Updated exact pads');
    get('bikeProfileForm').listeners.get('input')();assert.match(get('bikeProfileStatus').textContent,/Details edited/);
    assert.equal(state('S.bikeProfile.name'),'Gravel bike');
    assert.equal(await app.run('saveBikeProfile()'),true);assert.equal(state('BIKE_PROFILES').length,1);
    assert.equal(state('S.bikeProfile.id'),id);assert.equal(state('BIKE_PROFILES[0].padType'),'Updated exact pads');
    app.run("BIKE_PROFILES[0].name='Library edited separately'");assert.equal(state('S.bikeProfile.name'),'Updated gravel bike');
  });
  await test(async()=>{
    const before=state('S.bikeProfile');get('bikeNew').onclick();assert.deepEqual(state('S.bikeProfile'),before);
    assert.equal(get('bikeName').value,'My bike');assert.equal(get('bikeSavedSelect').value,'');assert.equal(state('BIKE_PROFILE_EDITOR_ID'),'');
    assert.equal(get('bikeSave').textContent,'Save bike for next time');
    field('bikeName','Belt commuter');field('bikeDrive','belt');get('bikeDrive').onchange();
    assert.equal(get('bikeChainField').classList.contains('hidden'),true);assert.equal(get('bikeHangerField').classList.contains('hidden'),true);
    assert.equal(await get('bikeProfileForm').onsubmit({preventDefault(){}}),true);assert.equal(state('BIKE_PROFILES').length,2);
  });
  await test(async()=>{
    const belt=state('S.bikeProfile'),old=state('BIKE_PROFILES[0]');field('bikeSavedSelect',old.id);get('bikeSavedSelect').onchange();
    assert.deepEqual(state('S.bikeProfile'),belt);assert.equal(get('bikeName').value,old.name);
    assert.equal(await get('bikeUseSaved').onclick(),true);assert.deepEqual(state('S.bikeProfile'),old);
    get('bikeRemove').onclick();assert.equal(get('bikeRemovePrompt').classList.contains('hidden'),false);
    assert.equal(await get('bikeClear').onclick(),true);assert.equal(state('S.bikeProfile'),null);assert.equal(state('BIKE_PROFILES').length,2);
    assert.equal(get('bikeRemovePrompt').classList.contains('hidden'),true);
    assert.equal(JSON.parse(app.values.get('loadcheck:bikeProfile')),null);
  });
  await test(async()=>{
    const saved=state('BIKE_PROFILES[0]');field('bikeSavedSelect',saved.id);get('bikeSavedSelect').onchange();await get('bikeUseSaved').onclick();
    get('bikeRemove').onclick();assert.equal(get('bikeRemovePrompt').classList.contains('hidden'),false);assert.equal(state('BIKE_PROFILES').length,2);
    assert.match(get('bikeRemoveQuestion').textContent,/Library edited separately/);
    get('bikeRemoveCancel').onclick();assert.equal(get('bikeRemovePrompt').classList.contains('hidden'),true);assert.equal(state('BIKE_PROFILES').length,2);
    get('bikeRemove').onclick();assert.equal(await get('bikeRemoveConfirm').onclick(),true);assert.equal(state('BIKE_PROFILES').length,1);
    assert.deepEqual(state('S.bikeProfile'),saved);assert.equal(get('bikeSavedSelect').value,'');
  });
  await test(async()=>{
    app.run("S.kitTouched={};chooseKitItem('plugs',false);chooseKitItem('link',true);S.qty.link=3;S.packed.link=true;S.pinned.link='frame_77';S.custom.link={L:.09,kg:.02,rigid:4};");
    const before=state('({qty:S.qty,packed:S.packed,pinned:S.pinned,custom:S.custom})');
    const belt=state('BIKE_PROFILES[0]');field('bikeSavedSelect',belt.id);get('bikeSavedSelect').onchange();await get('bikeUseSaved').onclick();
    assert.equal(app.run('S.kit.plugs'),false);assert.equal(app.run('S.kit.link'),true);assert.deepEqual(state('({qty:S.qty,packed:S.packed,pinned:S.pinned,custom:S.custom})'),before);
  });
  await test(async()=>{
    app.run("BIKE_PROFILES=Array.from({length:20},(_,i)=>normaliseBikeProfile({id:'qa_bike_'+i,name:'Bike '+i}));renderBikeProfiles(true)");
    get('bikeNew').onclick();field('bikeName','Twenty-first bike');const current=state('S.bikeProfile');
    assert.equal(await app.run('saveBikeProfile()'),false);assert.equal(state('BIKE_PROFILES').length,20);assert.deepEqual(state('S.bikeProfile'),current);assert.match(get('bikeProfileStatus').textContent,/20 saved bikes/);
    field('bikeSavedSelect','qa_bike_0');get('bikeSavedSelect').onchange();field('bikeName','Updated bike zero');
    assert.equal(await app.run('saveBikeProfile()'),true);assert.equal(state('BIKE_PROFILES').length,20);assert.equal(state('BIKE_PROFILES[0].name'),'Updated bike zero');
  });
  await test(async()=>{
    app.run('qaRealStoreSet=store.set;store.set=async()=>false');
    field('bikeName','Session bike');assert.equal(await app.run('saveBikeProfile()'),false);assert.equal(state('S.bikeProfile.name'),'Session bike');
    assert.match(get('bikeProfileStatus').textContent,/session only/);
    assert.equal(await get('bikeClear').onclick(),false);assert.equal(state('S.bikeProfile'),null);assert.match(get('bikeProfileStatus').textContent,/for this session/);
    app.run('store.set=qaRealStoreSet');
  });
  await test(async()=>{
    let release;app.context.pendingStorage=new Promise(resolve=>{release=resolve;});
    app.run('qaRealStoreSet=store.set;store.set=async()=>pendingStorage;fillBikeProfileForm(BIKE_PROFILES[0])');field('bikeName','One pending save');
    const save=app.run('saveBikeProfile()');assert.equal(app.run('BIKE_PROFILE_BUSY'),true);assert.equal(get('bikeSave').disabled,true);assert.equal(get('bikeName').disabled,true);
    assert.equal(await app.run('saveBikeProfile()'),false);assert.equal(await app.run('chooseSavedBike()'),false);assert.equal(await app.run('clearBikeProfile()'),false);assert.equal(await app.run('removeSavedBike()'),false);
    release(true);assert.equal(await save,true);assert.equal(app.run('BIKE_PROFILE_BUSY'),false);assert.equal(get('bikeSave').disabled,false);app.run('store.set=qaRealStoreSet');
  });
  await test(async()=>{
    app.run("BIKE_PROFILES=[normaliseBikeProfile({id:'bike_default_1',name:'My bike'}),normaliseBikeProfile({id:'bike_default_2',name:'My bike 2'})];fillBikeProfileForm(null)");
    assert.equal(get('bikeName').value,'My bike 3');assert.equal(app.run('BIKE_PROFILE_EDITOR_ID'),'');
  });
  await test(async()=>{
    const unsafe={id:'unsafe_bike',name:`Tour <script> & 'bike'`,tyres:'tubes',frontTyre:'40-622 <front> & 700 × 40C',rearTyre:'45-622 "rear"',valve:'presta',
      brakes:'rim',padType:'Pad <b>block</b> & "exact"',drive:'derailleur',shifting:'cable',chainType:'Chain <link> & 12-speed',hangerType:'Hanger <A> "B"',notes:'Line one <script>alert(1)</script>\nLine two & details'};
    app.context.unsafeBike=unsafe;
    app.run("S.place=null;S.place2=null;S.gpx=null;S.bags=[];S.mode='comfort';S.qty={};S.custom={};S.pinned={};S.packed={};S.kitTouched=Object.fromEntries(KIT.map(k=>[k.id,true]));S.kit=Object.fromEntries(KIT.map(k=>[k.id,k.id==='tubes']));S.qty.tubes=2;S.bikeProfile=null;qaNoBikeModel=getChecklistModel();S.bikeProfile=normaliseBikeProfile(JSON.parse(JSON.stringify(unsafeBike)));qaBikeModel=getChecklistModel();");
    const before=state('qaNoBikeModel'),after=state('qaBikeModel');assert.deepEqual(after.totals,before.totals);assert.equal(after.items[0].id,before.items[0].id);assert.equal(after.items[0].name,before.items[0].name);
    assert.equal(after.items[0].note,before.items[0].note);assert.match(after.items[0].note,/no fitting bag/);assert.match(after.items[0].bikeReference,/Front:/);
    app.run('renderPackingChecklist();renderPrintableChecklist(qaBikeModel)');
    for(const root of ['packingChecklist','printChecklist']){
      const html=get(root).innerHTML;assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<front>'));assert.ok(!html.includes('<b>block</b>'));
      for(const raw of [unsafe.name,unsafe.padType,unsafe.chainType,unsafe.hangerType,unsafe.notes]){app.context.literalTest=raw;assert.ok(html.includes(app.run('htmlEsc(literalTest)')),`${root} missing escaped reference`);}
      assert.ok(html.includes('no fitting bag'));assert.ok(html.includes('Bike reference: Front:'));assert.ok(html.includes('700 × 40C'));
    }
  });
  await test(async()=>{
    app.run('S.packed.tubes=true;CHECKLIST_UNPACKED_ONLY=true;renderPackingChecklist()');
    assert.ok(!get('packingChecklist').innerHTML.includes('data-checklist-item="tubes"'));
    assert.ok(get('packingChecklist').innerHTML.includes('Bike: Tour &lt;script&gt;'));
    assert.ok(get('printChecklist').innerHTML.includes('class="print-item-name">Spare tubes ×2'));
    assert.ok(get('printChecklist').innerHTML.includes('class="print-tick" aria-hidden="true">✓'));
  });
  await test(async()=>{
    app.run("S.bikeProfile.drive='belt';qaBeltSummary=bikeChecklistSummaryHtml(S.bikeProfile);S.bikeProfile.drive='chain-hub';qaHubSummary=bikeChecklistSummaryHtml(S.bikeProfile)");
    for(const key of ['qaBeltSummary','qaHubSummary'])assert.ok(!app.run(key).includes('Hanger &lt;A&gt;'));
    assert.ok(!app.run('qaBeltSummary').includes('Chain &lt;link&gt;'));assert.ok(app.run('qaHubSummary').includes('Chain &lt;link&gt;'));
  });
  console.log(`Bike profile UI checks passed: ${checks} cases (CRUD, manual choices, quota/storage failure, phone/print references).`);
}
audit().catch(error=>{console.error(error);process.exitCode=1;});
