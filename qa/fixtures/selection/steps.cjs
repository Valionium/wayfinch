// One fixture's run: open the input, then apply each step of design 14 and read the plan back.
const STUBS='renderBikeProfiles=()=>{};renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};renderResult=()=>{};drawRig=()=>{};syncGPXControl=()=>{};renderPressureHelper=()=>{};renderPackingChecklist=()=>{};applyTheme=()=>{};ensureClimate=()=>{};ensureRoute=()=>{};';
const READ=`(()=>{const p=currentPlan();return {placements:S.placements,food:p.food,overflow:p.overflow,outOfReach:p.reach.outOfReach,noBag:p.reach.noBag,
  notKept:p.hand.notKept,unusable:p.unusable,byPositionKg:p.byPositionKg,unplacedKg:p.unplacedKg,
  summary:p.summary,notes:p.notes};})()`;
const CODE={
  add:s=>`S.kit[${JSON.stringify(s.add)}]=true;`,
  select:s=>`S.kit[${JSON.stringify(s.select)}]=true;`,
  untick:s=>`S.kit[${JSON.stringify(s.untick)}]=false;`,
  qty:s=>`S.qty[${JSON.stringify(s.qty)}]=${s.n};`,
  size:s=>`S.custom[${JSON.stringify(s.size)}]={L:${s.L},kg:${s.kg===undefined?`itemKg(kitById(${JSON.stringify(s.size)}))`:s.kg},rigid:${s.rigid||0}};`,
  unsize:s=>`delete S.custom[${JSON.stringify(s.unsize)}];`,
  move:s=>`S.pinned[${JSON.stringify(s.move)}]=${JSON.stringify(s.to)};`,
  mode:s=>`S.mode=${JSON.stringify(s.mode)};`,
  bags:s=>`S.bags=${JSON.stringify(s.bags)};syncFrameBags();`,
  deck:s=>`S.decks[${JSON.stringify(s.deck)}]=${!!s.on};`,
  trip:s=>`${s.nights===undefined?'':`S.nights=${s.nights};`}${s.sleep?`S.sleep=${JSON.stringify(s.sleep)};`:''}${s.defaults?'applyTripKitDefaults();':''}`,
  packEff:s=>`S.packEff=${s.packEff};`,
  bikeName:s=>`S.bikeProfile={...(S.bikeProfile||{}),name:${JSON.stringify(s.bikeName)}};`,
  bike:s=>`S.bikeProfile=normaliseBikeProfile({id:'fit_bike',name:'Fit bike',fit:${JSON.stringify(s.bike)}});`,
  report:s=>`S.bikeProfile=normaliseBikeProfile({...(S.bikeProfile||{id:'rep_bike',name:'Report bike'}),maxWeight:{v:120,u:'kg',includes:'bike'},maxWeightAsked:true,fit:{...(S.bikeProfile&&S.bikeProfile.fit||{}),seatGapCm:15}});S.tyrePressure={...normaliseTyrePressure(S.tyrePressure),bagKg:2.4};MAX_WEIGHT_SKIPPED=true;`,
  tick:s=>`S.packed[${JSON.stringify(s.tick)}]=true;`,
  startAgain:()=>'startAgain();',
  replan:()=>"keepPlan({replan:true,why:'asked'});",
  reload:()=>'restorePlan(JSON.parse(JSON.stringify(capturePlan())),false,false);',
};
function runFixture(kit,fixture){
  const {run}=kit.vm;
  if(!kit.stubbed){run(STUBS);kit.stubbed=true;}
  const read=()=>JSON.parse(run(`JSON.stringify(${READ})`));
  run(`S.packEff=${fixture.input.packEff==null?'null':fixture.input.packEff};restorePlan(${JSON.stringify(fixture.input.plan)},false,false);`);
  const states=[read()];
  for(const step of fixture.steps){
    const kind=Object.keys(step).find(k=>CODE[k]);
    if(!kind)throw new Error(fixture.id+': unknown step '+JSON.stringify(step));
    run(CODE[kind](step));
    states.push(read());
  }
  return states;
}
module.exports={runFixture,STUBS};
