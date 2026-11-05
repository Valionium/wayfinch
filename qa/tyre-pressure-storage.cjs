'use strict';
// The tyre helper has left the bag planner (spec 7.1 item 3; sub-project 6, Task 6). Rewritten from the suite of the same name:
// the saved tyrePressure and bikeProfile.pressure stay in the data format, without UI, and survive a save and an export; a new plan
// clears the plan's; the rider's body weight is cleared everywhere it was stored. The tyre tool's own tests are in tests/unit/tools/tyre/.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {appVM,sharedStore}=require('./app-vm.cjs');
const {page:PAGE}=require('./paths.cjs');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const HARDWARE={bikeKg:12.3,wheel:'700c',rim:'hookless',rimMm:25,frontMm:45,rearMm:43,
  frontCasing:'standard',rearCasing:'reinforced',frontMinBar:1.5,frontMaxBar:4,rearMinBar:1.7,rearMaxBar:4.2};
const RECORD={frontBar:2,rearBar:2.2,inputKey:'{"systemKg":100.7}',source:'sram-axs',recordedAt:'2026-10-04T01:00:00.000Z'};
const PRESSURE={riderKg:75,bagKg:2,extraKg:.4,waterL:1.5,bodyLoadKg:1,method:'estimate',loadedBikeKg:25.7,ride:'gravel',surface:'wet',unit:'psi',record:RECORD};
const KEPT={...PRESSURE,riderKg:null};

