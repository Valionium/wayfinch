const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const {run,context}=appVM();
context.assert=assert;
run(`
let inputCases=0;
const check=fn=>{fn();inputCases++;};
S.custom={};
for(const [id,field,value] of [
  ['base1','L',''],['base1','L',' '],['base1','L','NaN'],['base1','L','Infinity'],
  ['base1','L','-1'],['base1','L','101'],['base1','kg','101'],['base1','rigid','201'],
  ['missing','L','1'],['base1','other','1']
])check(()=>{const before=JSON.stringify(S.custom);assert.equal(setKitMeasurement(id,field,value),false);assert.equal(JSON.stringify(S.custom),before);});
for(const [field,value] of [['L','0'],['L','0.07'],['kg','100'],['rigid','200']])check(()=>{
  assert.equal(setKitMeasurement('base1',field,value),true);assert.equal(S.custom.base1[field],Number(value));
});
check(()=>{assert.equal(S.custom.base1.L,.07);assert.equal(S.custom.base1.kg,100);assert.equal(S.custom.base1.rigid,200);});
for(const [description,nights,month,sleep] of [
  ['3 nights in Reykjavik in January, staying in accommodation',3,0,'indoor'],
  ['2 days in Seville in July, hotel',1,6,'indoor'],
  ['0 nights in Heidelberg in June',0,5,undefined],
  ['40 nights in Bergen in October, camping',30,9,'camp'],
  ['6 nights in Innsbruck in September, both camping and accommodation',6,8,'mixed']
])check(()=>{const p=parseTrip(description);assert.equal(p.nights,nights);assert.equal(p.month,month);assert.equal(p.sleep,sleep);});
const cold={nightCold:-10,wetChance:60};
S.kit.pump=false;S.kit.elecpump=true;
check(()=>assert.ok(!audit().miss.some(x=>x.t==='Pump')));
S.kit.elecpump=false;
check(()=>assert.ok(audit().miss.some(x=>x.t==='Pump')));
for(const [nights,sleep,expected] of [[0,'camp',false],[3,'indoor',false],[3,'camp',true],[3,'mixed',true]])check(()=>{
 S.nights=nights;S.sleep=sleep;assert.equal(weatherKit(cold).some(x=>x[0]==='a warmer sleep system'),expected);
});
for(const r of REGIONS)for(let month=0;month<12;month++)check(()=>{
 const c=climate(r.id,month);for(const key of ['nightMean','nightCold','dayMean','dayHot','rainDays','wetChance'])assert.ok(Number.isFinite(c[key]));
 assert.ok(c.nightCold<=c.nightMean);assert.ok(c.dayMean<=c.dayHot);assert.ok(c.rainDays>=0&&c.rainDays<=31);
});
console.log(JSON.stringify({status:'passed',cases:inputCases,regionalMonthScenarios:REGIONS.length*12}));
`);
