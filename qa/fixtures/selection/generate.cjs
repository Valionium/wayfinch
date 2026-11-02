/* Writes the fixtures of design 14 items 1, 2, 3, 6, 7 and 8 from the real code.
   Run it only when the owner has ruled that the frozen behaviour changes (design 13). */
const fs=require('node:fs'),path=require('node:path');
const {planKit}=require('../../plan-kit.cjs');
const {runFixture,STUBS}=require('./steps.cjs');
const kit=planKit(),{run}=kit.vm;
run(STUBS);kit.stubbed=true;
const ON="Object.keys(S.kit).forEach(k=>S.kit[k]=false);KIT.forEach(k=>S.kit[k.id]=!!k.on);";
const DEFAULTS='S.kitTouched={};S.kit={};applyTripKitDefaults();';
const SIX=['quilt','pad','tent','rain','puffy','base1','bibs','socks','camp','cap','underwear','shades','stove','pot','spork','food','snacks','tool','tubes','pump','levers','link','chaintl','hanger','patch','boot','lock','bank','phone','cables','headlamp','firstaid','wash','towel','teeth','wipes','docs','cash'];
const b=(uid,pos,L,extra={})=>({uid,pos,L,...extra});
// The stored inputs of a plan, as a capturePlan() without placements: nothing kept yet.
function input(p,code){
  run(`(()=>{const p=${JSON.stringify(p)};
    S.bags=p.bags.map(x=>({...x}));S.nextUid=Math.max(1,...S.bags.map(x=>x.uid+1));
    if(p.kit){Object.keys(S.kit).forEach(k=>S.kit[k]=false);p.kit.forEach(id=>S.kit[id]=true);}
    S.qty=p.qty||{};S.custom=p.custom||{};S.pinned=p.pinned||{};S.packed={};S.placements=null;S.carried={};
    S.mode=p.mode||'comfort';S.nights=p.nights===undefined?6:p.nights;S.sleep=p.sleep||'camp';
    S.foodMode=p.foodMode===undefined?2:p.foodMode;S.decks={bar:false,rack:false,...(p.decks||{})};S.packEff=null;
  })()`);
  if(code)run(code);
  const plan=JSON.parse(run('JSON.stringify(capturePlan())'));
  delete plan.placements;
  return {plan,packEff:null};
}
const fixture=(id,about,p,code,steps=[])=>({id,about,input:input(p,code),steps});
const B3=(rack=20)=>[b(1,'frame',6),b(2,'seat',14),b(3,'pack',20),b(4,'rack',rack,{pair:true})];
const FOUR=[b(1,'frame',6),b(2,'fork',3,{pair:true}),b(3,'seat',14),b(4,'bar',12)];
const PANNIER=[b(1,'frame',6),b(2,'rack',15,{pair:true})];
const M1B=[b(1,'frame',3),b(3,'bar',12),b(4,'seat',10),b(5,'rack',20,{pair:true})];
const ADD25=['meds','sun','gloves','warmers','rainpants','shoecov','elecpump','plugs','repellent','blanket','mug','buds','earplugs','liner','pillow','drybags','nice','book','detergent','chamois','pads','ties','lube','spoke','shiftcharger'];
const SIZES=[{qty:'tubes',n:2},{qty:'base1',n:2},{qty:'underwear',n:3},{size:'rain',L:2,kg:.45},{size:'puffy',L:3.5,kg:.55},{size:'quilt',L:3.2,kg:.5}];

