/* Run with VS Code's runtime (see the release routine). Design 14: runs every fixture's steps and
   compares all fields of expect after each step, as canonical bytes. Refuses an empty set. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {planKit}=require('./plan-kit.cjs');
const dir=path.join(__dirname,'fixtures','selection');
const files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort():[];
const fixtures=files.flatMap(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
assert(fixtures.length>0,'no selection fixtures: refusing an empty set');
const {runFixture}=require('./fixtures/selection/steps.cjs');
const kit=planKit();
// [LC-FREEZE-01] Design 13: a hash over every frozen datum. Any edit to these fails here and needs the owner's approval and new fixtures.
const FROZEN_FINGERPRINT='d6269efcc251e3e5df0a818402d2a71e4413c3a398a9cbdd2afa312833ab0215';
const crypto=require('node:crypto');
const frozen=JSON.parse(kit.vm.run(`JSON.stringify({
  numbers:{PACK_EFF,COMFY_MARGIN,BULKY,FOOD_CAP},
  lists:{MUST_REACH,TIER_1,LIGHT_DROP,DECK_CLAIMS,STRAPPABLE,POS_ORDER},
  positions:Object.fromEntries(Object.entries(POSITIONS).map(([k,p])=>[k,{zone:p.zone,accessible:p.accessible,onBody:p.onBody,maxLen:p.maxLen,pairable:p.pairable,kind:p.kind,inTriangle:p.inTriangle}])),
  kit:KIT.map(k=>({id:k.id,pref:k.pref,L:k.L,kg:k.kg,rigid:k.rigid,cat:k.cat,warmth:k.warmth,camp:k.camp,comfort:k.comfort,perDay:k.perDay,divisible:k.divisible,rainkit:k.rainkit})),
  fit:{FRAME_PRESETS:FRAME_PRESETS.map(p=>({L:p.L,label:p.label})),FRAME_ESTIMATE},
  code:[bikeFit,bagSpec,prefFor,selectBags,usableUnits,deckedIds,itemL,foodDays].map(f=>f.toString()),
})`));
const fingerprint=crypto.createHash('sha256').update(JSON.stringify(frozen)).digest('hex');
if(process.env.PRINT_FINGERPRINT)console.log('fingerprint',fingerprint);
assert.equal(fingerprint,FROZEN_FINGERPRINT,'LC-FREEZE-01: frozen behaviour data changed (design 13). Needs the owner\'s approval and new fixtures.');
console.log('LC-FREEZE-01 ok');

let steps=0;
for(const fixture of fixtures){
  const got=runFixture(kit,fixture);
  assert.equal(got.length,fixture.expect.length,fixture.id+': number of states');
  got.forEach((state,i)=>{steps++;assert.equal(JSON.stringify(state),JSON.stringify(fixture.expect[i]),`${fixture.id} (${fixture.about}), state ${i}`);});
}
console.log(JSON.stringify({status:'passed',files:files.length,fixtures:fixtures.length,states:steps}));
