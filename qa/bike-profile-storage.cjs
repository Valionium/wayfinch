const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
(async()=>{
  const q=appVM(),{run}=q;
  run(`
    renderBikeProfiles=()=>{};
    const qaBike=normaliseBikeProfile({id:'touring_bike',name:'Touring bike',tyres:'tubeless',frontTyre:'50-622',rearTyre:'50-622',
      valve:'presta',brakes:'hydraulic-disc',padType:'B05S',drive:'derailleur',shifting:'electronic',chainType:'12-speed compatible link',
      hangerType:'UDH',notes:'My repair supplies'});
    S.bikeProfile=qaBike;
    BIKE_PROFILES=[qaBike];
    const qaCaptured=captureDraft();
    const qaSetup=normaliseSetup({...qaCaptured,id:'bike_setup',name:'Bike trip',saved:'2026-10-04',
      predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14}});
    SETUPS=[qaSetup];
    const qaExport=exportAll();
  `);
  check(run('qaCaptured.bikeProfile!==S.bikeProfile && qaCaptured.bikeProfile.hangerType==="UDH"'),'working plan captures an independent exact component snapshot');
  check(run('JSON.parse(qaExport).bikeProfiles.length===1 && JSON.parse(qaExport).draft.bikeProfile.id==="touring_bike"'),'export includes reusable library and selected bike');
  check(run('qaSetup.bikeProfile.padType==="B05S" && qaSetup.bikeProfile.shifting==="electronic"'),'saved setup includes bike-dependent repair details');
  check(run('normalisePlan({...qaCaptured,bikeProfile:undefined}).bikeProfile===null'),'older working plans remain valid without bike profile');
  check(run('normaliseSetup({...qaSetup,bikeProfile:undefined}).bikeProfile===null'),'older saved setups remain valid without bike profile');
  check(run('normalisePlan({...qaCaptured,bikeProfile:{id:"<bad>",name:"Bad"}}).bikeProfile===null'),'invalid profile is discarded without losing the rest of the trip');
  run('BIKE_PROFILES=[];SETUPS=[];S.bikeProfile=normaliseBikeProfile({id:"working_bike",name:"Current bike",tyres:"tubes"});');
  const imported=await run('importAll(qaExport)');
  check(/Added 1 bike profiles/.test(imported) && run('BIKE_PROFILES.length===1 && SETUPS.length===1'),'bike library and setup round trip together');
  check(run('S.bikeProfile.id==="working_bike" && IMPORTED_DRAFT.bikeProfile.id==="touring_bike"'),'import stages selected-bike replacement until working plan is explicitly used');
  check(JSON.parse(q.values.get('loadcheck:bikeProfiles'))[0].padType==='B05S','imported library is saved durably');
  await run('importAll(qaExport)');
  check(run('BIKE_PROFILES.length===1 && SETUPS.length===1'),'reimporting an unchanged bike library does not duplicate it');
  run('BIKE_PROFILES[0]={...BIKE_PROFILES[0],tyres:"tubes",padType:"Original current pads"};SETUPS=[];');
  const conflict=await run('importAll(qaExport)');
  check(/changed bike profiles as imported copies/.test(conflict),'changed same-id profile is reported as an imported copy');
  check(run('BIKE_PROFILES.length===2 && BIKE_PROFILES[0].tyres==="tubes" && BIKE_PROFILES[0].padType==="Original current pads"'),'import does not overwrite an existing bike');
  check(run('BIKE_PROFILES[1].id!=="touring_bike" && BIKE_PROFILES[1].tyres==="tubeless"'),'conflicting bike gets a new library id with original imported component values');
  check(run('SETUPS[0].bikeProfile.id===BIKE_PROFILES[1].id && IMPORTED_DRAFT.bikeProfile.id===BIKE_PROFILES[1].id'),'new setup and staged draft refer to imported copy while preserving snapshots');
  await run('importAll(JSON.stringify({bikeProfiles:[qaBike]}))');
  check(run('BIKE_PROFILES.length===2'),'reimporting a changed bike reuses its prior imported copy');
  run(`
    const qaComparison=setupComparisonRows(qaSetup,{...qaSetup,bikeProfile:{...qaBike,padType:'Different pads',rearTyre:'45-622',notes:'Other repair supplies'}});
  `);
  check(run('qaComparison.filter(row=>row.name.startsWith("Bike") && row.left!==row.right).length===3'),'saved comparison identifies component and note changes');
  check(run('setupComparisonHtml(qaSetup,{...qaSetup,bikeProfile:{...qaBike,name:"<script>alert(1)</script>"}}).includes("&lt;script&gt;")'),'profile names are escaped in saved comparison');
  run(`
    renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};
    ensureClimate=()=>{};ensureRoute=()=>{};
    BIKE_PROFILES=[{...qaBike,padType:'Edited library pads'}];
    restorePlan(qaSetup,true,false);
  `);
  check(run('S.bikeProfile.padType==="B05S" && BIKE_PROFILES[0].padType==="Edited library pads"'),'restoring saved trip retains exact snapshot rather than replacing it with newer library version');
  await run('BIKE_PROFILE_WRITES');
  check(JSON.parse(q.values.get('loadcheck:bikeProfile')).padType==='B05S','restored profile selection is retained for the next plan');
  run('BIKE_PROFILES=[];');
  await run('loadBikeProfileData()');
  check(run('BIKE_PROFILES.length===2 && S.bikeProfile.padType==="B05S"'),'new session loads stored library and selected snapshot independently');
  const profilesOnly=await run('importAll(JSON.stringify({bikeProfiles:[{id:"second_bike",name:"Second bike",drive:"belt"}]}))');
  check(/Added 1 bike profiles/.test(profilesOnly) && run('BIKE_PROFILES.some(p=>p.id==="second_bike" && p.drive==="belt")'),'a profiles-only export can be imported');
  const invalid=await run('importAll(JSON.stringify({bikeProfiles:[null,{id:"<bad>"},{name:"No id"},{id:"safe_bike",name:"Safe",notes:{markup:"bad"}}]}))');
  check(/Skipped 3 invalid/.test(invalid) && run('BIKE_PROFILES.find(p=>p.id==="safe_bike").notes===""'),'malformed entries are skipped and non-text component notes stay non-executable');
  run('BIKE_PROFILES=Array.from({length:MAX_BIKE_PROFILES},(_,i)=>normaliseBikeProfile({id:"full_"+i,name:"Bike "+i}));');
  const full=await run('importAll(JSON.stringify({bikeProfiles:[{id:"over_capacity",name:"Extra bike"}]}))');
  check(/Skipped 1 bike profiles beyond/.test(full) && run('BIKE_PROFILES.length===MAX_BIKE_PROFILES && !BIKE_PROFILES.some(p=>p.id==="over_capacity")'),'full library preserves existing profiles and reports limit');
  run('BIKE_PROFILES=[];');
  const excess=await run('importAll(JSON.stringify({bikeProfiles:Array.from({length:23},(_,i)=>({id:"limit_"+i,name:"Bike "+i}))}))');
  check(/Skipped 3 bike profiles beyond/.test(excess) && run('BIKE_PROFILES.length===20'),'oversized library input is bounded before normalization');
  q.context.window.localStorage.setItem('loadcheck:bikeProfiles',JSON.stringify([{id:'same_bike',name:'First'},{id:'same_bike',name:'Duplicate'},{id:'bad id',name:'Invalid'}]));
  await run('loadBikeProfileData()');
  check(run('BIKE_PROFILES.length===1 && BIKE_PROFILES[0].name==="First"'),'stored library validation removes duplicate and unsafe ids');
  run('DRAFT_READY=true;S.nights=12;S.kitTouched={tent:true};S.bikeProfile=qaBike;');
  q.nodes.get('draftNew').dataset.confirm='yes';
  const actualSet=q.context.window.localStorage.setItem;
  q.context.window.localStorage.setItem=()=>{throw Error('Quota exceeded');};
  await q.nodes.get('draftNew').onclick();
  check(run('DRAFT_READY && S.nights===12 && S.kitTouched.tent') && /Could not clear/.test(q.nodes.get('draftText').textContent),'storage failure cancels starting new plan without losing the current trip or decisions');
  q.context.window.localStorage.setItem=actualSet;
  const libraryBeforeNewPlan=q.values.get('loadcheck:bikeProfiles');
  let reloaded=false;q.context.window.location.reload=()=>{reloaded=true;};
  await q.nodes.get('draftNew').onclick();
  check(reloaded && JSON.parse(q.values.get('loadcheck:draft'))===null,'new plan clears only working draft after selected bike is saved');
  check(JSON.parse(q.values.get('loadcheck:bikeProfile')).id==='touring_bike' && q.values.get('loadcheck:bikeProfiles')===libraryBeforeNewPlan,'new plan retains selected snapshot and reusable library');
  // [BK-STORE-01..05] frame, weight, look and geometry fields (spec 7.1 "New bike fields")
  {
    const fullBike={id:'full_bike',name:'Full',fit:{style:'compact',size:{kind:'cm',value:54},bolts:{st:'yes',dt:'no',un:'unknown'},topTubeBag:'yes',
      triangleCm:{top:51.1,seat:35,down:65},seatGapCm:21,barWidthCm:38},maxWeight:{v:120,u:'kg',includes:'bike'},maxWeightAsked:true,
      look:{colour:'#aabbcc',bars:'drop',ebike:false},
      geometry:{at:'2026-10-30T10:00:00.000Z',maker:'Maker',model:'Model',year:2024,size:'54',wheel:'700c',values:{stack_mm:{v:570,src:'table'},reach_mm:{v:390.5,src:'measured'}}}};
    // 01: a bike saved before this change gets every new field at its default
    const old=run(`JSON.stringify(normaliseBikeProfile({id:'old_bike',name:'Old',tyres:'tubes'}))`);
    const o=JSON.parse(old);
    check(o.fit===null && o.maxWeight===null && o.maxWeightAsked===false && o.look===null && o.geometry===null,'BK-STORE-01 an older bike has every new field at its default');
    // 02: every field survives save, reload, export and import, and saved setups
    run(`renderBikeProfiles=()=>{};BIKE_PROFILES=[];SETUPS=[];S.bikeProfile=normaliseBikeProfile(${JSON.stringify(fullBike)});BIKE_PROFILES=[S.bikeProfile];`);
    const same=value=>JSON.stringify(value)===JSON.stringify(JSON.parse(run('JSON.stringify(normaliseBikeProfile('+JSON.stringify(fullBike)+'))')));
    check(same(JSON.parse(run('JSON.stringify(S.bikeProfile)'))),'BK-STORE-02 normalising keeps every field');
    const exported=run('exportAll()');
    const fromExport=JSON.parse(exported).bikeProfiles[0];
    check(same(fromExport) && same(JSON.parse(exported).draft.bikeProfile),'BK-STORE-02 export carries every field');
    run('captureDraft()');
    run(`SETUPS=[normaliseSetup({...captureDraft(),id:'fit_setup',name:'Fit',saved:'2026-10-30',predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14}})]`);
    check(same(JSON.parse(run('JSON.stringify(SETUPS[0].bikeProfile)'))),'BK-STORE-02 a saved setup carries every field');
    run('BIKE_PROFILES=[];SETUPS=[];');
    await run(`importAll(${JSON.stringify(exported)})`);
    check(same(JSON.parse(run('JSON.stringify(BIKE_PROFILES[0])'))),'BK-STORE-02 import keeps every field');
    await run('BIKE_PROFILE_WRITES');
    check(same(JSON.parse(q.values.get('loadcheck:bikeProfiles'))[0]),'BK-STORE-02 the saved library keeps every field after reload');
    // 03: an invalid value drops only itself
    const bad=JSON.parse(run(`JSON.stringify(normaliseBikeProfile({...${JSON.stringify(fullBike)},
      fit:{...${JSON.stringify(fullBike)}.fit,triangleCm:{top:200,seat:35,down:65}},maxWeight:{v:500,u:'kg',includes:'bike'},
      look:{colour:'red',bars:'drop',ebike:false},geometry:{...${JSON.stringify(fullBike)}.geometry,values:{stack_mm:{v:2000,src:'table'},reach_mm:{v:390.5,src:'measured'}}}}))`));
    check(bad.fit.triangleCm===null && bad.fit.style==='compact' && bad.fit.seatGapCm===21 && bad.fit.size.value===54,'BK-STORE-03 a 200 cm side drops the whole triangle and nothing else');
    check(bad.maxWeight===null && bad.maxWeightAsked===true,'BK-STORE-03 a 500 kg maximum drops itself');
    check(bad.look.colour===null && bad.look.bars==='drop' && bad.look.ebike===false,'BK-STORE-03 the colour red drops itself');
    check(!('stack_mm' in bad.geometry.values) && bad.geometry.values.reach_mm.v===390.5 && bad.geometry.maker==='Maker','BK-STORE-03 a stack of 2,000 drops itself');
    check(run(`normaliseBikeProfile({id:'u',name:'U',unknownField:1,fit:{style:'trapeze',extra:1}}).unknownField`)===undefined,'BK-STORE-03 unknown fields are dropped');
    check(run(`normaliseBikeProfile({id:'u',fit:{style:'nonsense',size:{kind:'letter',value:'XXL'},bolts:{st:'maybe'}}}).fit`)===null,'BK-STORE-03 a block with nothing valid is stored as null');
    check(run(`normaliseBikeProfile({id:'u',maxWeight:{v:300,u:'lb',includes:'no-bike'}}).maxWeight.u`)==='lb' && run(`normaliseBikeProfile({id:'u',maxWeight:{v:10,u:'kg',includes:'bike'}}).maxWeight`)===null,'BK-STORE-03 pounds are checked after conversion');
    // 04: the format guard
    await run(`bikeStoreSet(BIKE_PROFILE_KEY,[normaliseBikeProfile(${JSON.stringify(fullBike)})])`);
    check(q.values.get('loadcheck:bikeProfilesFormat')==='2','BK-STORE-04 the format number is 2 after a write');
    q.values.delete('loadcheck:bikeProfilesFormat');
    check(await run('bikeStoreSet(BIKE_PROFILE_KEY,BIKE_PROFILES)') && q.values.get('loadcheck:bikeProfilesFormat')==='2','BK-STORE-04 a missing number means 1, and a write raises it to 2');
    q.values.set('loadcheck:bikeProfilesFormat','3');
    const before=q.values.get('loadcheck:bikeProfiles'),beforeCurrent=q.values.get('loadcheck:bikeProfile');
    check(!(await run('bikeStoreSet(BIKE_PROFILE_KEY,[])')) && !(await run('persistBikeProfileSelection()')),'BK-STORE-04 a page knowing 2 refuses to rewrite a list marked 3');
    check(q.values.get('loadcheck:bikeProfiles')===before && q.values.get('loadcheck:bikeProfile')===beforeCurrent && q.values.get('loadcheck:bikeProfilesFormat')==='3','BK-STORE-04 nothing was rewritten');
    check(run('BIKE_PROFILE_MESSAGE')==='This bike list was saved by a newer version of Load Check. Reload to edit it.','BK-STORE-04 the message is shown');
    q.values.set('loadcheck:bikeProfilesFormat','2');
    // 05: junk from an import
    run(`S.bikeProfile=normaliseBikeProfile({id:'junk',name:'Junk',fit:7});`);
    check(run('S.bikeProfile.fit')===null && run('bikeFit(S.bikeProfile).frameBag.shapes[0].L')===6 && run('bikeFit(S.bikeProfile).cages.un'),'BK-STORE-05 a number where fit belongs: today\'s values');
    run(`S.bikeProfile=normaliseBikeProfile({id:'junk',name:'Junk',fit:{size:{kind:'letter',value:500},style:'compact'}});`);
    check(run('S.bikeProfile.fit.size')===null && run('bikeFit(S.bikeProfile).frameBag.shapes[0].L')===4.5 && run('currentPlan().inUse.length')===0,'BK-STORE-05 a fit.size of 500 falls back for that field and the plan still opens');
    check(run('bikeFit({id:"x",fit:"junk"}).frameBag.shapes.length')===3 && run('bikeFit(undefined).frameBag.shapes.length')===3,'BK-STORE-05 bikeFit never throws on junk');
  }
  // Sub-project 11: suspension and rack mounts, top-level beside brakes and shifting, never inside fit
  {
    const read=raw=>JSON.parse(run(`JSON.stringify(normaliseBikeProfile(${JSON.stringify(raw)}))`));
    for(const suspension of ['none','front','full'])check(read({id:'s',suspension}).suspension===suspension,'[TB-DETAILS-READ] suspension '+suspension+' reads back');
    for(const rackMounts of ['yes','no'])check(read({id:'r',rackMounts}).rackMounts===rackMounts,'[TB-DETAILS-READ] rack mounts '+rackMounts+' read back');
    for(const odd of [{suspension:'Full'},{suspension:7},{suspension:true},{rackMounts:true},{rackMounts:'maybe'},{}]){
      const got=read({id:'o',...odd});
      check(got.suspension==='unknown' && got.rackMounts==='unknown','[TB-DETAILS-READ] '+JSON.stringify(odd)+' reads Not sure');
    }
    const plain=read({id:'p',name:'P',tyres:'tubes',fit:{style:'compact'}}),both=read({id:'p',name:'P',tyres:'tubes',fit:{style:'compact'},suspension:'full',rackMounts:'no'});
    check(JSON.stringify({...both,suspension:'unknown',rackMounts:'unknown'})===JSON.stringify(plain),'[TB-DETAILS-READ] no other field changes');
    check(!('suspension' in both.fit) && !('rackMounts' in both.fit) && JSON.stringify(run(`bikeFit(normaliseBikeProfile(${JSON.stringify(both)}))`))===JSON.stringify(run(`bikeFit(normaliseBikeProfile(${JSON.stringify(plain)}))`)),'[TB-DETAILS-READ] the two are not in fit, and bikeFit sees no difference');
    run(`renderBikeProfiles=()=>{};SETUPS=[];S.bikeProfile=normaliseBikeProfile(${JSON.stringify(both)});BIKE_PROFILES=[S.bikeProfile];`);
    const exported=JSON.parse(run('exportAll()'));
    check(exported.bikeProfiles[0].suspension==='full' && exported.bikeProfiles[0].rackMounts==='no' && exported.draft.bikeProfile.suspension==='full','[TB-DETAILS-READ] export carries both');
    run('BIKE_PROFILES=[];SETUPS=[];');
    await run(`importAll(${JSON.stringify(JSON.stringify(exported))})`);
    check(run('BIKE_PROFILES[0].suspension==="full" && BIKE_PROFILES[0].rackMounts==="no"'),'[TB-DETAILS-READ] import keeps both');
  }
  console.log(JSON.stringify({suite:'bike-profile-storage',checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
