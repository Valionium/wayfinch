'use strict';
// Bike details dialog (spec 3.7, 7.1, 7.4): sections, openers, validation sentences, comparison, wording, decimal commas.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),originalGet=app.context.document.getElementById;
const get=id=>{
  const node=originalGet(id);
  if(!node.uiMock){
    node.uiMock=true;const classes=new Set(id==='bikeDetailsBox'||id==='bikeRemovePrompt'?['hidden']:[]);
    node.classList={add(...n){n.forEach(x=>classes.add(x));},remove(...n){n.forEach(x=>classes.delete(x));},
      contains(n){return classes.has(n);},toggle(n,f){const on=f??!classes.has(n);on?classes.add(n):classes.delete(n);return on;}};
    node.focus=()=>{app.context.document.activeElement=node;};
  }
  return node;
};
app.context.document.getElementById=get;app.context.document.removeEventListener=()=>{};
app.run('renderKit=()=>{};drawRig=()=>{};renderResult=()=>{};queueDraftSave=()=>{};renderBikeProfiles=()=>{};closeBagPop=()=>{};');
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const html=app.html;
const field=(id,value)=>{get(id).value=value;};
const issue=()=>app.run('fitFieldsIssue()');
const reset=()=>{['fitSizeNumber','fitTriTop','fitTriSeat','fitTriDown','fitSeatGap','fitBarWidth','fitMaxWeight'].forEach(id=>field(id,''));
  field('fitMaxUnit','kg');field('fitMaxIncludes','');field('fitSizeLetter','');field('fitSizeUnit','cm');
  ['fitBoltSt','fitBoltDt','fitBoltUn','fitTopTube'].forEach(id=>field(id,'unknown'));app.run("$('fitStyleChoices').dataset.value='unknown'");};
reset();

