const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
(async()=>{
  const q=appVM(),{run}=q;
  run(`
    renderBikeProfiles=()=>{};
    const qaHardware={bikeKg:12.3,wheel:'700c',rim:'hookless',rimMm:25,frontMm:45,rearMm:43,
      frontCasing:'standard',rearCasing:'reinforced',frontMinBar:1.5,frontMaxBar:4,rearMinBar:1.7,rearMaxBar:4.2};
    const qaRecord={frontBar:2,rearBar:2.2,inputKey:'{"systemKg":100.7}',source:'sram-axs',recordedAt:'2026-10-04T01:00:00.000Z'};
    const qaPressure={riderKg:75,bagKg:2,extraKg:.4,waterL:1.5,bodyLoadKg:1,method:'estimate',loadedBikeKg:25.7,
      ride:'gravel',surface:'wet',unit:'psi',record:qaRecord};
    const qaBike=normaliseBikeProfile({id:'pressure_bike',name:'Pressure bike',tyres:'tubeless',pressure:qaHardware});
    S.bikeProfile=qaBike;S.tyrePressure=normaliseTyrePressure(qaPressure);BIKE_PROFILES=[qaBike];
    const qaCaptured=captureDraft();
    const qaSetup=normaliseSetup({...qaCaptured,id:'pressure_setup',name:'Pressure trip',saved:'2026-10-04',
      predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14}});
    SETUPS=[qaSetup];
    const qaExport=exportAll();
  `);
  check(run('qaCaptured.bikeProfile.pressure!==S.bikeProfile.pressure && qaCaptured.tyrePressure.record!==S.tyrePressure.record'),'hardware and pressure records capture independent snapshots');
  check(run('JSON.stringify(normalisePressureBike(qaHardware))===JSON.stringify(qaHardware)'),'all measured tyre/rim fields and limits normalize faithfully');
  check(run('normalisePressureBike(null).bikeKg===null && normalisePressureBike(null).frontMm===null && normalisePressureBike(null).rim==="unknown"'),'absent hardware remains explicitly unknown');
  check(run('normalisePressureBike({bikeKg:"",rimMm:"",frontMm:"",frontMaxBar:""}).bikeKg===null && normalisePressureBike({frontMaxBar:""}).frontMaxBar===null'),'blank masses and limits are never interpreted as zero');
  check(run('normalisePressureBike({frontMinBar:0,rearMinBar:"0"}).frontMinBar===0 && normalisePressureBike({rearMinBar:"0"}).rearMinBar===0'),'explicit zero minimum limits are retained');
  check(run('normalisePressureBike({bikeKg:101,rimMm:4,frontMm:9,rearMm:151,frontMaxBar:16,rearMaxBar:-1}).bikeKg===null && normalisePressureBike({frontMaxBar:16}).frontMaxBar===null'),'out-of-range hardware measurements are not accepted');
  check(run('normalisePressureBike({frontMinBar:5,frontMaxBar:4}).frontMinBar===5'),'contradictory valid limits remain visible for UI validation rather than silently being swapped');
  check(run('normalisePressureBike({wheel:"<script>",rim:"bad",frontCasing:"bad"}).wheel==="unknown" && normalisePressureBike({rim:"bad"}).rim==="unknown"'),'unknown enum values fall back without executing imported data');
  check(run('normaliseTyrePressure(null).riderKg===null && normaliseTyrePressure(null).bagKg===null && normaliseTyrePressure(null).waterL===null'),'old plans use incomplete blank masses and full-cage water default');
  check(run('normaliseTyrePressure(null).extraKg===0 && normaliseTyrePressure({extraKg:"",bodyLoadKg:" "}).extraKg===0 && normaliseTyrePressure({bodyLoadKg:" "}).bodyLoadKg===0'),'missing and blank optional masses use explicit clean zero defaults');
  check(run('normaliseTyrePressure({extraKg:null,bodyLoadKg:null}).extraKg===null && normaliseTyrePressure({extraKg:null,bodyLoadKg:null}).bodyLoadKg===null'),'explicit unknown optional masses remain unknown');
  check(run('normaliseTyrePressure({bagKg:"0",waterL:"0"}).bagKg===0 && normaliseTyrePressure({waterL:"0"}).waterL===0'),'explicit zero empty luggage and empty bottle water stay valid');
  check(run('normaliseTyrePressure({riderKg:351,bagKg:51,extraKg:-1,loadedBikeKg:251,bodyLoadKg:101}).riderKg===null && normaliseTyrePressure({bagKg:51}).bagKg===null'),'invalid plan masses are bounded');
  check(run('normaliseTyrePressure({extraKg:101,bodyLoadKg:-1}).extraKg===null && normaliseTyrePressure({extraKg:101,bodyLoadKg:-1}).bodyLoadKg===null'),'invalid optional masses are not masked as zero');
  check(run('normaliseTyrePressure({method:"bad",ride:"bad",surface:"bad",unit:"bad"}).method==="estimate" && normaliseTyrePressure({ride:"bad"}).ride==="gravel"'),'unsupported pressure options use clean defaults');
  check(run('normaliseTyrePressure(qaPressure).record.frontBar===2 && normaliseTyrePressure(qaPressure).unit==="psi"'),'recorded pressures stay canonical bar while display unit is separate');
  check(run('normaliseTyrePressure({...qaPressure,record:{...qaRecord,frontBar:0}}).record===null && normaliseTyrePressure({...qaPressure,record:{...qaRecord,rearBar:16}}).record===null'),'impossible recorded pressure values are discarded');
  check(run('normaliseTyrePressure({...qaPressure,record:{...qaRecord,source:"other"}}).record===null'),'unsupported record source is not presented as SRAM');
  check(run('normaliseTyrePressure({...qaPressure,record:{...qaRecord,recordedAt:"2026-10-04"}}).record===null && normaliseTyrePressure({...qaPressure,record:{...qaRecord,recordedAt:"2026-02-31T01:00:00.000Z"}}).record===null'),'record needs valid ISO timestamp rather than ambiguous date or invalid day');
  check(run('normaliseTyrePressure({...qaPressure,record:{...qaRecord,inputKey:""}}).record===null && normaliseTyrePressure({...qaPressure,record:{...qaRecord,inputKey:"x".repeat(6001)}}).record===null'),'missing and oversized original input contexts are rejected');
  check(run('normalisePlan({...qaCaptured,tyrePressure:undefined}).tyrePressure.record===null && normalisePlan({...qaCaptured,tyrePressure:undefined}).tyrePressure.bagKg===null'),'legacy plans remain usable without a pressure helper');
  check(run('normaliseBikeProfile({id:"legacy_bike",name:"Legacy"}).pressure.frontMm===null'),'legacy reusable bikes gain blank hardware fields');
  run('S.tyrePressure={...qaPressure,extraKg:101,bodyLoadKg:-1};const qaInvalidMassPlan=captureDraft();');
  check(run('qaInvalidMassPlan.tyrePressure.extraKg===null && normalisePlan(qaInvalidMassPlan).tyrePressure.bodyLoadKg===null'),'invalid optional masses remain incomplete through capture and normalization');
  await run('importAll(JSON.stringify({draft:qaInvalidMassPlan}))');
  check(run('IMPORTED_DRAFT.tyrePressure.extraKg===null && IMPORTED_DRAFT.tyrePressure.bodyLoadKg===null'),'invalid imported optional masses remain incomplete until corrected');
  run('SETUPS=[];BIKE_PROFILES=[];S.tyrePressure=normaliseTyrePressure({riderKg:55});');
  await run('importAll(qaExport)');
  check(run('BIKE_PROFILES[0].pressure.rimMm===25 && SETUPS[0].bikeProfile.pressure.frontMaxBar===4'),'reusable and saved hardware round trip together');
  check(run('S.tyrePressure.riderKg===55 && IMPORTED_DRAFT.tyrePressure.riderKg===75 && IMPORTED_DRAFT.tyrePressure.record.frontBar===2'),'import does not overwrite current helper inputs until working plan is explicitly used');
  check(run('SETUPS[0].tyrePressure.bodyLoadKg===1 && SETUPS[0].tyrePressure.record.inputKey===qaRecord.inputKey'),'saved record and original context round trip without recalculation');
  check(JSON.parse(q.values.get('loadcheck:bikeProfiles'))[0].pressure.rearCasing==='reinforced','reusable hardware is saved durably');
  run(`
    renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};ensureClimate=()=>{};ensureRoute=()=>{};
    BIKE_PROFILES[0].pressure.frontMm=50;
    restorePlan(qaSetup,true,false);
  `);
  check(run('S.bikeProfile.pressure.frontMm===45 && S.tyrePressure.record.rearBar===2.2 && S.tyrePressure.riderKg===75'),'restoring saved trip retains its own hardware and recorded-pressure context');
  await run('BIKE_PROFILE_WRITES');
  check(JSON.parse(q.values.get('loadcheck:bikeProfile')).pressure.frontMm===45,'selected exact hardware snapshot persists for a future plan');
  const comparison=run('setupComparisonRows(qaSetup,{...qaSetup,tyrePressure:{...qaPressure,bagKg:3,record:{...qaRecord,rearBar:2.5,inputKey:"different-context"}}})');
  check(comparison.some(row=>row.name==='Tyre pressure · Empty luggage and fittings' && row.left==='2 kg' && row.right==='3 kg'),'saved comparison shows helper mass changes');
  check(comparison.some(row=>row.name==='Tyre pressure · Recorded rear' && row.left==='2.2 bar' && row.right==='2.5 bar'),'saved comparison records exact canonical pressure changes');
  check(comparison.some(row=>row.name==='Tyre pressure · Calculator inputs used' && row.left!==row.right),'different original calculator inputs are called out');
  run(`
    S.bikeProfile=qaBike;S.tyrePressure=normaliseTyrePressure({...qaPressure,method:'weighed',record:null});
    for(let i=0;i<120;i++){
      const id='x_'+String(i).padStart(3,'0')+'_'+'a'.repeat(74);
      KIT.push({id,name:'Large-kit item '+i,cat:'Person',L:.01,kg:.01,pref:['frame'],added:true});S.kit[id]=true;
    }
    const qaLargeKey=pressureInputKey();
    S.tyrePressure=normaliseTyrePressure({...S.tyrePressure,record:{...qaRecord,inputKey:qaLargeKey}});
    const qaLargePlan=captureDraft();
  `);
  check(run('pressurePreparedInputs().ready && qaLargeKey.length<=6000 && qaLargePlan.tyrePressure.record!==null'),'large valid kit has a bounded signature and preserves recorded pressures on capture');
  await run('importAll(JSON.stringify({draft:qaLargePlan}))');
  check(run('IMPORTED_DRAFT.addedKit.length===120 && IMPORTED_DRAFT.tyrePressure.record.inputKey===qaLargeKey'),'120 long-id custom items and pressure context round trip without silently dropping record');
  run(`S.custom['x_000_'+'a'.repeat(74)]={L:.01,kg:.02,rigid:0};`);
  check(run('pressureInputKey()!==qaLargeKey && pressureRecordState().stale'),'compact fingerprint detects a changed custom-item weight and marks the recorded pressure stale');
  console.log(JSON.stringify({suite:'tyre-pressure-storage',checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
