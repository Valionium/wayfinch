'use strict';
// Source-level checks only. This harness does not render the local app in a browser.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),markup=app.html.slice(0,app.html.indexOf('<script>'));
const originalGet=app.context.document.getElementById;
function node(id){
  const el=originalGet(id);if(el.toolMock)return el;
  el.toolMock=true;el.isConnected=true;el.validity={valid:true};el.checked=false;
  let inputValue=String(el.value??'');
  Object.defineProperty(el,'value',{get(){return inputValue;},set(value){inputValue=String(value??'');},configurable:true});
  const match=markup.match(new RegExp('<([a-z]+)\\b([^>]*\\bid="'+id+'"[^>]*)>','i'));
  el.tagName=match?match[1].toUpperCase():'DIV';
  const classes=new Set(match?.[2].match(/class="([^"]*)"/)?.[1].split(/\s+/)||[]),attrs=new Map([['id',id]]);
  el.classList={add(...keys){keys.forEach(key=>classes.add(key));},remove(...keys){keys.forEach(key=>classes.delete(key));},contains:key=>classes.has(key),
    toggle(key,force){const present=force??!classes.has(key);present?classes.add(key):classes.delete(key);return present;}};
  el.setAttribute=(key,value)=>{attrs.set(key,String(value));el.attributes=[...attrs].map(([name,value])=>({name,value}));};
  el.getAttribute=key=>attrs.get(key)??null;el.hasAttribute=key=>attrs.has(key);
  el.removeAttribute=key=>{attrs.delete(key);el.attributes=[...attrs].map(([name,value])=>({name,value}));};
  el.listeners=new Map();el.addEventListener=(type,handler)=>el.listeners.set(type,handler);
  el.focus=()=>{app.context.document.activeElement=el;};
  el.contains=other=>{for(let current=other;current;current=current.parentElement)if(current===el)return true;return false;};
  el.closest=selector=>{
    for(let current=el;current;current=current.parentElement){
      if(selector==='.hidden,[hidden],[inert]' && (current.classList?.contains('hidden') || current.inert))return current;
      if(selector==='details:not([open])' && current.tagName==='DETAILS' && !current.open)return current;
      if(selector==='summary' && current.tagName==='SUMMARY')return current;
    }
    return null;
  };
  el.querySelectorAll=()=>[...app.nodes.values()].filter(other=>other!==el && el.contains(other) && ['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(other.tagName));
  return el;
}
app.context.document.getElementById=node;
const box=node('pressureToolBox'),background=node('qaToolBackground');
background.inert=false;background.tagName='DIV';background.parentElement=app.context.document.body;
box.parentElement=app.context.document.body;app.context.document.body.children=[background,box];
app.context.document.body.style.overflow='';
app.context.document.removeEventListener=(type,handler)=>{if(app.events.get(type)===handler)app.events.delete(type);};
app.context.window.scrollY=380;app.context.window.scrollX=0;
let pageScrollCalls=0,copiedInputs=0;
app.context.window.scrollTo=()=>{pageScrollCalls++;};
app.context.navigator.clipboard={async writeText(){copiedInputs++;}};
const run=code=>app.run(code),plain=code=>JSON.parse(JSON.stringify(run(code)));
let checks=0;
function check(value,message){assert.ok(value,message);checks++;}
function field(id,value){const el=node(id);el.parentElement=box;el.value=String(value);}
run('renderKit=()=>{};drawRig=()=>{};renderResult=()=>{};renderClimate=()=>{};renderBags=()=>{};renderPackingChecklist=()=>{};renderPrintableChecklist=()=>{};queueDraftSave=()=>{};DRAFT_READY=true;');
function configure(){
  run(`S.place=null;S.place2=null;S.gpx=null;S.bags=[];S.step=3;
    const qaToolBike=normaliseBikeProfile({id:'tool_bike',name:'Tool bike',tyres:'tubeless',frontTyre:'40-622',rearTyre:'45-622',brakes:'hydraulic-disc',padType:'B05S',drive:'derailleur',chainType:'12 speed',notes:'Keep these repair details',
      pressure:{bikeKg:12,wheel:'700c',rim:'tubeless-crochet',rimMm:23,frontMm:40,rearMm:45,frontCasing:'standard',rearCasing:'reinforced',frontMinBar:.5,frontMaxBar:3.5,rearMinBar:.5,rearMaxBar:4}});
    S.bikeProfile=qaToolBike;BIKE_PROFILES=[normaliseBikeProfile(qaToolBike)];
    S.tyrePressure=normaliseTyrePressure({riderKg:75,loadedBikeKg:25,method:'weighed',ride:'gravel'});
    fillBikeProfileForm(S.bikeProfile);PRESSURE_FORM_SIGNATURE='';PRESSURE_RECORD_SIGNATURE='';PRESSURE_LAST_INPUT_KEY='';
    renderPressureHelper(true);`);
  for(const [id,el] of app.nodes){
    node(id);
    if(/^(?:bike|pressure)/.test(id) && !['pressureToolOpen','bikeDetailsOpen','pressureToolFromCheck','pressureToolBox'].includes(id))el.parentElement=box;
  }
}
(async()=>{
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  check(new Set(ids).size===ids.length,'moving forms into tool retains unique element ids');
  for(const id of ['pressureToolBox','pressureToolOpen','bikeDetailsOpen','pressureToolFromCheck','bikeProfileForm','tyrePressurePanel'])
    check(ids.filter(value=>value===id).length===1,'global tool includes exactly one '+id);
  configure();
  check(run('pressurePreparedInputs().ready && loadedSystemWeight().systemKg===100'),'weighed mode works with no trip, route, bags or kit setup');
  check(run('pressureHardwarePending()===false'),'matching visible hardware is not pending');
  field('bikeTyres','tubes');
  check(run('pressureHardwarePending()===true'),'changing visible tyre system is pending even when dimensions match');
  field('bikeTyres','tubeless');field('bikeFrontTyre','41-622');
  check(run('pressureHardwarePending()===true'),'changed sidewall references cannot use an older hidden tyre snapshot');
  field('bikeFrontTyre','40-622');
  const originalLibrary=run('JSON.stringify(BIKE_PROFILES)');
  field('bikeFrontMm',41);field('bikeRimMm',24);
  check(run('pressureHardwarePending()===true'),'unsaved visible hardware is identified as pending');
  run('renderPressureHelper()');
  check(node('pressureCopy').disabled,'copy is disabled for unapplied hardware');
  field('pressureFront',2);field('pressureRear',2.5);node('pressureConfirmed').checked=true;
  check(run('savePressureSuggestions()===false && S.tyrePressure.record===null'),'unapplied hardware cannot produce a record using an older hidden snapshot');
  run('initialisePressureHelper()');
  await node('pressureCopy').onclick();
  check(copiedInputs===0,'copy handler blocks unapplied hardware independently of disabled UI');
  check(await run('applyPressureBikeDetails()')!==false,'working hardware can be applied');
  check(run('S.bikeProfile.pressure.frontMm===41 && S.bikeProfile.pressure.rimMm===24'),'applying uses the hardware visible in the shared editor');
  check(run('S.bikeProfile.padType==="B05S" && S.bikeProfile.chainType==="12 speed" && S.bikeProfile.notes==="Keep these repair details"'),'applying hardware preserves current repair references');
  check(run('JSON.stringify(BIKE_PROFILES)')===originalLibrary,'applying current hardware does not overwrite saved-bike library');
  check(run('pressureHardwarePending()===false && pressurePreparedInputs().ready'),'applied working snapshot is ready without visiting Bags');
  field('pressureFront',2);field('pressureRear',2.5);node('pressureConfirmed').checked=true;
  check(run('savePressureSuggestions()')===true,'applied hardware and weighed inputs can record SRAM suggestions');
  field('bikeFrontMm',42);
  check(await run('applyPressureBikeDetails()')!==false,'further hardware change applies to working snapshot');
  check(run('S.tyrePressure.record.frontBar===2 && pressureRecordState().stale'),'hardware change preserves historical pressure values and marks them stale');
  const snapshot=plain('normalisePlan(captureDraft())');
  check(snapshot.bikeProfile.pressure.frontMm===42 && snapshot.tyrePressure.record.frontBar===2,'working hardware and recorded context remain in draft/export schema');
  const opener=node('pressureToolOpen');opener.tagName='BUTTON';opener.parentElement=background;
  app.context.document.activeElement=opener;
  field('bikeFrontMm',43);
  run('openPressureTool("pressure",document.activeElement)');
  check(!box.classList.contains('hidden') && box.getAttribute('aria-modal')==='true','global tool opens as a modal');
  check(background.inert && app.context.document.body.style.overflow==='hidden','modal prevents interaction with the background');
  check(run('S.step===3') && pageScrollCalls===0,'opening preserves the current app step and page scroll');
  check(node('bikeFrontMm').value==='43','opening preserves uncommitted editor changes');
  run('closePressureTool()');
  check(box.classList.contains('hidden') && !background.inert && app.context.document.body.style.overflow==='','closing restores page interaction');
  check(app.context.document.activeElement===opener,'closing restores focus to the opener');
  check(node('bikeFrontMm').value==='43' && run('S.bikeProfile.pressure.frontMm===42'),'closing preserves unapplied edits without silently committing them');
  run('openPressureTool("bike",document.activeElement)');
  check(node('bikeFrontMm').value==='43' && run('S.step===3'),'reopening shared editor preserves pending details and current step');
  run('closePressureTool();renderBikeProfiles(true);renderPressureHelper(true);');
  check(node('bikeFrontMm').value==='42','explicit restore sync replaces pending editor values with restored snapshot');
  run('S.bikeProfile=null;BIKE_PROFILES=Array.from({length:20},(_,i)=>normaliseBikeProfile({id:"full_tool_"+i,name:"Stored bike "+i}));fillBikeProfileForm(null);');
  const fullLibrary=run('JSON.stringify(BIKE_PROFILES)');
  field('bikeName','');field('bikeTyres','tubeless');
  const hardware={bikeBaseKg:12,bikeWheel:'700c',bikeRim:'tubeless-crochet',bikeRimMm:24,bikeFrontMm:40,bikeRearMm:45,
    bikeFrontCasing:'standard',bikeRearCasing:'reinforced',bikeFrontMin:.5,bikeFrontMax:3.5,bikeRearMin:.5,bikeRearMax:4};
  for(const [id,value] of Object.entries(hardware))field(id,value);
  check(await run('applyPressureBikeDetails()')!==false,'standalone working bike can be applied without creating a library entry');
  check(run('S.bikeProfile!==null && S.bikeProfile.name.trim().length>0 && pressurePreparedInputs().ready'),'unnamed standalone hardware receives a usable working-bike name');
  check(run('pressureHardwarePending()===false'),'blank optional sidewall references match the applied standalone snapshot');
  check(run('JSON.stringify(BIKE_PROFILES)')===fullLibrary,'full saved library does not block or change standalone working hardware');
  field('bikeFrontMin','');await run('applyPressureBikeDetails()');
  check(run('S.bikeProfile.pressure.frontMinBar===null'),'optional manufacturer minimum can be left unknown');
  field('bikeFrontMin',-1);node('bikeFrontMin').validity={valid:false};
  check(await run('applyPressureBikeDetails()')===false && run('S.bikeProfile.pressure.frontMinBar===null'),'invalid visible limit cannot overwrite the valid working snapshot');
  run('renderPressureHelper()');
  check(node('pressureCopy').disabled,'invalid live hardware blocks copying even when normalization matches an existing null');
  run('S.tyrePressure=null;S.place=null;S.place2=null;S.gpx=null;S.bags=[];openPressureTool("pressure",document.activeElement);');
  check(run('S.tyrePressure.method==="weighed"') && node('pressureMethod').value==='weighed','fresh standalone tool starts in weighed mode');
  run('closePressureTool();S.tyrePressure=normaliseTyrePressure({method:"estimate",riderKg:null,bagKg:null,loadedBikeKg:null});openPressureTool("pressure",document.activeElement);');
  check(run('S.tyrePressure.method==="estimate"') && node('pressureMethod').value==='estimate','reopening preserves a deliberately chosen estimate mode even with blank masses');
  run('closePressureTool();');
  console.log(JSON.stringify({suite:'pressure-tool',checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