const review=[
  fixture('LC-SEL-01','#3, review: Lightweight',{bags:B3(),mode:'light',nights:3,sleep:'camp'},ON),
  fixture('LC-SEL-02','#3, review: Comfortable',{bags:B3(),mode:'comfort',nights:3,sleep:'camp'},ON),
  fixture('LC-SEL-03a','#3, verifier: defaults, Lightweight',{bags:B3(),mode:'light',nights:3,sleep:'camp'},DEFAULTS),
  fixture('LC-SEL-03b','#3, analysis: pair 15, the 6-night kit, Lightweight',{bags:B3(15),mode:'light',nights:6,sleep:'camp',kit:SIX}),
  fixture('LC-SEL-03c','#3, analysis: pair 15, Comfortable without camp clothes and towel',{bags:B3(15),mode:'comfort',nights:6,sleep:'camp',kit:SIX.filter(id=>!['camp','towel'].includes(id))}),
  ...['light','comfort'].map(mode=>fixture('LC-SEL-05-'+mode,'#4(a), review',{bags:[b(1,'seat',14),b(2,'bar',12),b(3,'pack',8)],mode,nights:1,sleep:'indoor'},ON)),
  ...['comfort','light'].map(mode=>fixture('LC-SEL-06-'+mode,'#4(a), analysis',{bags:[b(1,'bar',12),b(2,'seat',14),b(3,'pack',10)],mode,nights:3,sleep:'indoor'},DEFAULTS)),
  ...['comfort','light'].map(mode=>fixture('LC-SEL-07-'+mode,'#4(a-prime), analysis',{bags:[b(1,'top',1,{slot:'front'}),b(2,'bar',12),b(3,'seat',14),b(4,'pack',10)],mode,nights:3,sleep:'indoor'},DEFAULTS)),
  fixture('LC-KEEP-01','#4(b), review: the pump chip',{bags:[b(1,'frame',6),b(2,'seat',14),b(3,'bar',12),b(4,'pack',20)],mode:'light',nights:1,sleep:'indoor'},ON,[{move:'pump',to:'2-0'},{reload:true}]),
  fixture('LC-SEL-08','M1, review',{bags:[b(1,'frame',6),b(2,'seat',14),b(3,'rack',15,{pair:true})],mode:'comfort',nights:3,sleep:'camp',kit:['tool','pump','rain','base1']},'S.custom.base1={L:2.7,kg:.3,rigid:0};'),
  fixture('LC-SEL-09','M1-a, analysis',{bags:[b(1,'frame',4.5),b(2,'fork',3,{pair:true}),b(3,'bar',12),b(4,'seat',14),b(5,'rack',15,{pair:true})],mode:'comfort',nights:0,sleep:'indoor'},DEFAULTS),
  fixture('LC-SEL-10','M1-b, analysis',{bags:M1B,mode:'comfort',nights:1,sleep:'camp'},DEFAULTS),
  fixture('LC-SEL-11','M1-b in Lightweight',{bags:M1B,mode:'light',nights:1,sleep:'camp'},DEFAULTS),
  ...['comfort','light'].map(mode=>fixture('LC-SEL-12-'+mode,'M2, review',{bags:[b(1,'frame',4.5),b(2,'fork',3,{pair:true}),b(3,'rack',20,{pair:true})],mode,nights:3,sleep:'camp'},ON)),
  fixture('LC-SEL-13','M2, analysis',{bags:[b(1,'frame',6),b(2,'fork',3.5,{pair:true}),b(3,'seat',10),b(4,'bar',12)],mode:'light',nights:1,sleep:'camp'},DEFAULTS+"['rainpants','gloves','shoecov'].forEach(id=>S.kit[id]=true);"),
  fixture('LC-SEL-14','packing-9: food of 0 L',{bags:[b(1,'frame',6),b(2,'seat',14),b(3,'bar',12)],mode:'comfort',nights:6,sleep:'camp',kit:SIX.filter(id=>!['stove','pot'].includes(id)),custom:{food:{L:0,kg:.7,rigid:0}}}),
  fixture('LC-ADV-03','M4, review',{bags:[b(1,'rack',15,{pair:true}),b(3,'seat',14),b(4,'frame',5),b(5,'bar',12)],mode:'comfort',nights:2,sleep:'indoor'},DEFAULTS),
  fixture('LC-ADV-04','M4, review, day ride',{bags:[b(1,'rack',15,{pair:true}),b(2,'fork',3,{pair:true}),b(3,'seat',14),b(4,'top',1.5,{slot:'front'}),b(5,'frame',5)],mode:'comfort',nights:0,sleep:'indoor'},DEFAULTS),
  fixture('LC-ADV-06','packing-6, review',{bags:[b(1,'frame',6),b(2,'fork',3,{pair:true}),b(3,'rack',15,{pair:true})],mode:'light',nights:1,sleep:'indoor',kit:['tool','pump','rain']}),
  fixture('LC-ADV-07','packing-6, analysis',{bags:[b(1,'frame',3),b(2,'fork',3,{pair:true}),b(3,'rack',15,{pair:true})],mode:'light',nights:0,sleep:'indoor',kit:['cap','snacks','tool','tubes','pump','levers','patch','phone','docs']}),
  fixture('LC-ADV-08a','packing-10, analysis',{bags:[b(1,'frame',6),b(2,'seat',10)],mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[{move:'lock',to:'2-0'},{untick:'lock'},{add:'lock'}]),
  fixture('LC-ADV-08b','packing-10, review',{bags:[b(1,'frame',3),b(2,'seat',6)],mode:'comfort',nights:1,sleep:'indoor',kit:['tool','pump','rain','base1','puffy']},null,[{move:'puffy',to:'2-0'},{bags:[b(1,'frame',3)]}]),
  fixture('LC-ADV-09','ui-verdict-count-1, review',{bags:[b(1,'top',1,{slot:'front'}),b(2,'frame',5),b(3,'fork',3,{pair:true}),b(4,'bar',12),b(5,'seat',14)],mode:'comfort',nights:0,sleep:'indoor'},DEFAULTS),
];
const stability=[
  fixture('LC-KEEP-02','25 additions to the four-bag plan',{bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,ADD25.flatMap(id=>[{add:id},{untick:id}])),
  fixture('LC-KEEP-03','25 additions to frame + pannier pair',{bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,ADD25.flatMap(id=>[{add:id},{untick:id}])),
  fixture('LC-KEEP-04','the wash kit moved to the other pannier',{bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[{move:'wash',to:'2-1'},{move:'wash',to:'2-0'}]),
  fixture('LC-KEEP-05','a full re-plan keeps the hand placement',{bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[{move:'wash',to:'2-1'},{replan:true}]),
  ...['warmers','gloves'].map(id=>fixture('LC-KEEP-06-'+id,'#3 analysis setup, plus one',{bags:B3(15),mode:'light',nights:6,sleep:'camp',kit:SIX},null,[{add:id}])),
  ...SIZES.map((s,i)=>fixture('LC-KEEP-07-four-'+i,'quantity or size, four bags',{bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[s])),
  ...SIZES.map((s,i)=>fixture('LC-KEEP-07-pair-'+i,'quantity or size, pannier plan',{bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[s])),
  fixture('LC-KEEP-08','a hand placement that no longer fits',{bags:[b(1,'top',1,{slot:'front'}),b(2,'frame',6),b(3,'fork',3,{pair:true}),b(4,'seat',14),b(5,'bar',12)],mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[{move:'cables',to:'5-0'},{size:'cables',L:.86,kg:.2},{unsize:'cables'}]),
  fixture('LC-KEEP-09','reload after a kept change',{bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[{add:'liner'},{reload:true}]),
  fixture('LC-KEEP-10-a','two top-tube bags, front first',{bags:[b(1,'top',1,{slot:'front'}),b(2,'top',1,{slot:'rear'}),b(3,'seat',14)],mode:'comfort',nights:6,sleep:'camp',kit:SIX}),
  fixture('LC-KEEP-10-b','two top-tube bags, rear first',{bags:[b(1,'top',1,{slot:'rear'}),b(2,'top',1,{slot:'front'}),b(3,'seat',14)],mode:'comfort',nights:6,sleep:'camp',kit:SIX}),
  fixture('LC-KEEP-12','untick in a plan over capacity',{bags:[b(1,'frame',6),b(2,'seat',10)],mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[{untick:'tubes'}]),
  ...['comfort','light'].map(mode=>fixture('LC-KEEP-13-'+mode,'indoor trip changed to camping',{bags:[b(1,'frame',6),b(2,'seat',14),b(3,'bar',12),b(4,'rack',15,{pair:true})],mode,nights:3,sleep:'indoor'},DEFAULTS,[{trip:true,sleep:'camp',defaults:true}])),
  fixture('LC-KEEP-14','the food exception',{bags:[b(1,'frame',6),b(2,'fork',4,{pair:true}),b(3,'pack',10)],mode:'comfort',nights:1,sleep:'indoor'},DEFAULTS,[{add:'rainpants'}]),
];
const P11={bags:FOUR,mode:'comfort',nights:6,sleep:'camp',kit:SIX};
const triggers=[
  ['mode',{mode:'light'}],['start-again',{startAgain:true}],['seat-pack-size',{bags:FOUR.map(x=>x.uid===3?{...x,L:15}:x)}],
  ['cage-in-triangle',{bags:[...FOUR,b(9,'bottle',.75,{slot:'dt'})]}],['rack-deck',{deck:'rack',on:true}],['packing-factor',{packEff:.85}],['replan',{replan:true}],
  ['no-bottle-under',{bags:[...FOUR,b(9,'bottleU',.5,{slot:'un'})]}],['no-bar-deck',{deck:'bar',on:true}],['no-bike-name',{bikeName:'Other name'}],
].map(([name,step])=>fixture('LC-KEEP-11-'+name,'re-plan trigger or non-trigger, with the lock moved by hand',P11,null,[{move:'lock',to:'3-0'},{tick:'tent'},step,{add:'warmers'}]));
triggers.push(fixture('LC-REPLAN-01','the 2.0 L rain jacket shows the offer; Re-plan fits everything',{bags:PANNIER,mode:'comfort',nights:6,sleep:'camp',kit:SIX},null,[{tick:'tent'},{size:'rain',L:2,kg:.45},{replan:true}]));
const MIG={bags:B3(15),mode:'light',nights:6,sleep:'camp',kit:SIX,pinned:{lock:'2-0'}};
const migration=['draft','setup','export'].map(kind=>fixture('LC-STORE-04-'+kind,`migration: a ${kind} saved before sub-project 1, with a hand placement`,MIG,null,[{reload:true},{add:'warmers'}]));
// Every order of the same bags gives identical output.
const ORDER=[b(1,'frame',6),b(2,'seat',14),b(3,'fork',3,{pair:true}),b(4,'top',1,{slot:'front'}),b(5,'rack',15,{pair:true})];
const order=[[0,1,2,3,4],[4,3,2,1,0],[2,0,4,1,3],[1,4,0,3,2],[3,2,1,4,0]].map((o,i)=>fixture('LC-ORDER-'+i,'the same bags in another order',{bags:o.map(n=>ORDER[n]),mode:'comfort',nights:3,sleep:'camp'},ON));
// 200 seeded plans, to catch drift.
let seed=20261030;
const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const pick=a=>a[Math.floor(rand()*a.length)];
const seeded=[];
for(let i=0;i<200;i++){
  const bags=[];let uid=1;
  ['top','frame','fork','bar','seat','rack','pack'].forEach(pos=>{if(rand()<(pos==='frame'?.9:.5)){
    const x=b(uid++,pos,{top:1,frame:pick([3,4.5,6]),fork:pick([2,3,4]),bar:pick([8,12,15]),seat:pick([8,10,14]),rack:pick([12,15,20]),pack:pick([10,20])}[pos]);
    if(pos==='fork'||pos==='rack')x.pair=rand()<.8;if(pos==='top')x.slot='front';bags.push(x);}});
  seeded.push(fixture('LC-GEN-'+i,'seeded plan',{bags,mode:pick(['comfort','light']),nights:pick([0,1,2,3,5,7]),sleep:pick(['camp','camp','mixed','indoor'])},DEFAULTS,[{add:pick(['earplugs','warmers','book','gloves','meds'])},{reload:true}]));
}
const dir=__dirname;
for(const [name,list] of Object.entries({review,stability,triggers,migration,order,seeded})){
  list.forEach(f=>{f.expect=runFixture(kit,f);});
  fs.writeFileSync(path.join(dir,name+'.json'),JSON.stringify(list));
  console.log(name,list.length,'fixtures',list.reduce((n,f)=>n+f.expect.length,0),'states');
}