// [BK-UI-01] the sections
{
  const a=html.indexOf('id="bikeDetailsBox"'),b=html.indexOf('id="maxWeightBox"');
  const dlg=html.slice(a,b);
  // since the tiles (the owner's wish of 14 Nov 2026): the frame under Frame and fork, the maximum and the bike's own weight under Weights
  const weights=dlg.indexOf('id="bikeMaxWeightSection"'),own=dlg.indexOf('id="bikeWeightFields"');
  check(a>0 && a<b && dlg.includes('id="bikeFrameSection"') && weights>0 && own>weights && own<dlg.indexOf('id="bikeRepairFields"'),'BK-UI-01 Frame and fork, and Weights with the bike weight');
  // Look arrives at the launch (sub-project 6, Task 4), below the two-tap start; Geometry is still sub-project 9's.
  check(!/<h3[^>]*>\s*Geometry\b/i.test(dlg) && !/id="bikeGeometry/i.test(dlg),'BK-UI-01 no Geometry section');
  check(dlg.indexOf('id="bikeLook"')>dlg.indexOf('id="bikeQuick"') && dlg.indexOf('id="bikeLook"')<dlg.indexOf('id="bikeMoreDetails"'),'BK-UI-01 Look sits below the two-tap start');
  check(html.indexOf('id="bikeProfilePanel"')>a && html.indexOf('id="bikeProfilePanel"')<b,'BK-UI-01 the editor lives in the dialog');
}
// [BK-UI-02] openers, and focus returns to the opener
{
  // The tyre helper's two openers left with it (sub-project 6, Task 6); the rig's and the Kit step's stay.
  for(const id of ['rigBikeDetails','bikeDetailsOpen']){
    const m=html.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>'));
    check(m && /bikeDetailsBox/.test(html.slice(html.indexOf('id="'+id+'"')-200,html.indexOf('id="'+id+'"')+400)),'BK-UI-02 opener '+id+' is in the page');
  }
  check(/\$\('rigBikeDetails'\)\.onclick=\(\)=>openBikeDetails/.test(app.script) && /\$\('bikeDetailsOpen'\)\.onclick=\(\)=>openBikeDetails/.test(app.script),'BK-UI-02 each opener calls openBikeDetails');
  app.run(`document.getElementById('legalBox').classList.add('hidden');document.getElementById('walkthroughBox').classList.add('hidden');`);
  const opener=get('rigBikeDetails');opener.isConnected=true;
  let error=null;
  try{app.run("openBikeDetails(document.getElementById('rigBikeDetails'))");
    check(!get('bikeDetailsBox').classList.contains('hidden'),'BK-UI-02 the dialog opens');
    app.run('closeBikeDetails()');
    check(get('bikeDetailsBox').classList.contains('hidden'),'BK-UI-02 the dialog closes');
    check(app.context.document.activeElement===opener,'BK-UI-02 focus returns to the opener');
  }catch(e){error=e;}
  if(error)throw error;
}
// [BK-UI-03] the dialog rejects what the normaliser would drop, with the spec's sentences
{
  field('fitTriTop','20');field('fitTriSeat','30');field('fitTriDown','60');
  check(issue()==="These lengths don't make a triangle. Measure inside the frame, tube to tube.",'BK-UI-03 the triangle sentence');
  field('fitTriTop','200');check(/15 to 90 cm/.test(issue()),'BK-UI-03 a named range for a 200 cm side');
  field('fitTriTop','51,1');field('fitTriSeat','35');field('fitTriDown','65');check(issue()==='','BK-UI-03 a valid triangle with a decimal comma passes');
  field('fitTriDown','');check(/all three/.test(issue()),'BK-UI-03 two lengths are not enough');
  ['fitTriTop','fitTriSeat','fitTriDown'].forEach(id=>field(id,''));
  field('fitSeatGap','2');check(/3 to 60 cm/.test(issue()),'BK-UI-03 seat gap range');field('fitSeatGap','');
  field('fitBarWidth','90');check(/10 to 80 cm/.test(issue()),'BK-UI-03 bar width range');field('fitBarWidth','');
  field('fitMaxWeight','300');field('fitMaxIncludes','bike');
  check(issue()==='Did you mean 300 lb (136 kg)?','BK-UI-03 the pounds query');
  field('fitMaxWeight','500');check(/20 to 400 kg/.test(issue()),'BK-UI-03 500 kg is rejected');
  field('fitMaxWeight','10');check(/20 to 400 kg/.test(issue()),'BK-UI-03 10 kg is rejected');
  field('fitMaxWeight','300');field('fitMaxUnit','lb');check(issue()==='','BK-UI-03 300 lb passes');
  field('fitMaxIncludes','');check(/includes the bike/.test(issue()),'BK-UI-03 the question about the bike must be answered');
  reset();
  field('fitSizeNumber','29');field('fitSizeUnit','in');check(issue()==='That looks like a wheel size, not a frame size.','BK-UI-03 a wheel size is not a frame size');
  reset();
  // what the dialog reads is exactly what the normaliser keeps
  field('fitSizeNumber','54');field('fitMaxWeight','120');field('fitMaxIncludes','no-bike');
  const read=JSON.parse(app.run('JSON.stringify(readBikeProfileEditor())'));
  check(read.fit.size.kind==='cm' && read.fit.size.value===54 && read.maxWeight.v===120 && read.maxWeightAsked===true,'BK-UI-03 the editor hands the normaliser what was typed');
  reset();
}
// [BK-UI-04] the setup comparison
{
  const rows=JSON.parse(app.run(`(()=>{
    const mk=(fit,mw)=>normaliseSetup({...captureDraft(),id:'s_'+Math.random().toString(36).slice(2),name:'S',saved:'2026-10-30',predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14},bikeProfile:{id:'c',name:'C',fit,maxWeight:mw}});
    try{return JSON.stringify(setupComparisonRows(mk({style:'compact',size:{kind:'letter',value:'M'}},{v:120,u:'kg',includes:'bike'}),mk({style:'trapeze',size:{kind:'letter',value:'L'}},{v:130,u:'kg',includes:'bike'})));}catch(e){return JSON.stringify({error:String(e)});}
  })()`));
  if(rows.error)throw new Error(rows.error);
  const row=n=>rows.find(r=>r.name===n);
  check(row('Bike · frame style').left==='Compact' && row('Bike · frame style').right==='Trapeze','BK-UI-04 frame style');
  check(row('Bike · frame size').left==='M' && row('Bike · frame size').right==='L','BK-UI-04 frame size');
  check(/120 kg/.test(row('Bike · maximum weight').left) && /130 kg/.test(row('Bike · maximum weight').right),'BK-UI-04 maximum weight');
}
// [BK-UI-05] no gender question, no banned word
{
  const a=html.indexOf('id="bikeDetailsBox"'),b=html.indexOf('id="maxWeightBox"');
  const dlg=html.slice(a,b).replace(/<[^>]+>/g,' ');
  check(!/\b(gender|male|female|woman|women|man|men|boy|girl|ladies)\b/i.test(dlg),'BK-UI-05 no gender question');
  const words=JSON.parse(app.run('JSON.stringify(Object.values(BIKE_WORDING))'));
  const banned=/\bsafe\b|\bOK\b|okay|approv|certif|guarant/i;
  check(words.every(w=>!banned.test(w.text)),'BK-UI-05 no banned word in the bike wording table');
  check(words.filter(w=>w.limit).every(w=>/you entered/.test(w.text)),'BK-UI-05 every limit sentence says "you entered"');
  check(!banned.test(dlg),'BK-UI-05 no banned word in the dialog');
}
// [BK-UI-06] decimal commas
{
  reset();
  field('fitSeatGap','21,5');field('fitBarWidth','38,5');field('fitMaxWeight','120,5');field('fitMaxIncludes','bike');field('fitTriTop','51,1');field('fitTriSeat','35,0');field('fitTriDown','65,0');
  const p=JSON.parse(app.run('JSON.stringify(readBikeProfileEditor())'));
  check(p.fit.seatGapCm===21.5 && p.fit.barWidthCm===38.5 && p.maxWeight.v===120.5 && p.fit.triangleCm.top===51.1,'BK-UI-06 "12,5" means 12.5 in every number field');
  field('fitSeatGap','1.234,5');check(/3 to 60 cm/.test(issue()),'BK-UI-06 a number that is not plain is rejected with its range, not read as 1 or 234');
  reset();
}
// Sub-project 11: Suspension and Rack mounts in More details, after Shifting, each defaulting to Not sure.
{
  const more=html.slice(html.indexOf('id="bikeMoreDetails"'),html.indexOf('</form>',html.indexOf('id="bikeProfileForm"')));
  const at=id=>more.indexOf('id="'+id+'"');
  const options=id=>{const m=more.match(new RegExp('<select id="'+id+'"[^>]*>(.*?)</select>'));return m ? [...m[1].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(o=>[o[1],o[2]]) : [];};
  const labels=JSON.parse(app.run('JSON.stringify(BIKE_PROFILE_LABELS)'));
  for(const [key,id,name] of [['suspension','bikeSuspension','Suspension'],['rackMounts','bikeRackMounts','Rack mounts']]){
    check(new RegExp('<label for="'+id+'">'+name+'<select id="'+id+'"').test(more),'[TB-DETAILS-FORM] '+name+' is a select with its own label');
    check(JSON.stringify(options(id))===JSON.stringify(Object.entries(labels[key] || {})) && options(id)[0]?.[0]==='unknown' && options(id)[0]?.[1]==='Not sure','[TB-DETAILS-FORM] '+name+' offers its labels, Not sure first');
    check(at(id)>at('bikeShifting') && at('bikeShifting')>0 && at(id)<at('bikeChainField'),'[TB-DETAILS-FORM] '+name+' comes after Shifting');
    check(app.run(`BIKE_PROFILE_INPUTS.${key}`)===id,'[TB-DETAILS-FORM] '+name+' is read and filled with the other details');
  }
  check(at('bikeSuspension')<at('bikeRackMounts'),'[TB-DETAILS-FORM] Suspension, then Rack mounts');
  const hint=more.match(/<p class="hint" id="bikeRackMountsHint">([^<]*)<\/p>/);
  check(hint && hint[1]==='Small threaded holes near the rear axle and on the seat stays, for a rack.' && /<select id="bikeRackMounts" aria-describedby="bikeRackMountsHint">/.test(more),'[TB-DETAILS-FORM] the rack-mounts hint, muted, tied to its select');
  check(!/<label for="bikeRackMounts">(?:(?!<\/label>)[\s\S])*bikeRackMountsHint"?>/.test(more.replace('aria-describedby="bikeRackMountsHint"','')),'[TB-DETAILS-FORM] the hint is not part of the label');
  app.run('fillBikeProfileForm(null)');
  check(get('bikeSuspension').value==='unknown' && get('bikeRackMounts').value==='unknown','[TB-DETAILS-FORM] a new bike starts at Not sure');
  app.run(`fillBikeProfileForm(normaliseBikeProfile({id:'filled',suspension:'full',rackMounts:'yes'}))`);
  check(get('bikeSuspension').value==='full' && get('bikeRackMounts').value==='yes','[TB-DETAILS-FORM] a saved bike fills both');
  app.run(`fillBikeProfileForm(normaliseBikeProfile({id:'older',name:'Older bike',brakes:'rim'}))`);
  check(get('bikeSuspension').value==='unknown' && get('bikeRackMounts').value==='unknown','[TB-DETAILS-FORM] a bike from before shows Not sure');
  app.run('fillBikeProfileForm(null)');
}
// Care pictures redo (owner's answers 1 and 2 of 9 November 2026): Wheel axle and, with rim brakes only, Rim brake type, after Rack mounts.
{
  const more=html.slice(html.indexOf('id="bikeMoreDetails"'),html.indexOf('</form>',html.indexOf('id="bikeProfileForm"')));
  const at=id=>more.indexOf('id="'+id+'"');
  const options=id=>{const m=more.match(new RegExp('<select id="'+id+'"[^>]*>(.*?)</select>'));return m ? [...m[1].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(o=>[o[1],o[2]]) : [];};
  const labels=JSON.parse(app.run('JSON.stringify(BIKE_PROFILE_LABELS)'));
  for(const [key,id,name] of [['axle','bikeAxle','Wheel axle'],['rimBrake','bikeRimBrake','Rim brake type']]){
    check(new RegExp('<label for="'+id+'">'+name+'<select id="'+id+'"').test(more),'[TB-DETAILS-AXLE] '+name+' is a select with its own label');
    check(JSON.stringify(options(id))===JSON.stringify(Object.entries(labels[key] || {})) && options(id)[0]?.[0]==='unknown' && options(id)[0]?.[1]==='Not sure','[TB-DETAILS-AXLE] '+name+' offers its labels, Not sure first');
    // since the tiles (the owner's wish of 14 Nov 2026): Wheel axle under Wheels and tyres after the tyre sizes, Rim brake type under
    // Brakes and gears after Brake type
    const [group,after,next]=key==='axle' ? ['bikeWheelsSection','bikeRearTyre','bikeFrameSection'] : ['bikeBrakesSection','bikeBrakes','bikeWheelsSection'];
    check(at(group)>0 && at(after)>at(group) && at(id)>at(after) && at(id)<at(next),'[TB-DETAILS-AXLE] '+name+' is under its tile, after '+after);
    check(app.run(`BIKE_PROFILE_INPUTS.${key}`)===id,'[TB-DETAILS-AXLE] '+name+' is read and filled with the other details');
  }
  const hint=more.match(/<p class="hint" id="bikeAxleHint">([^<]*)<\/p>/);
  check(hint && /thick axle/.test(hint[1]) && /<select id="bikeAxle" aria-describedby="bikeAxleHint">/.test(more),'[TB-DETAILS-AXLE] the axle hint, tied to its select');
  app.run('fillBikeProfileForm(null)');
  check(get('bikeAxle').value==='unknown' && get('bikeRimBrake').value==='unknown','[TB-DETAILS-AXLE] a new bike starts at Not sure');
  const hidden=()=>get('bikeRimBrakeField').classList.contains('hidden');
  check(hidden(),'[TB-DETAILS-AXLE] Rim brake type is hidden while the brakes are not rim brakes');
  app.run(`fillBikeProfileForm(normaliseBikeProfile({id:'filled',brakes:'rim',axle:'nuts',rimBrake:'hydraulic'}))`);
  check(get('bikeAxle').value==='nuts' && get('bikeRimBrake').value==='hydraulic' && !hidden(),'[TB-DETAILS-AXLE] a saved bike with rim brakes fills both and shows Rim brake type');
  check(/\$\('bikeBrakes'\)\.onchange=bikeProfileFieldVisibility;/.test(html),'[TB-DETAILS-AXLE] a change of brake type sets which fields show');
  get('bikeBrakes').value='hydraulic-disc';app.run('bikeProfileFieldVisibility()');
  check(hidden(),'[TB-DETAILS-AXLE] choosing disc brakes hides Rim brake type at once');
  get('bikeBrakes').value='rim';app.run('bikeProfileFieldVisibility()');
  check(!hidden(),'[TB-DETAILS-AXLE] and choosing rim brakes shows it again');
  app.run('fillBikeProfileForm(null)');
}
// The owner's wish of 14 November 2026: with hydraulic brakes, Brake fluid (mineral oil, DOT fluid, Not sure) with its hint; Brake type
// and Shifting start at Not sure, Shifting says No gears.
{
  const more=html.slice(html.indexOf('id="bikeMoreDetails"'),html.indexOf('</form>',html.indexOf('id="bikeProfileForm"')));
  const at=id=>more.indexOf('id="'+id+'"');
  const options=id=>{const m=more.match(new RegExp('<select id="'+id+'"[^>]*>(.*?)</select>'));return m ? [...m[1].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(o=>[o[1],o[2]]) : [];};
  const labels=JSON.parse(app.run('JSON.stringify(BIKE_PROFILE_LABELS)'));
  check(/<label for="bikeBrakeFluid">Brake fluid<select id="bikeBrakeFluid" aria-describedby="bikeBrakeFluidHint">/.test(more),'[TB-DETAILS-FLUID] Brake fluid is a select with its own label, tied to its hint');
  check(JSON.stringify(options('bikeBrakeFluid'))===JSON.stringify([['unknown','Not sure'],['mineral','Mineral oil'],['dot','DOT fluid']]) && JSON.stringify(Object.entries(labels.brakeFluid||{}))===JSON.stringify(options('bikeBrakeFluid')),'[TB-DETAILS-FLUID] it offers Not sure first, Mineral oil and DOT fluid');
  const hint=more.match(/<p class="hint" id="bikeBrakeFluidHint">([^<]*)<\/p>/);
  // review of PR 129, m2: the content's own place ("the fluid named on the lever or caliper"), or the manual
  check(hint && hint[1]==='It is named on the brake lever or caliper, or in the manual. Never mix them.','[TB-DETAILS-FLUID] the hint says where to find it, as the content does, and never to mix them');
  check(at('bikeBrakeFluidField')>at('bikeRimBrakeField') && at('bikeBrakeFluidField')<at('bikeChainField'),'[TB-DETAILS-FLUID] it comes after Rim brake type');
  check(app.run('BIKE_PROFILE_INPUTS.brakeFluid')==='bikeBrakeFluid','[TB-DETAILS-FLUID] it is read and filled with the other details');
  check(options('bikeBrakes')[0]?.[1]==='Not sure' && options('bikeShifting')[0]?.[1]==='Not sure','[TB-DETAILS-FLUID] Brake type and Shifting start at Not sure');
  check(JSON.stringify(options('bikeShifting'))===JSON.stringify(Object.entries(labels.shifting)) && labels.shifting.none==='No gears','[TB-DETAILS-FLUID] Shifting offers cable, electronic and No gears');
  check(JSON.stringify(options('bikeBrakes'))===JSON.stringify(Object.entries(labels.brakes)),'[TB-DETAILS-FLUID] Brake type offers its labels');
  const shown=()=>!get('bikeBrakeFluidField').classList.contains('hidden');
  app.run('fillBikeProfileForm(null)');
  check(get('bikeBrakeFluid').value==='unknown' && !shown(),'[TB-DETAILS-FLUID] a new bike starts at Not sure, the field hidden while the brakes are not told');
  const set=(brakes,rimBrake)=>{get('bikeBrakes').value=brakes;get('bikeRimBrake').value=rimBrake;app.run('bikeProfileFieldVisibility()');};
  set('hydraulic-disc','unknown');check(shown(),'[TB-DETAILS-FLUID] shown for hydraulic disc brakes');
  set('rim','hydraulic');check(shown(),'[TB-DETAILS-FLUID] shown for a hydraulic rim brake');
  for(const [b,r] of [['rim','caliper'],['rim','v-brake'],['rim','unknown'],['cable-disc','unknown'],['other','unknown'],['unknown','unknown']]){set(b,r);check(!shown(),'[TB-DETAILS-FLUID] hidden for '+b+' '+r);}
  check(/\$\('bikeRimBrake'\)\.onchange=bikeProfileFieldVisibility;/.test(html),'[TB-DETAILS-FLUID] a change of rim brake type sets which fields show');
  app.run(`fillBikeProfileForm(normaliseBikeProfile({id:'filled',brakes:'hydraulic-disc',brakeFluid:'dot'}))`);
  check(get('bikeBrakeFluid').value==='dot' && shown(),'[TB-DETAILS-FLUID] a saved bike fills it and shows it');
  app.run('fillBikeProfileForm(null)');
}
// Saving them: on the saved bike and the plan's bike, after a reload too; back to Not sure stores no field.
async function detailsSave(){
  const {appVM:tab,sharedStore}=require('./app-vm.cjs');
  const store=sharedStore();
  const stub='renderKit=()=>{};drawRig=()=>{};renderResult=()=>{};queueDraftSave=()=>{};renderBikeProfiles=()=>{};closeBagPop=()=>{};DRAFT_READY=true;';
  const a=tab({storage:store});a.run(stub);
  a.run(`S.bikeProfile=normaliseBikeProfile({id:'rack_bike',name:'Rack bike',brakes:'rim',drive:'derailleur'});BIKE_PROFILES=[S.bikeProfile];fillBikeProfileForm(S.bikeProfile);`);
  const set=(id,v)=>{a.context.document.getElementById(id).value=v;};
  set('bikeSuspension','front');set('bikeRackMounts','no');
  check(await a.run('saveBikeProfile()')===true,'[TB-DETAILS-SAVE] the bike saves');
  await a.run('BIKE_PROFILE_WRITES');
  const library=()=>JSON.parse(store.values.get('loadcheck:bikeProfiles')).find(b=>b.id==='rack_bike'),current=()=>JSON.parse(store.values.get('loadcheck:bikeProfile'));
  check(library().suspension==='front' && library().rackMounts==='no','[TB-DETAILS-SAVE] Front fork and No are on the saved bike');
  check(current().id==='rack_bike' && current().suspension==='front' && current().rackMounts==='no','[TB-DETAILS-SAVE] and on loadcheck:bikeProfile, the plan\'s bike');
  check(library().brakes==='rim' && library().drive==='derailleur' && library().fit===null,'[TB-DETAILS-SAVE] the other details stay, nothing in fit');
  const b=tab({storage:store});b.run(stub);
  await b.run('loadBikeProfileData()');
  check(b.run('BIKE_PROFILES[0].suspension==="front" && BIKE_PROFILES[0].rackMounts==="no" && S.bikeProfile.suspension==="front" && S.bikeProfile.rackMounts==="no"'),'[TB-DETAILS-SAVE] after a reload both are still there');
  b.run('fillBikeProfileForm(S.bikeProfile)');
  check(b.context.document.getElementById('bikeSuspension').value==='front' && b.context.document.getElementById('bikeRackMounts').value==='no','[TB-DETAILS-SAVE] and the form shows them');
  set('bikeSuspension','unknown');set('bikeRackMounts','unknown');
  check(await a.run('saveBikeProfile()')===true,'[TB-DETAILS-SAVE] the bike saves again');
  await a.run('BIKE_PROFILE_WRITES');
  check(![library(),current()].some(b=>'suspension' in b || 'rackMounts' in b),'[TB-DETAILS-SAVE] back to Not sure stores no field');
  set('bikeAxle','thru');set('bikeRimBrake','caliper');
  check(await a.run('saveBikeProfile()')===true,'[TB-DETAILS-AXLE] the bike saves with an axle and a rim brake type');
  await a.run('BIKE_PROFILE_WRITES');
  check(library().axle==='thru' && library().rimBrake==='caliper' && current().axle==='thru' && current().rimBrake==='caliper','[TB-DETAILS-AXLE] both are on the saved bike and on loadcheck:bikeProfile');
  set('bikeBrakes','cable-disc');
  check(await a.run('saveBikeProfile()')===true,'[TB-DETAILS-AXLE] saved again with disc brakes');
  await a.run('BIKE_PROFILE_WRITES');
  check(library().axle==='thru' && library().brakes==='cable-disc' && library().rimBrake==='caliper','[TB-DETAILS-AXLE] with disc brakes both stay as answered (the field is hidden; Bike care reads it only with rim brakes)');
  set('bikeBrakes','hydraulic-disc');set('bikeBrakeFluid','mineral');set('bikeShifting','electronic');
  check(await a.run('saveBikeProfile()')===true,'[TB-DETAILS-FLUID] the bike saves with a brake fluid');
  await a.run('BIKE_PROFILE_WRITES');
  check(library().brakeFluid==='mineral' && current().brakeFluid==='mineral' && library().shifting==='electronic','[TB-DETAILS-FLUID] it is on the saved bike and on loadcheck:bikeProfile');
  set('bikeBrakeFluid','unknown');
  check(await a.run('saveBikeProfile()')===true,'[TB-DETAILS-FLUID] saved again at Not sure');
  await a.run('BIKE_PROFILE_WRITES');
  check(![library(),current()].some(b=>'brakeFluid' in b),'[TB-DETAILS-FLUID] back to Not sure stores no field');
}
// Moved here from the retired pressure-tool-markup and pressure-tool suites (sub-project 6, Task 6): what they guarded
// besides the tyre helper. Unique ids; the bike weight in the form with its label and help; Use these bike details keeps the repair
// references and the saved-bike list, works with no name and a full list, and an invalid bike weight overwrites nothing.
(async()=>{
  await detailsSave();
  const markup=html.slice(0,html.indexOf('<script>'));
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  check(ids.length>100,'the markup was read');
  check(new Set(ids).size===ids.length,'every static id is unique');
  check(/<button[^>]*id="bikeDetailsOpen"[^>]*aria-controls="bikeDetailsBox"/.test(markup),'the bike opener controls the Bike details dialog');
  const form=markup.slice(markup.indexOf('id="bikeProfileForm"'),markup.indexOf('</form>',markup.indexOf('id="bikeProfileForm"')));
  check(form.includes('id="bikeBaseKg"') && form.includes('<label for="bikeBaseKg">'),'the bike weight sits in the form with its own label');
  const base=form.slice(form.indexOf('id="bikeBaseField"'),form.indexOf('id="bikeBaseKg"'));
  check(base.includes('data-info="What the bike weight includes"') && !/<label[^>]*>[^<]*<span data-info/.test(base),'the bike-weight help sits beside the label, not inside it');
  app.run(`S.bikeProfile=normaliseBikeProfile({id:'tool_bike',name:'Tool bike',tyres:'tubeless',frontTyre:'40-622',padType:'B05S',drive:'derailleur',chainType:'12 speed',notes:'Keep these repair details',
      pressure:{bikeKg:12,wheel:'700c',rim:'tubeless-crochet',rimMm:23,frontMm:40,rearMm:45,frontCasing:'standard',rearCasing:'reinforced',frontMinBar:.5,frontMaxBar:3.5,rearMinBar:.5,rearMaxBar:4}});
    BIKE_PROFILES=[normaliseBikeProfile(S.bikeProfile)];DRAFT_READY=true;persistBikeProfileSelection=async()=>true;fillBikeProfileForm(S.bikeProfile);`);
  const library=app.run('JSON.stringify(BIKE_PROFILES)');
  field('bikeBaseKg','12.5');
  check(await app.run('applyBikeDetails()')!==false,'the bike applies');
  check(app.run('S.bikeProfile.padType==="B05S" && S.bikeProfile.chainType==="12 speed" && S.bikeProfile.notes==="Keep these repair details" && S.bikeProfile.pressure.bikeKg===12.5'),'applying keeps the repair references and takes the weight');
  check(app.run('JSON.stringify(BIKE_PROFILES)')===library,'applying does not overwrite the saved-bike list');
  app.run('S.bikeProfile=null;BIKE_PROFILES=Array.from({length:20},(_,i)=>normaliseBikeProfile({id:"full_"+i,name:"Stored bike "+i}));fillBikeProfileForm(null);');
  const full=app.run('JSON.stringify(BIKE_PROFILES)');
  field('bikeName','');field('bikeBaseKg','11');
  check(await app.run('applyBikeDetails()')!==false && app.run('S.bikeProfile!==null && S.bikeProfile.name.trim().length>0'),'an unnamed bike applies, with a usable name');
  check(app.run('JSON.stringify(BIKE_PROFILES)')===full,'a full saved list neither blocks nor changes it');
  field('bikeBaseKg','-1');get('bikeBaseKg').validity={valid:false};
  check(await app.run('applyBikeDetails()')===false && app.run('S.bikeProfile.pressure.bikeKg')===11,'an invalid bike weight overwrites nothing');
  get('bikeBaseKg').validity={valid:true};
  console.log(JSON.stringify({suite:'bike-details-ui',checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
