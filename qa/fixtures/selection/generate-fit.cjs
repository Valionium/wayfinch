/* Task 13: writes ONLY fit.json (the frame-fit fixtures of design 14 item 4) from the real code.
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
const M={style:'diamond-level',size:{kind:'letter',value:'M'}};
const XS={style:'diamond-level',size:{kind:'letter',value:'XS'}};
const BASE=[b(1,'frame',6),b(2,'seat',14),b(3,'bar',12),b(4,'rack',15,{pair:true})];
const list=[
  fx('LC-FIT-04','no frame details: today\'s values',{bags:[...BASE,b(5,'bottle',.75,{slot:'dt'})]},null),
  fx('LC-FIT-05a','diamond XS, no cage: a 3.5 L frame bag, 43 cm',{bags:BASE},XS),
  fx('LC-FIT-05b','diamond XS, one down-tube cage: 2.5 L',{bags:[...BASE,b(5,'bottle',.75,{slot:'dt'})]},XS),
  fx('LC-FIT-05c','diamond XS, seat-tube bolts yes, two cages: no room beside two bottles',{bags:[...BASE,b(5,'bottle',.5,{slot:'st'}),b(6,'bottle',.75,{slot:'dt'})]},{...XS,bolts:{st:'yes',dt:'unknown',un:'unknown'}}),
  fx('LC-FIT-05d','diamond XS measured (Salsa Fargo XS), two cages: a 1.3 L half bag',{bags:[...BASE,b(5,'bottle',.5,{slot:'st'}),b(6,'bottle',.75,{slot:'dt'})]},{...XS,bolts:{st:'yes',dt:'unknown',un:'unknown'},triangleCm:{top:44.6,seat:24.5,down:56.8}}),
  fx('LC-FIT-06','measured M 51.1 / 35.0 / 65.0: 4.4 L, 49 cm',{bags:BASE},{...M,triangleCm:{top:51.1,seat:35,down:65}}),
  fx('LC-FIT-07','compact M: 4.5 L',{bags:BASE},{style:'compact',size:{kind:'letter',value:'M'}}),
  fx('LC-FIT-08a','full suspension S: a 1.5 L half bag',{bags:[...BASE,b(5,'bottle',.45,{slot:'dt'})]},{style:'full-suspension',size:{kind:'letter',value:'S'}}),
  fx('LC-FIT-08b','full suspension S: a typed 0.75 L bottle stays',{bags:[...BASE,b(5,'bottle',.75,{slot:'dt'})]},{style:'full-suspension',size:{kind:'letter',value:'S'}}),
  fx('LC-FIT-09a','trapeze L: a 1.5 L wedge, 20 cm, no top-tube bag',{bags:[...BASE,b(5,'top',1,{slot:'front'})]},{style:'trapeze',size:{kind:'letter',value:'L'}}),
  fx('LC-FIT-09b','trapeze L, top-tube answer yes: both mounts',{bags:[...BASE,b(5,'top',1,{slot:'front'})]},{style:'trapeze',size:{kind:'letter',value:'L'},topTubeBag:'yes'}),
  fx('LC-FIT-10','step-through, down-tube bolts yes: one cage, no frame bag, no top-tube bag',{bags:[...BASE,b(5,'top',1,{slot:'front'}),b(6,'bottle',.75,{slot:'dt'})]},{style:'step-through',bolts:{st:'unknown',dt:'yes',un:'unknown'}}),
  fx('LC-FIT-11','a typed 6 L frame bag on an M diamond with two cages stays 6 L',{bags:[b(1,'frame',6,{userL:true}),b(2,'seat',14),b(3,'bottle',.5,{slot:'st'}),b(4,'bottle',.75,{slot:'dt'})]},M),
  fx('LC-FIT-02','lost mount: step-through, hand placement into the frame bag, reload, back',{bags:[...BASE,b(5,'bottle',.5,{slot:'st'})],pinned:{lock:'1-0'}},null,
    [{bike:{style:'step-through'}},{reload:true},{bike:null},{reload:true}]),
  fx('LC-FIT-03','a usable width of 38 cm caps the bar roll; 45 cm poles stay out',{bags:BASE,custom:{tent:{L:3,kg:1.5,rigid:45}}},{barWidthCm:38}),
  fx('LC-FIT-16','seat-pack gap 15 cm: nothing moves',{bags:BASE},{seatGapCm:15}),
  fx('LC-FIT-17','bike changes: a mount nobody uses, then an estimated figure',{bags:[b(1,'frame',6),b(2,'seat',14)]},null,
    [{bike:{topTubeBag:'no',bolts:{st:'no',dt:'unknown',un:'unknown'}}},{bike:{style:'compact',size:{kind:'letter',value:'S'}}},{bike:{style:'compact',size:{kind:'letter',value:'S'},maxWeight:undefined}}]),
];
list.forEach(f=>{f.expect=runFixture(kit,f);});
fs.writeFileSync(path.join(__dirname,'fit.json'),JSON.stringify(list));
console.log('fit',list.length,'fixtures',list.reduce((n,f)=>n+f.expect.length,0),'states');
