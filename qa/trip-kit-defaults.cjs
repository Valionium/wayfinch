// Exercise real kit selection and saved-plan functions without loading local HTML in a browser.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const {run,context,html}=appVM();
context.assert=assert;
run(`
let kitDefaultChecks=0,tripConfigurations=0;
const check=(value,message)=>{assert.ok(value,message);kitDefaultChecks++;};
const freshTrip=(nights,sleep)=>{S.nights=nights;S.sleep=sleep;S.kitTouched={};S.kit={};applyTripKitDefaults();};
for(let nights=0;nights<=30;nights++)for(const sleep of ['camp','mixed','indoor']){
  freshTrip(nights,sleep);tripConfigurations++;
  const selected=new Set(activeKit().map(k=>k.id));
  check(['tool','pump','tubes','levers','patch','link','chaintl','firstaid','phone','docs','snacks'].every(id=>selected.has(id)),'repair, safety and riding basics retained');
  check(nights>0 || ['quilt','pad','tent','base1','bibs','socks','underwear','wash','teeth','cables','headlamp'].every(id=>!selected.has(id)),'day ride omits overnight items');
  check(sleep!=='indoor' || ['quilt','pad','tent','camp','stove','pot','spork','wash','towel','headlamp'].every(id=>!selected.has(id)),'accommodation omits camping and supplied toiletries');
  check(nights===0 || sleep==='indoor' || ['quilt','pad','tent','headlamp','teeth','socks','underwear'].every(id=>selected.has(id)),'camping retains shelter, sleep, torch and personal basics');
  check(nights>2 || !selected.has('wash') && !selected.has('camp') && !selected.has('stove') && !selected.has('pot'),'short trip leaves extra clothes, wash and cooking optional');
  check(nights<7 || selected.has('detergent') && selected.has('pads'),'long trip adds laundry and brake wear supplies');
}
freshTrip(1,'camp');
check(!S.kit.wash && !S.kit.towel && !S.kit.bibs,'one-night 180 km camping trip avoids unnecessary wash kit and additional bulk');
check(S.kit.base1 && S.kit.underwear && S.kit.socks && S.kit.quilt && S.kit.tent,'one night keeps spare clothes and camping essentials');
check(chooseKitItem('wash',true) && chooseKitItem('tent',false),'user can override both a selected and unselected default');
for(let nights=0;nights<=30;nights++)for(const sleep of ['camp','mixed','indoor']){
  S.nights=nights;S.sleep=sleep;applyTripKitDefaults();
  check(S.kit.wash && !S.kit.tent,'manual choices survive every trip change');
}
check(!chooseKitItem('missing',true) && !S.kit.missing,'unknown item cannot alter the list');
freshTrip(1,'camp');
S.kit.wash=true;setKitMeasurement('wash','L','0.2');
S.nights=2;applyTripKitDefaults();
check(S.kit.wash && S.kitTouched.wash && S.custom.wash.L===.2,'custom measurements protect the item choice');
S.nights=6;S.sleep='camp';applyTripKitDefaults();
chooseKitItem('headlamp',false);
const saved=capturePlan(),normal=normalisePlan(JSON.parse(JSON.stringify(saved)));
check(normal.kitTouched.wash && normal.kitTouched.headlamp && !normal.kitTouched.tent,'export/import retains which choices are manual');
S.kit={...normal.kit};S.kitTouched={...normal.kitTouched};S.nights=1;S.sleep='camp';applyTripKitDefaults();
check(S.kit.wash && !S.kit.headlamp && !S.kit.stove,'imported manual choices stay while untouched defaults adapt');
const legacy=JSON.parse(JSON.stringify(saved));delete legacy.kitTouched;
legacy.kit.wash=false;legacy.kit.stove=true;legacy.kit.headlamp=false;
const oldPlan=normalisePlan(legacy);
check(KIT.every(k=>oldPlan.kitTouched[k.id]),'legacy saved lists treat existing selections as deliberate');
S.kit={...oldPlan.kit};S.kitTouched={...oldPlan.kitTouched};S.nights=1;S.sleep='camp';applyTripKitDefaults();
check(!S.kit.wash && S.kit.stove && !S.kit.headlamp,'legacy list is never overwritten by changed defaults');
freshTrip(1,'camp');
KIT.push({id:'x_special',name:'Own gear',cat:'Person',L:.1,kg:.1,added:true,qtyable:true});
chooseKitItem('x_special',true);S.nights=0;applyTripKitDefaults();
check(S.kit.x_special,'user-added gear is unaffected by trip defaults');
renderKit();
check($('kitStartingList').innerHTML.includes('day ride'),'day-ride summary reflects the actual trip');
S.nights=1;renderKit();
check($('kitStartingList').innerHTML.includes('1 night') && $('kitStartingList').innerHTML.includes('optional'),'short-trip summary retains optional-extra explanation in help');
console.log(JSON.stringify({status:'passed',tripConfigurations,checks:kitDefaultChecks}));
`);
assert.ok(html.includes('kitTouched:{ ...S.kitTouched }'),'manual choices included in all plan captures');
