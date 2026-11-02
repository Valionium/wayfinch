/* Task 15: writes ONLY weight.json (the report-only pairs of design 14 item 5) from the real code.
   It never touches the fixtures of Task 10, which stay byte-identical (LC-FIT-01). */
const fs=require('node:fs'),path=require('node:path');
const {planKit}=require('../../plan-kit.cjs');
const {runFixture,STUBS}=require('./steps.cjs');
const kit=planKit(),{run}=kit.vm;
run(STUBS);kit.stubbed=true;
const KIT=['rain','tool','tubes','pump','lock','food','snacks','stove','pot','tent','pad','quilt','base1','puffy'];
const b=(uid,pos,L,extra={})=>({uid,pos,L,...extra});
const bikeCode=fit=>`S.bikeProfile=normaliseBikeProfile({id:'fit_bike',name:'Fit bike',fit:${JSON.stringify(fit)}});`;
function input(p,fit){
  run(`(()=>{const p=${JSON.stringify(p)};
    S.bags=p.bags.map(x=>({...x}));S.nextUid=Math.max(1,...S.bags.map(x=>x.uid+1));
    Object.keys(S.kit).forEach(k=>S.kit[k]=false);p.kit.forEach(id=>S.kit[id]=true);
    S.qty={};S.custom=p.custom||{};S.pinned=p.pinned||{};S.packed={};S.placements=null;S.carried={};
    S.mode=p.mode||'comfort';S.nights=p.nights===undefined?2:p.nights;S.sleep=p.sleep||'camp';
    S.foodMode=2;S.decks={bar:false,rack:false};S.packEff=null;
  })()`+(fit===undefined?'':';'+bikeCode(fit)));
  const plan=JSON.parse(run('JSON.stringify(capturePlan())'));delete plan.placements;
  return {plan,packEff:null};
}
const fx=(id,about,p,fit,steps=[])=>({id,about,input:input({kit:KIT,...p},fit),steps});
const BASE=[b(1,'frame',6),b(2,'seat',14),b(3,'bar',12),b(4,'rack',15,{pair:true})];
const list=[
  fx('LC-WT-01a','report-only pair: a maximum weight, the empty-bag weight and a seat gap change nothing',{bags:BASE},null,[{report:true}]),
  fx('LC-WT-01b','report-only pair with the bar deck on',{bags:BASE},null,[{deck:'bar',on:true},{report:true}]),
  fx('LC-WT-01c','report-only pair with the bar deck off, panniers and a hand placement',{bags:BASE,pinned:{lock:'4-0'}},null,[{deck:'bar',on:false},{report:true},{reload:true}]),
];
list.forEach(f=>{f.expect=runFixture(kit,f);});
fs.writeFileSync(path.join(__dirname,'weight.json'),JSON.stringify(list));
console.log('weight',list.length,'fixtures',list.reduce((n,f)=>n+f.expect.length,0),'states');
