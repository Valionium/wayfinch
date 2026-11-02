'use strict';
// Source-only checks of real weight, record, form and printable-list helpers.
// No browser rendering, pressure formula or network request is used.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),markup=app.html.slice(0,app.html.indexOf('<script>'));
const originalGet=app.context.document.getElementById;
function node(id){
  const el=originalGet(id);
  if(!el.pressureMock){
    el.pressureMock=true;const match=markup.match(new RegExp('<([a-z]+)\\b([^>]*\\bid="'+id+'"[^>]*)>','i'));
    el.tagName=match?match[1].toUpperCase():'DIV';el.validity={valid:true};el.checked=false;
    const classes=new Set(match?.[2].match(/class="([^"]*)"/)?.[1].split(/\s+/)||[]);
    el.classList={add(...keys){keys.forEach(key=>classes.add(key));},remove(...keys){keys.forEach(key=>classes.delete(key));},contains(key){return classes.has(key);},
      toggle(key,force){const present=force??!classes.has(key);present?classes.add(key):classes.delete(key);return present;}};
    el.listeners=new Map();el.addEventListener=(type,handler)=>el.listeners.set(type,handler);
    el.focus=()=>{app.context.document.activeElement=el;};
  }
  return el;
}
app.context.document.getElementById=node;
app.run('renderKit=()=>{};drawRig=()=>{};renderResult=()=>{};queueDraftSave=()=>{};DRAFT_READY=true;');
const run=code=>app.run(code),plain=code=>JSON.parse(JSON.stringify(run(code)));
function near(actual,expected,tolerance=1e-6){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);}
function field(id,value){node(id).value=String(value);}
function configure(extra=''){
  run(`S.place=null;S.place2=null;S.gpx=null;S.kit=Object.fromEntries(KIT.map(k=>[k.id,false]));S.kitTouched={};S.qty={};S.custom={};S.pinned={};S.packed={};S.bags=[];S.decks={bar:false,rack:false};S.mode='comfort';S.nights=2;S.sleep='camp';S.foodMode='all';
    S.bikeProfile=normaliseBikeProfile({id:'pressure_qa',name:'Pressure QA bike',tyres:'tubeless',frontTyre:'40-622',rearTyre:'45-622',pressure:{bikeKg:12,wheel:'700c',rim:'tubeless-crochet',rimMm:23,frontMm:40,rearMm:45,frontCasing:'standard',rearCasing:'reinforced',frontMinBar:.5,frontMaxBar:3.5,rearMinBar:.5,rearMaxBar:4}});
    S.tyrePressure=normaliseTyrePressure({riderKg:70,bagKg:1,extraKg:.5,bodyLoadKg:0,method:'estimate',ride:'gravel',surface:'dry',unit:'bar'});PRESSURE_FORM_SIGNATURE='';PRESSURE_RECORD_SIGNATURE='';PRESSURE_LAST_INPUT_KEY='';PRESSURE_MESSAGE='';${extra}`);
  for(const [id,el] of app.nodes)if(id.startsWith('pressure'))el.validity={valid:true};
  run('renderPressureHelper(true)');
}
function record(front=2,rear=2.5){
  field('pressureFront',front);field('pressureRear',rear);node('pressureConfirmed').checked=true;
  return run('savePressureSuggestions()');
}
let cases=0;
async function test(callback){await callback();cases++;}
async function audit(){
  await test(()=>{
    const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(new Set(ids).size,ids.length,'Duplicate static HTML id');
    for(const id of Object.values(plain('({...PRESSURE_BIKE_INPUTS,...PRESSURE_PLAN_INPUTS})')))assert.equal(ids.filter(value=>value===id).length,1,`Missing/duplicate pressure field ${id}`);
    for(const id of ['tyrePressurePanel','pressureConfirmed','pressureSave','pressureClear','pressureFront','pressureRear','pressureBikeInfo','pressurePreparation','pressureSaved','pressureStatus'])assert.equal(ids.filter(value=>value===id).length,1,`Missing/duplicate ${id}`);
  });
  await test(()=>{
    configure();const w=plain('loadedSystemWeight()');near(w.kitKg,0);near(w.carriedKg,1.5);near(w.loadedBikeKg,13.5);near(w.riderKg,70);near(w.systemKg,83.5);
    assert.equal(run('pressurePreparedInputs().ready'),true);
  });
  await test(()=>{
    configure("S.kit.tubes=true;S.qty.tubes=3;S.custom.tubes={L:.2,kg:.3,rigid:0};S.kit.food=true;S.custom.food={L:.3,kg:.4,rigid:0};S.kit.water=true;S.custom.water={L:1.5,kg:1.5,rigid:0};S.bags=[{uid:99,pos:'bottle',slot:'st',L:.75},{uid:100,pos:'bottleU',slot:'un',L:.5}]");
    const w=plain('loadedSystemWeight()');near(w.kitKg,.9+1.2+1.5);near(w.cageWaterL,1.25);near(w.carriedKg,6.35);near(w.systemKg,88.35);
    run('S.foodMode=1');near(run('loadedSystemWeight().kitKg'),2.8);run('S.foodMode=2');near(run('loadedSystemWeight().kitKg'),3.2);
    run('S.nights=4;S.foodMode="all"');near(run('loadedSystemWeight().kitKg'),4.4);
  });
  await test(()=>{
    configure("S.kit.water=true;S.custom.water={L:2,kg:2,rigid:0};S.bags=[{uid:99,pos:'bottle',slot:'st',L:1},{uid:100,pos:'bottleU',slot:'un',L:.5}];S.tyrePressure.waterL=.25");
    const w=plain('loadedSystemWeight()');near(w.kitKg,2);near(w.cageWaterL,.25);near(w.systemKg,85.75);
    run('S.tyrePressure.waterL=2');assert.equal(run('pressurePreparedInputs().ready'),false);assert.match(plain('pressurePreparedInputs().missing').join(' '),/bottle capacity/);
  });
  await test(()=>{
    configure("S.kit.pillow=true;S.custom.pillow={L:.5,kg:.2,rigid:0};S.kit.tubes=true;S.custom.tubes={L:.2,kg:.3,rigid:0}");near(run('loadedSystemWeight().kitKg'),.5);
    run('S.mode="light"');near(run('loadedSystemWeight().kitKg'),.3);assert.equal(run("activeKit().some(k=>k.id==='pillow')"),false);
  });
  await test(()=>{
    configure("S.kit.tubes=true;S.qty.tubes=3;S.custom.tubes={L:.2,kg:.3,rigid:0}");assert.ok(run('allocate().spill.length')>0);const before=run('loadedSystemWeight().systemKg');
    run("S.bags=[{uid:1,pos:'frame',L:5,shape:0,userL:true}]");assert.equal(run('allocate().spill.length'),0);near(run('loadedSystemWeight().systemKg'),before);
  });
  await test(()=>{
    configure("S.kit.tubes=true;S.qty.tubes=3;S.custom.tubes={L:.2,kg:.3,rigid:0};S.bags=[{uid:1,pos:'frame',L:.5,shape:2,userL:true},{uid:2,pos:'pack',L:.5,userL:true}];S.tyrePressure.bodyLoadKg=.3");
    near(run("allocate().slots.filter(s=>s.pos==='pack').reduce((n,s)=>n+weightIn(s),0)"),.3);
    const w=plain('loadedSystemWeight()');near(w.kitKg,.9);near(w.riderKg,70.3);near(w.loadedBikeKg,14.1);near(w.systemKg,84.4);
    run('S.tyrePressure.bodyLoadKg=4');assert.equal(run('loadedSystemWeight().systemKg'),null);assert.equal(run('pressurePreparedInputs().ready'),false);
  });
  await test(()=>{
    configure("S.kit.food=true;S.custom.food={L:.3,kg:.4,rigid:0};S.bags=[{uid:1,pos:'frame',L:.5,shape:2,userL:true},{uid:2,pos:'pack',L:.5,userL:true}];S.tyrePressure.bodyLoadKg=.6");
    const w=plain('loadedSystemWeight()');near(w.kitKg,1.2);near(w.carriedKg,2.7);near(w.riderKg,70.6);near(w.loadedBikeKg,14.1);near(w.systemKg,84.7);
    assert.ok(run('allocate().spill.length')>0,'Food overflow fixture');
  });
  await test(()=>{
    configure("S.tyrePressure.method='weighed';S.tyrePressure.loadedBikeKg=20;S.tyrePressure.bodyLoadKg=9;S.tyrePressure.bagKg=10;S.tyrePressure.extraKg=20;S.kit.food=true;S.bags=[{uid:99,pos:'bottle',slot:'st',L:1}]");
    const w=plain('loadedSystemWeight()');near(w.loadedBikeKg,20);near(w.riderKg,70);near(w.systemKg,90);
    run('S.custom.food={L:1,kg:100,rigid:0};S.tyrePressure.waterL=90');near(run('loadedSystemWeight().systemKg'),90);
  });
  await test(()=>{
    configure('S.tyrePressure=normaliseTyrePressure(null);S.bikeProfile=null');assert.equal(run('pressurePreparedInputs().ready'),false);assert.equal(run('loadedSystemWeight().systemKg'),null);
    configure('S.bikeProfile.pressure.frontCasing="unknown"');assert.equal(run('pressurePreparedInputs().ready'),false);
    configure('S.tyrePressure.riderKg=230');assert.equal(run('pressurePreparedInputs().ready'),false);
  });
  await test(()=>{
    configure('S.bikeProfile.pressure.frontMinBar=4;S.bikeProfile.pressure.frontMaxBar=3.5');assert.equal(run('pressurePreparedInputs().ready'),false);
    configure('S.bikeProfile.pressure.frontMaxBar=null');assert.equal(run('pressurePreparedInputs().ready'),true);assert.equal(record(),false);assert.match(node('pressureStatus').textContent,/maximum tyre\/rim limits/);
  });
  await test(()=>{
    configure("S.bikeProfile.pressure.wheel='29'");assert.equal(run('pressurePreparedInputs().ready'),false);
    run("S.tyrePressure.ride='xc';S.bikeProfile.pressure.frontMm=60.96;S.bikeProfile.pressure.rearMm=63.5");assert.equal(run('pressurePreparedInputs().ready'),true);assert.match(run('pressurePreparedInputs().text'),/2\.4 inch \(60\.96 mm\)/);
  });
  await test(()=>{
    configure("S.kit.tubes=true;S.custom.tubes={L:.2,kg:.3,rigid:0}");const before=run('pressureInputKey()');
    run("S.bikeProfile.name='Renamed bike';S.bikeProfile.padType='Different pad reference';S.pendingSaveName='Renamed plan';S.packed.tubes=true");assert.equal(run('pressureInputKey()'),before);
    run('S.qty.tubes=2');assert.notEqual(run('pressureInputKey()'),before);run('S.qty.tubes=1;S.bikeProfile.pressure.frontMm=42');assert.notEqual(run('pressureInputKey()'),before);
  });
  await test(()=>{
    configure("S.tyrePressure.method='weighed';S.tyrePressure.loadedBikeKg=20");assert.equal(record(),true);assert.equal(run('pressureRecordState().stale'),false);
    run('S.kit.food=true;S.custom.food={L:1,kg:4,rigid:0}');near(run('loadedSystemWeight().systemKg'),90);assert.equal(run('pressureRecordState().stale'),true);
  });
  await test(()=>{
    configure();field('pressureFront',2);field('pressureRear',2.5);node('pressureConfirmed').checked=false;assert.equal(run('savePressureSuggestions()'),false);
    for(const front of ['',0,-1,'Infinity','NaN','2x',16,4]){field('pressureFront',front);node('pressureConfirmed').checked=true;assert.equal(run('savePressureSuggestions()'),false,`Accepted invalid/unsafe front ${front}`);assert.equal(run('normaliseTyrePressure(S.tyrePressure).record'),null);}
    field('pressureFront',2);field('pressureRear',.4);node('pressureConfirmed').checked=true;assert.equal(run('savePressureSuggestions()'),false);
    assert.equal(record(),true);assert.equal(run('pressureRecordState().stale'),false);near(run('S.tyrePressure.record.frontBar'),2);
  });
  await test(()=>{
    for(const [id,value] of [['pressureExtraKg',101],['pressureBodyKg',-1],['pressureBagKg','not a number']]){
      configure();const before=plain('S.tyrePressure');field(id,value);node('pressureConfirmed').checked=true;
      assert.equal(run('changePressureInputs()'),false);assert.deepEqual(plain('S.tyrePressure'),before);assert.equal(node('pressureConfirmed').checked,false);assert.equal(node('pressureCopy').disabled,true);
      field('pressureFront',2);field('pressureRear',2.5);node('pressureConfirmed').checked=true;assert.equal(run('savePressureSuggestions()'),false);assert.match(node('pressureStatus').textContent,/Correct the/);
    }
    configure();node('pressureExtraKg').validity={valid:false,badInput:true};field('pressureExtraKg','');assert.equal(run('changePressureInputs()'),false);
  });
  await test(()=>{
    configure("S.tyrePressure.record={frontBar:7,rearBar:2,inputKey:pressureInputKey(),source:'sram-axs',recordedAt:'2026-10-05T10:00:00.000Z'}");
    assert.equal(run('pressureRecordState().stale'),true);assert.match(run('pressureRecordState().limitIssue'),/outside/);assert.match(run('pressureRecordHtml()'),/Do not use it/);
  });
  await test(()=>{
    configure();assert.equal(record(3.5,4),true);const key=run('pressureInputKey()');
    field('pressureUnit','psi');app.context.unitEvent={target:{id:'pressureUnit'}};run('changePressureInputs(unitEvent)');
    near(Number(node('pressureFront').value),3.5*run('PRESSURE_PSI_PER_BAR'),1e-6);assert.equal(run('pressureInputKey()'),key);assert.equal(run('pressureRecordState().stale'),false);
    node('pressureConfirmed').checked=true;assert.equal(run('savePressureSuggestions()'),true);near(run('S.tyrePressure.record.frontBar'),3.5,1e-6);
    field('pressureUnit','bar');run('changePressureInputs(unitEvent)');node('pressureConfirmed').checked=true;assert.equal(run('savePressureSuggestions()'),true);near(run('S.tyrePressure.record.rearBar'),4,1e-6);
  });
  await test(()=>{
    configure('S.bikeProfile.pressure.frontMinBar=.1;S.bikeProfile.pressure.rearMinBar=.1;S.bikeProfile.pressure.frontMaxBar=15;S.bikeProfile.pressure.rearMaxBar=15');
    assert.equal(record(.1,15),true);field('pressureUnit','psi');run('changePressureInputs({target:{id:"pressureUnit"}})');node('pressureConfirmed').checked=true;
    assert.equal(run('savePressureSuggestions()'),true);near(run('S.tyrePressure.record.frontBar'),.1);near(run('S.tyrePressure.record.rearBar'),15);assert.equal(run('pressureRecordState().stale'),false);
    field('pressureUnit','bar');run('changePressureInputs({target:{id:"pressureUnit"}})');node('pressureConfirmed').checked=true;assert.equal(run('savePressureSuggestions()'),true);
    near(run('S.tyrePressure.record.frontBar'),.1);near(run('S.tyrePressure.record.rearBar'),15);
  });
  await test(()=>{
    configure("S.kit.tubes=true;S.custom.tubes={L:.2,kg:.3,rigid:0}");node('pressureConfirmed').checked=true;
    run("S.bikeProfile.name='Only rename';S.packed.tubes=true;renderPressureHelper()");assert.equal(node('pressureConfirmed').checked,true);
    run('S.qty.tubes=2;renderPressureHelper()');assert.equal(node('pressureConfirmed').checked,false);
  });
  await test(()=>{
    configure("S.bikeProfile.name='Bike <script> & \"quoted\"';S.bikeProfile.notes='Notes <b>literal</b> & details';S.kit.tubes=true;S.custom.tubes={L:.2,kg:.3,rigid:0}");
    app.context.navigator.onLine=false;assert.equal(record(),true);run('renderPressureHelper();renderPackingChecklist();renderPrintableChecklist()');
    for(const id of ['pressureBikeInfo','packingChecklist','printChecklist']){const html=node(id).innerHTML;assert.ok(!html.includes('<script>'));assert.ok(html.includes('Bike &lt;script&gt; &amp; &quot;quoted&quot;'));}
    for(const id of ['packingChecklist','printChecklist'])assert.match(node(id).innerHTML,/Recorded SRAM starting pressures/);
    run('S.custom.tubes.kg=.8;renderPackingChecklist();renderPrintableChecklist()');assert.match(node('printChecklist').innerHTML,/review needed/);assert.match(node('printChecklist').innerHTML,/load or bike inputs/);
  });
  await test(()=>{
    configure();run('initialisePressureHelper()');assert.equal(record(),true);const weights=plain('({...S.tyrePressure,record:null})');node('pressureClear').onclick();
    assert.equal(run('S.tyrePressure.record'),null);assert.deepEqual(plain('({...S.tyrePressure,record:null})'),weights);assert.equal(node('pressureClear').disabled,true);
    run('DRAFT_READY=false;renderPressureHelper()');assert.equal(node('pressureSave').disabled,true);assert.equal(run('savePressureSuggestions()'),false);run('DRAFT_READY=true');
  });
  console.log(`Tyre pressure checks passed: ${cases} cases (real mass accounting, fingerprints, limits, units, UI, print/offline markup).`);
}
audit().catch(error=>{console.error(error);process.exitCode=1;});
