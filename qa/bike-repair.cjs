// Exercise actual defaults, packing and repair findings without a local browser.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const {run,context}=appVM();context.assert=assert;
run(`
let checks=0,configurations=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const fresh=(bike,nights=3)=>{S.bikeProfile=bike;S.nights=nights;S.sleep='camp';S.mode='comfort';S.kit={};S.kitTouched={};applyTripKitDefaults();};
for(const tyres of ['unknown','tubes','tubeless','other'])
for(const drive of ['unknown','derailleur','chain-hub','belt'])
for(const brakes of ['unknown','hydraulic-disc','cable-disc','rim','other'])
for(const shifting of ['unknown','cable','electronic','none'])
for(const nights of [0,1,3,7]){
  fresh({tyres,drive,brakes,shifting},nights);configurations++;
  const selected=new Set(activeKit().map(k=>k.id));
  check(['pump','tool'].every(id=>selected.has(id)) && (tyres==='other'
    ? ['tubes','patch','levers','boot'].every(id=>!selected.has(id))
    : ['tubes','patch','levers'].every(id=>selected.has(id))),'profile keeps repair basics and chooses applicable puncture defaults');
  check(selected.has('plugs')===(tyres==='tubeless'),'plugs selected only for confirmed tubeless setup');
  check(selected.has('link')===(drive!=='belt') && selected.has('chaintl')===(drive!=='belt'),'chain repair applies to chain drives');
  check(selected.has('hanger')===(nights>=3 && (drive==='unknown' || drive==='derailleur')),'hanger follows derailleur relevance');
  check(!selected.has('lube') || drive!=='belt','belt never automatically gains chain lube');
  check(selected.has('brakecable')===(nights>=3 && brakes==='cable-disc'),'known cable disc brakes alone gain brake cable');
  check(selected.has('gearcable')===(nights>=3 && shifting==='cable'),'spare gear cable follows cable shifting');
  check(selected.has('shiftcharger')===(nights>0 && shifting==='electronic'),'electronic shifting gets overnight charging fallback');
  check(selected.has('pads')===(nights>=7),'existing brake wear threshold retained');
}
fresh({tyres:'tubeless',drive:'derailleur',brakes:'cable-disc',shifting:'electronic'});
for(const id of ['plugs','link','chaintl','hanger','lube','brakecable','gearcable','shiftcharger'])chooseKitItem(id,true);
S.qty.tubes=4;S.bikeProfile={tyres:'tubes',drive:'belt',brakes:'hydraulic-disc',shifting:'none'};S.nights=0;applyTripKitDefaults();
check(['plugs','link','chaintl','hanger','lube','brakecable','gearcable','shiftcharger'].every(id=>S.kit[id]),'explicit kit choices survive every incompatible profile transition');
check(S.qty.tubes===4,'profile never changes deliberate tube quantity');
for(const id of ['plugs','link','chaintl','hanger','brakecable','gearcable','shiftcharger'])chooseKitItem(id,false);
S.bikeProfile={tyres:'tubeless',drive:'derailleur',brakes:'cable-disc',shifting:'electronic'};S.nights=10;applyTripKitDefaults();
check(['plugs','link','chaintl','hanger','brakecable','gearcable','shiftcharger'].every(id=>!S.kit[id]),'manual exclusions remain excluded after a matching profile loads');
const missed=(bike,nights=7)=>{fresh(bike,nights);S.kit={};return audit();};
const mentions=(items,id)=>items.some(f=>f.ids.includes(id));
let findings=missed({tyres:'tubes',drive:'belt',brakes:'hydraulic-disc',shifting:'electronic'});
check(!['link','chaintl','hanger','brakecable','gearcable'].some(id=>mentions(findings.miss,id)),'belt hydraulic electronic bike has no irrelevant chain, hanger or cable warnings');
check(mentions(findings.miss,'tubes') && mentions(findings.miss,'patch') && !mentions(findings.miss,'plugs'),'tube repair warnings do not substitute tubeless plugs');
check(mentions(findings.miss,'shiftcharger'),'electronic repair list has an actionable compatible charging reminder');
S.kit.cables=true;check(mentions(audit().miss,'shiftcharger'),'phone cables do not satisfy shifting charging reminder');
S.kit.shiftcharger=true;check(!mentions(audit().miss,'shiftcharger'),'dedicated shifting power item satisfies charging reminder');
findings=missed({tyres:'tubeless',drive:'chain-hub',brakes:'rim',shifting:'cable'});
check(mentions(findings.miss,'plugs') && mentions(findings.miss,'tubes'),'tubeless requires plugs and separate tube fallback');
check(mentions(findings.miss,'link') && !mentions(findings.miss,'hanger'),'chain hub repairs retain chain items without a hanger');
check(mentions(findings.miss,'gearcable') && !mentions(findings.miss,'brakecable'),'rim brake selection does not assume cable actuation');
check(findings.miss.some(f=>f.t==='Spare rim brake blocks' && f.d.includes('rim braking surface')),'rim brakes receive holder and rim surface guidance');
findings=missed({tyres:'tubeless',drive:'derailleur',brakes:'cable-disc',shifting:'cable'});
check(mentions(findings.miss,'brakecable') && mentions(findings.miss,'gearcable'),'mechanical cables get separate actionable suggestions');
check(findings.miss.some(f=>f.t==='Spare disc brake pads' && f.d.includes('pad material allowed by your rotor')),'disc pad compatibility includes rotor restrictions');
S.kit.tubes=true;S.kit.plugs=true;
check(!audit().cut.some(f=>f.t==='Check your puncture kit' || f.ids.includes('tubes') || f.ids.includes('plugs')),'known tubeless backup is not flagged as excess');
S.bikeProfile.tyres='tubes';check(audit().cut.some(f=>f.ids.includes('plugs') && f.d.includes('inner tube')),'tubed setup explains irrelevant plugs without dropping tubes');
findings=missed(null,3);check(mentions(findings.miss,'link') && mentions(findings.miss,'hanger') && mentions(findings.miss,'tubes'),'unspecified bike retains existing conservative repair suggestions');
findings=missed({tyres:'other',drive:'belt',brakes:'other',shifting:'none'},1);
check(findings.miss.some(f=>f.t==='A puncture plan' && !f.ids.length && f.d.includes('may not apply')),'other tyre systems do not claim a guaranteed standard repair');
findings=missed({tyres:'tubes',drive:'derailleur',brakes:'hydraulic-disc',shifting:'electronic',chainType:'<chain & "link">',hangerType:'<hanger>',padType:'<pad>',frontTyre:'<front>',rearTyre:'<rear>',valve:'presta'});
check(findings.miss.every(f=>!/<(?:chain|hanger|pad|front|rear)>?/.test(f.d)),'entered compatibility references are escaped before HTML rendering');
check(findings.miss.some(f=>f.d.includes('&lt;chain &amp; &quot;link&quot;&gt;')),'chain family reference is preserved literally');
check(findings.miss.some(f=>f.d.includes('&lt;pad&gt;')) && findings.miss.some(f=>f.d.includes('&lt;hanger&gt;')),'pad and hanger references preserved literally');
check(findings.miss.some(f=>f.d.includes('&lt;front&gt;') && f.d.includes('&lt;rear&gt;')),'both tyre references are included in tube fit guidance');
check(findings.miss.some(f=>f.t==='Pump' && f.d.includes('presta')),'known valve refines pump fit advice');
fresh({tyres:'tubeless',drive:'derailleur',brakes:'hydraulic-disc',shifting:'electronic'},0);
S.kit.shiftcharger=false;check(!mentions(audit().miss,'shiftcharger'),'day ride does not score an unverified battery charge as missing kit');
check(new Set(KIT.map(k=>k.id)).size===KIT.length && new Set(KIT.map(k=>k.name.toLowerCase())).size===KIT.length,'built-in repair ids and names remain unique');
check(!CATALOGUE.some(k=>['Spare brake cable','Spare gear cable'].includes(k.n)),'cable search catalog has no duplicate built-in items');
check(KIT.filter(k=>['brakecable','gearcable','shiftcharger'].includes(k.id)).every(k=>k.L===.1 && k.kg===.05),'new optional repair estimates are bounded and consistent');
for(const id of ['brakecable','gearcable','shiftcharger']){
  const legacy={...kitById(id),id:'x_legacy_'+id,added:true};KIT.push(legacy);
  fresh({tyres:'tubes',drive:'derailleur',brakes:'cable-disc',shifting:id==='shiftcharger'?'electronic':'cable'},7);
  S.kit[legacy.id]=true;S.kitTouched[legacy.id]=true;applyTripKitDefaults();
  check(!S.kit[id] && S.kit[legacy.id],'a selected legacy catalogue spare prevents a duplicate automatic built-in');
  check(!mentions(audit().miss,id),'a selected legacy spare satisfies the matching repair suggestion');
  S.kit[legacy.id]=false;applyTripKitDefaults();check(S.kit[id],'the built-in spare can return when the legacy spare is unticked');
  chooseKitItem(id,false);S.kit[legacy.id]=true;applyTripKitDefaults();check(!S.kit[id],'legacy handling does not override an explicit built-in exclusion');
  KIT.pop();
}
console.log(JSON.stringify({status:'passed',configurations,checks}));
`);