(async()=>{
  // ---- [LC-NO-HELPER] ----
  {
    const html=fs.readFileSync(PAGE,'utf8');
    const markup=html.slice(0,html.indexOf('<script>')),script=html.slice(html.indexOf('<script>'));
    // assert.ok on booleans only: an assertion on the page's text would print the page
    check(!/axs\.sram\.com|sram(?!-axs')/i.test(html),'[LC-NO-HELPER] no SRAM link or text anywhere in the page');
    check((script.match(/sram/gi)||[]).length===2 && /source==='sram-axs'/.test(script),'[LC-NO-HELPER] "sram-axs" only as the stored record\'s source, kept by the normaliser');
    for(const id of ['pressureToolBox','pressureToolOpen','pressureToolFromCheck','tyrePressurePanel','pressureRider','pressureMethod','pressureFront','pressureRear',
      'pressureConfirmed','pressureSave','pressureCopy','pressureBagKg','bikeToolEdit','pressureEditBike'])
      check(!markup.includes('id="'+id+'"') && !script.includes("'"+id+"'"),'[LC-NO-HELPER] no markup or call site for '+id);
    for(const fn of ['renderPressureHelper','openPressureTool','closePressureTool','initialisePressureHelper','savePressureSuggestions','pressurePreparedInputs',
      'loadedSystemWeight','pressureInputKey','pressureRecordHtml','pressureHardwarePending','PRESSURE_PLAN_INPUTS','PRESSURE_BIKE_INPUTS'])
      check(!html.includes(fn),'[LC-NO-HELPER] no code: '+fn);
    check(!/\.pressure-(?:panel|check|record|status|link|total|summary)\b|#pressureToolOpen/.test(markup),'[LC-NO-HELPER] no CSS of the helper');
    const form=markup.slice(markup.indexOf('id="bikeProfileForm"'),markup.indexOf('</form>',markup.indexOf('id="bikeProfileForm"')));
    check(form.includes('id="bikeBaseKg"'),'[LC-NO-HELPER] the bike weight is still edited in Bike details');
    for(const id of ['bikeWheel','bikeRim','bikeRimMm','bikeFrontMm','bikeRearMm','bikeFrontCasing','bikeRearCasing','bikeFrontMin','bikeFrontMax','bikeRearMin','bikeRearMax'])
      check(!markup.includes('id="'+id+'"'),'[LC-NO-HELPER] the other tyre and rim fields are gone from the dialog: '+id);
    // every element the code reaches by id is still in the page (static, or made by the page's own templates)
    const ids=new Set([...html.matchAll(/\bid="([^"$]+)"/g)].map(m=>m[1])),dynamic=new Set(['routeVisuals']);
    const reached=[...new Set([...script.matchAll(/\$\('([A-Za-z0-9_-]+)'\)|getElementById\('([A-Za-z0-9_-]+)'\)/g)].map(m=>m[1]||m[2]))];
    check(reached.length>100 && reached.every(id=>ids.has(id)||dynamic.has(id)),'[LC-NO-HELPER] no call site is left for a removed element: '+reached.filter(id=>!ids.has(id)&&!dynamic.has(id)).join(', '));
    check(!/Tyre pressure/.test(script.slice(script.indexOf('const WALKTHROUGH_CARDS'),script.indexOf('let WALKTHROUGH_INDEX'))),'[LC-NO-HELPER] the walkthrough no longer points at the helper');
  }

  // ---- the data format, as before: every preserved field normalises faithfully ----
  const q=appVM(),{run}=q;
  // the values are made inside the page's own realm: an object from this one fails the page's dataObject check
  run(`var qaHardware=${JSON.stringify(HARDWARE)},qaRecord=${JSON.stringify(RECORD)},qaPressure=${JSON.stringify(PRESSURE)};`);
  run(`renderBikeProfiles=()=>{};
    const qaBike=normaliseBikeProfile({id:'pressure_bike',name:'Pressure bike',tyres:'tubeless',pressure:qaHardware});
    S.bikeProfile=qaBike;S.tyrePressure=normaliseTyrePressure(qaPressure);BIKE_PROFILES=[qaBike];DRAFT_READY=true;`);
  check(run('JSON.stringify(normalisePressureBike(qaHardware))===JSON.stringify(qaHardware)'),'all tyre/rim fields and limits normalise faithfully');
  check(run('normalisePressureBike(null).bikeKg===null && normalisePressureBike(null).frontMm===null && normalisePressureBike(null).rim==="unknown"'),'absent hardware remains explicitly unknown');
  check(run('normalisePressureBike({bikeKg:"",rimMm:"",frontMm:"",frontMaxBar:""}).bikeKg===null && normalisePressureBike({frontMaxBar:""}).frontMaxBar===null'),'blank masses and limits are never read as zero');
  check(run('normalisePressureBike({frontMinBar:0,rearMinBar:"0"}).frontMinBar===0 && normalisePressureBike({rearMinBar:"0"}).rearMinBar===0'),'explicit zero minimum limits are kept');
  check(run('normalisePressureBike({bikeKg:101,rimMm:4,frontMm:9,rearMm:151,frontMaxBar:16,rearMaxBar:-1}).bikeKg===null && normalisePressureBike({frontMaxBar:16}).frontMaxBar===null'),'out-of-range values are not accepted');
  check(run('normalisePressureBike({wheel:"<script>",rim:"bad",frontCasing:"bad"}).wheel==="unknown" && normalisePressureBike({rim:"bad"}).rim==="unknown"'),'unknown enum values fall back');
  check(run('normaliseTyrePressure(null).bagKg===null && normaliseTyrePressure(null).waterL===null && normaliseTyrePressure(null).extraKg===0'),'old plans read as blank, with clean zero defaults');
  check(run('normaliseTyrePressure({bagKg:"0",waterL:"0"}).bagKg===0 && normaliseTyrePressure({bagKg:51}).bagKg===null'),'the bags\' own weight is bounded and an explicit zero stays');
  check(run('normaliseTyrePressure(qaPressure).record.frontBar===2 && normaliseTyrePressure(qaPressure).unit==="psi"'),'a recorded pressure stays canonical bar with its display unit');
  check(run('normaliseTyrePressure({...qaPressure,record:{...qaRecord,frontBar:0}}).record===null && normaliseTyrePressure({...qaPressure,record:{...qaRecord,source:"other"}}).record===null'),'impossible or foreign records are dropped, as before');
  check(run('normalisePlan({...captureDraft(),tyrePressure:undefined}).tyrePressure.record===null'),'plans without the field stay usable');

  // ---- [LC-TYRE-KEPT] ----
  {
    const captured=JSON.parse(run('JSON.stringify(captureDraft())'));
    check(JSON.stringify(captured.tyrePressure)===JSON.stringify(KEPT),'[LC-TYRE-KEPT] a save keeps every tyrePressure field (the body weight aside)');
    check(JSON.stringify(captured.bikeProfile.pressure)===JSON.stringify(HARDWARE),'[LC-TYRE-KEPT] a save keeps bikeProfile.pressure unchanged');
    const exported=JSON.parse(run('exportAll()'));
    check(JSON.stringify(exported.draft.tyrePressure)===JSON.stringify(KEPT) && JSON.stringify(exported.draft.bikeProfile.pressure)===JSON.stringify(HARDWARE),'[LC-TYRE-KEPT] an export keeps both unchanged');
    check(JSON.stringify(exported.bikeProfiles[0].pressure)===JSON.stringify(HARDWARE),'[LC-TYRE-KEPT] the saved bike in an export keeps its tyre fields');
    check(JSON.stringify(JSON.parse(run('JSON.stringify(normalisePlan(JSON.parse(JSON.stringify(captureDraft()))))')).tyrePressure)===JSON.stringify(KEPT),'[LC-TYRE-KEPT] a read-back of the saved plan keeps them');
    // Bike details edits only the weight: the hidden tyre fields come through an edit and Use these bike details unchanged
    run('persistBikeProfileSelection=async()=>true;fillBikeProfileForm(S.bikeProfile);');
    q.nodes.get('bikeBaseKg').value='13.1';
    check(await run('applyBikeDetails()')!==false,'[LC-TYRE-KEPT] the bike applies');
    const pressure=JSON.parse(run('JSON.stringify(S.bikeProfile.pressure)'));
    check(JSON.stringify(pressure)===JSON.stringify({...HARDWARE,bikeKg:13.1}),'[LC-TYRE-KEPT] only the weight changed; every other tyre field kept');
    // a saved setup restored keeps its own copy
    run(`const qaSetup=normaliseSetup({...captureDraft(),id:'pressure_setup',name:'Pressure trip',saved:'2026-10-04',predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14}});
      renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};ensureClimate=()=>{};ensureRoute=()=>{};S.tyrePressure=normaliseTyrePressure(null);restorePlan(qaSetup,true,false);`);
    check(run('S.tyrePressure.record.rearBar===2.2 && S.tyrePressure.bagKg===2 && S.bikeProfile.pressure.frontMm===45'),'[LC-TYRE-KEPT] a restored setup keeps its own tyre data');
  }
  // Review M4: Use these bike details keeps the plan's own tyre data; the saved bike's only fills a plan that holds none
  {
    const m=appVM();
    m.run(`var qaHardware=${JSON.stringify(HARDWARE)};renderBikeProfiles=()=>{};persistBikeProfileSelection=async()=>true;DRAFT_READY=true;
      S.bikeProfile=normaliseBikeProfile({id:'bike_x',name:'X',pressure:qaHardware});
      BIKE_PROFILES=[normaliseBikeProfile({id:'bike_x',name:'X',pressure:{...qaHardware,frontMm:50,rearMm:50}})];
      fillBikeProfileForm(S.bikeProfile);`);
    m.nodes.get('bikeBaseKg').value='12.9';
    check(await m.run('applyBikeDetails()')!==false,'[LC-TYRE-KEPT] the plan\'s bike applies');
    check(m.run('S.bikeProfile.pressure.frontMm===45 && S.bikeProfile.pressure.rearMm===43 && S.bikeProfile.pressure.bikeKg===12.9'),'[LC-TYRE-KEPT] the plan keeps its own tyre data, not the saved bike\'s edited one');
    m.run(`S.bikeProfile=normaliseBikeProfile({id:'bike_x',name:'X'});fillBikeProfileForm(S.bikeProfile);`);
    m.nodes.get('bikeBaseKg').value='12.9';
    await m.run('applyBikeDetails()');
    check(m.run('S.bikeProfile.pressure.frontMm===50'),'[LC-TYRE-KEPT] a plan with none takes the saved bike\'s');
  }
  // Start a new plan: the plan's tyre data goes with the plan
  {
    const storage=sharedStore();
    const p=appVM({storage});
    p.run(`var qaPressure=${JSON.stringify(PRESSURE)};`);
    let reloaded=0;p.context.window.location.reload=()=>{reloaded++;};
    p.run(`renderBikeProfiles=()=>{};S.tyrePressure=normaliseTyrePressure(qaPressure);S.bags=[{uid:1,pos:'seat',L:10}];S.nextUid=2;DRAFT_READY=true;`);
    await p.run('flushDraft()');
    check(JSON.parse(storage.values.get('loadcheck:draft')).tyrePressure.record.frontBar===2,'the plan holds its tyre data before the reset');
    p.nodes.get('draftNew').dataset.confirm='yes';
    await p.run("$('draftNew').onclick()");
    check(reloaded===1 && storage.values.get('loadcheck:draft')==='null','[LC-TYRE-KEPT] Start a new plan clears the stored plan, its tyre data with it');
  }

  // ---- [LC-RIDER-GONE] ----
  {
    check(run('normaliseTyrePressure({riderKg:75}).riderKg===null && normaliseTyrePressure({riderKg:"80"}).riderKg===null'),'[LC-RIDER-GONE] the normaliser never keeps a body weight');
    const storage=sharedStore();
    const p=appVM({storage});
    const oldPlan={trip:{month:5,nights:2},bags:[{uid:1,pos:'seat',L:14}],kit:{},tyrePressure:{...PRESSURE,riderKg:82.5},bikeProfile:{id:'b',name:'B',pressure:HARDWARE},updatedAt:'2026-10-30T08:00:00.000Z'};
    const setups=[{id:'st1',name:'One',saved:'2026-10-01',tyrePressure:{...PRESSURE,riderKg:70}},{id:'st2',name:'Two',saved:'2026-10-02',tyrePressure:{bagKg:1}},{id:'st3',name:'Three',saved:'2026-10-03'}];
    storage.values.set('loadcheck:draft',JSON.stringify(oldPlan));
    storage.values.set('loadcheck:setups',JSON.stringify(setups));
    p.run('clearStoredRiderWeight()');
    const draft=JSON.parse(storage.values.get('loadcheck:draft'));
    check(draft.tyrePressure.riderKg===null,'[LC-RIDER-GONE] the stored plan\'s body weight is cleared at first load');
    const {updatedAt,...rest}=draft,{updatedAt:was,...before}=oldPlan;
    check(JSON.stringify(rest)===JSON.stringify({...before,tyrePressure:{...PRESSURE,riderKg:null}}),'[LC-RIDER-GONE] every other byte of the plan stays');
    check(Date.parse(updatedAt)>Date.parse(was),'[LC-RIDER-GONE] the plan gets a newer version, so an older tab does not write the weight back');
    const after=JSON.parse(storage.values.get('loadcheck:setups'));
    check(JSON.stringify(after)===JSON.stringify([{...setups[0],tyrePressure:{...PRESSURE,riderKg:null}},setups[1],setups[2]]),'[LC-RIDER-GONE] each saved setup\'s body weight is cleared, nothing else');
    check(![...storage.values.values()].some(v=>/"riderKg":\s*-?[\d"]/.test(v)),'[LC-RIDER-GONE] no stored key holds a body weight afterwards');
    const second=storage.values.get('loadcheck:draft');
    p.run('clearStoredRiderWeight()');
    check(storage.values.get('loadcheck:draft')===second,'[LC-RIDER-GONE] once cleared, a later load writes nothing');
    const html=fs.readFileSync(PAGE,'utf8'),init=html.slice(html.indexOf('/* ==== 95-init.js ==== */'));
    check(init.indexOf('clearStoredRiderWeight()')>0 && init.indexOf('clearStoredRiderWeight()')<init.indexOf('store.get(SETUP_KEY)'),'[LC-RIDER-GONE] it runs at start-up, before the plan and setups are read');
    // an old export brings no body weight back, and an export holds none
    await run('importAll(JSON.stringify({draft:{...captureDraft(),tyrePressure:{...qaPressure,riderKg:82}}}))');
    check(run('IMPORTED_DRAFT!==null && IMPORTED_DRAFT.tyrePressure.riderKg===null && IMPORTED_DRAFT.tyrePressure.bagKg===2'),'[LC-RIDER-GONE] an imported old plan carries no body weight, and keeps the rest');
    check(!/"riderKg":\s*-?\d/.test(run('exportAll()')),'[LC-RIDER-GONE] an export holds no body weight');
  }
  console.log(JSON.stringify({suite:'tyre-pressure-storage',checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
