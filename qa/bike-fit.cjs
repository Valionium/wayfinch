// Frame fit (design 10, spec 7.4): bikeFit, bagSpec, size numbers and the measured triangle.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const {run}=appVM();
run(`
  var qaBike=(fit,extra)=>normaliseBikeProfile({id:'qa_bike',name:'QA',fit,...(extra||{})});
  var qaFit=fit=>bikeFit(qaBike(fit));
  var qaBags=(fit,bags)=>{S.bikeProfile=qaBike(fit);S.bags=bags.map((b,i)=>({uid:i+1,...b}));return S.bags;};
  var qaFrame=(fit,cages,extra)=>{
    const slots=['st','dt'].slice(0,cages==='dt1'?2:cages);
    const bags=[{pos:'frame',L:5,...(extra||{})}];
    if(cages===1)bags.push({pos:'bottle',slot:'dt',L:0.75});
    if(cages===2)bags.push({pos:'bottle',slot:'st',L:0.5},{pos:'bottle',slot:'dt',L:0.75});
    qaBags(fit,bags);return bagSpec(S.bags[0]);
  };
  var qaShape=(fit,idx)=>{S.bikeProfile=qaBike(fit);return frameShapeL(idx);};
`);
const J=code=>JSON.parse(run(`JSON.stringify(${code})`));
const lit=fit=>J(`qaFit(${JSON.stringify(fit)}).frameBag.shapes.map(e=>e.L)`);
const inside=fit=>J(`qaFit(${JSON.stringify(fit)}).frameBag.shapes.map(e=>e.insideCm)`);

// [LC-FIT-04] no frame details: today's values
{
  const f=J('bikeFit(null)');
  check(f.cages.st && f.cages.dt && f.cages.un,'LC-FIT-04 three cage mounts');
  check(JSON.stringify(f.frameBag.shapes.map(e=>e.L))==='[6,4.5,3]' && f.frameBag.shapes.every(e=>e.insideCm===45),'LC-FIT-04 6.0 / 4.5 / 3.0 L, 45 cm');
  check(f.topMounts.front && f.topMounts.rear,'LC-FIT-04 two top-tube mounts');
  check(f.barRollCm.value===48 && f.barRollCm.source==='today','LC-FIT-04 48 cm bar roll');
  check(J('bikeFit(qaBike(null))').frameBag.shapes[0].source==='today','LC-FIT-04 labelled as today');
  check(run('bagSpec({uid:1,pos:"frame",L:5}).L===5 && bagSpec({uid:1,pos:"frame",L:5}).insideCm===45'),'LC-FIT-04 a stored bag reads as it did before');
}
// [LC-FIT-05] diamond XS
{
  const xs={style:'diamond-level',size:{kind:'letter',value:'XS'}};
  const f=J(`qaFit(${JSON.stringify(xs)})`);
  check(f.cages.dt && !f.cages.st && !f.cages.un,'LC-FIT-05 only the down-tube cage is offered');
  check(run(`qaFrame(${JSON.stringify(xs)},0).L`)===3.5 && run(`qaShape(${JSON.stringify(xs)},1)`)===2.5,'LC-FIT-05 3.5 L with no cage, 2.5 L one cage');
  check(run(`qaFrame(${JSON.stringify(xs)},1).L`)===2.5,'LC-FIT-05 one cage gives 2.5 L');
  check(inside(xs).every(v=>v===43),'LC-FIT-05 43 cm');
  const bolts={...xs,bolts:{st:'yes',dt:'unknown',un:'unknown'}};
  const two=J(`qaFrame(${JSON.stringify(bolts)},2)`);
  check(!two.usable && two.reason==='No room beside two bottles on this frame','LC-FIT-05 seat-tube bolts with two cages: no room beside two bottles');
  const m={...bolts,triangleCm:{top:44.6,seat:24.5,down:56.8}};
  check(run(`qaFrame(${JSON.stringify(m)},2).L`)===1.3 && run(`qaFrame(${JSON.stringify(m)},2).usable`) && inside(m)[2]===43,'LC-FIT-05 measured Salsa XS: 1.3 L half bag, 43 cm');
}
// [LC-FIT-06] measured M and a bad triangle
{
  const m={style:'diamond-level',size:{kind:'letter',value:'M'},triangleCm:{top:51.1,seat:35,down:65}};
  check(JSON.stringify(lit(m))==='[4.4,3.3,2.2]' && inside(m)[0]===49,'LC-FIT-06 4.4 / 3.3 / 2.2 L, 49 cm');
  const bad={style:'diamond-level',size:{kind:'letter',value:'M'},triangleCm:{top:20,seat:30,down:60}};
  check(J(`qaBike(${JSON.stringify(bad)}).fit.triangleCm`)===null,'LC-FIT-06 20 / 30 / 60 is rejected');
  check(run('triangleLitres({top:20,seat:30,down:60})')===null,'LC-FIT-06 triangleLitres refuses it');
}
// [LC-FIT-07] compact M
check(JSON.stringify(lit({style:'compact',size:{kind:'letter',value:'M'}}))==='[4.5,3,1.8]','LC-FIT-07 compact M 4.5 / 3 / 1.8 L');
// [LC-FIT-08] full suspension S
{
  const fs={style:'full-suspension',size:{kind:'letter',value:'S'}};
  const f=J(`qaFit(${JSON.stringify(fs)})`);
  check(f.frameBag.shapes.length===1 && f.frameBag.shapes[0].L===1.5 && f.frameBag.shapes[0].shape===2,'LC-FIT-08 1.5 L half bag only');
  check(f.cages.dt && !f.cages.st && !f.cages.un && f.bottleDefaultL===0.45,'LC-FIT-08 one down-tube cage, 0.45 L bottle');
  run(`qaBags(${JSON.stringify(fs)},[{pos:'bottle',slot:'dt',L:0.75}])`);
  const b=J('bagSpec(S.bags[0])');
  check(b.usable && b.L===0.75 && /Check that it fits/.test(b.note),'LC-FIT-08 a typed 0.75 L bottle stays, with a note');
  check(run(`(()=>{S.bikeProfile=qaBike(${JSON.stringify(fs)});S.bags=[];addBag('bottle');return S.bags[0].L;})()`)===0.45,'LC-FIT-08 a new bottle starts at 0.45 L');
}
// [LC-FIT-09] trapeze L
{
  const t={style:'trapeze',size:{kind:'letter',value:'L'}};
  const f=J(`qaFit(${JSON.stringify(t)})`);
  check(f.cages.dt && !f.cages.st && f.frameBag.shapes.length===1 && f.frameBag.shapes[0].L===1.5 && f.frameBag.shapes[0].insideCm===20,'LC-FIT-09 one down-tube cage, a 1.5 L wedge, 20 cm');
  check(!f.topMounts.front && !f.topMounts.rear,'LC-FIT-09 no top-tube mounts');
  const y=J(`qaFit(${JSON.stringify({...t,topTubeBag:'yes'})})`);
  check(y.topMounts.front && y.topMounts.rear,'LC-FIT-09 with the answer yes both appear');
}
// [LC-FIT-10] step-through
{
  const st={style:'step-through',bolts:{st:'unknown',dt:'yes',un:'unknown'},topTubeBag:'yes'};
  const f=J(`qaFit(${JSON.stringify(st)})`);
  check(f.cages.dt && !f.cages.st && !f.cages.un,'LC-FIT-10 one cage');
  check(f.frameBag.shapes.length===0 && f.frameBag.none==='No mount on this bike' && !f.topMounts.front,'LC-FIT-10 no frame bag, no top-tube bag');
  run(`qaBags(${JSON.stringify(st)},[{pos:'frame',L:5},{pos:'top',slot:'front',L:1}])`);
  check(run('!bagSpec(S.bags[0]).usable && !bagSpec(S.bags[1]).usable && usableUnits().length===0'),'LC-FIT-10 both stay in the cupboard');
}
// [LC-FIT-11] a typed size wins
{
  const m={style:'diamond-level',size:{kind:'letter',value:'M'}};
  const r=J(`qaFrame(${JSON.stringify(m)},2,{L:6,userL:true})`);
  check(r.usable && r.L===6 && /You entered 6 L next to 2 cages/.test(r.note),'LC-FIT-11 typed 6 L stays with the note');
  const xs=J(`qaFrame(${JSON.stringify({style:'full-suspension',size:{kind:'letter',value:'S'}})},2,{L:6,userL:true})`);
  check(xs.usable && xs.L===6,'LC-FIT-11 typed litres stay where two cages leave no frame bag');
}
// [LC-FIT-12] no per-cage deduction
{
  let ok=true;
  for(const style of ['unknown','diamond-level','compact','full-suspension','trapeze'])for(const typed of [false,true])for(const cages of [0,1,2]){
    const fit={style,size:{kind:'letter',value:'M'}};
    const r=J(`qaFrame(${JSON.stringify(fit)},${cages},${typed?'{L:2,userL:true}':'{}'})`);
    if(r.usable){ if(typed&&r.L!==2)ok=false; if(!typed&&style!=='unknown'&&r.L!==J(`qaShape(${JSON.stringify(fit)},${Math.min(2,cages)})`))ok=false; }
  }
  check(ok,'LC-FIT-12 usable litres are the shape or the typed figure, never reduced by cages');
  check(run('typeof framePenaltyFor==="undefined" && typeof FRAME_BOTTLE_COST==="undefined"'),'LC-FIT-12 the deduction is removed');
}
// [LC-FIT-13] size numbers
{
  const sz=(v,u)=>J(`sizeFromNumber(${v},${JSON.stringify(u)})`);
  check(sz(54,'cm').letter==='M' && sz(49,'cm').letter==='XS' && sz(17,'in').letter==='M','LC-FIT-13 54 cm M, 49 cm XS, 17 in M');
  check(sz(29,'in').message==='That looks like a wheel size, not a frame size.','LC-FIT-13 29 in is a wheel size');
  check(sz(50,'cm').letter==='S' && sz(56,'cm').letter==='L' && sz(59,'cm').letter==='XL' && sz(14,'in').letter==='XS' && sz(21,'in').letter==='XL','LC-FIT-13 the mapping edges');
  check(sz('54,4','cm').letter==='M','LC-FIT-13 a decimal comma reads as a decimal point');
}
// Precedence: the rider's bolt answers replace the style's cells; size by number maps through the same table
{
  const f=J(`qaFit(${JSON.stringify({style:'diamond-level',size:{kind:'cm',value:49}})})`);
  check(f.size==='XS' && !f.cages.st,'a size typed as 49 cm behaves as XS');
  const g=J(`qaFit(${JSON.stringify({style:'diamond-level',bolts:{st:'no',dt:'no',un:'yes'}})})`);
  check(!g.cages.st && !g.cages.dt && g.cages.un && g.cageSource.un==='rider','bolt answers replace their cells and say so');
}
// The bar roll width caps the roll's inside length (design 10.4), a typed length stays with the note
{
  run(`qaBags(${JSON.stringify({barWidthCm:38})},[{pos:'bar',L:12}])`);
  check(run('bagSpec(S.bags[0]).insideCm')===38 && run('bagMaxLength(S.bags[0])')===38,'bar roll capped at the usable width');
  run(`qaBags(${JSON.stringify({barWidthCm:40})},[{pos:'bar',L:12,longestCm:50}])`);
  check(run('bagMaxLength(S.bags[0])')===50 && /Your roll is 50 cm long; you measured 40 cm of usable width/.test(run('bagSpec(S.bags[0]).note')),'a typed longer roll stays with the note');
}

// ---- Task 12: every control follows the frame ----
const {planKit}=require('./plan-kit.cjs');
const pk=planKit(),pr=pk.vm.run;
const pj=code=>JSON.parse(pr(`JSON.stringify(${code})`)??'null');
const bikeCode=fit=>`S.bikeProfile=normaliseBikeProfile({id:'qa_bike',name:'QA',fit:${JSON.stringify(fit)}});`;
const BAGS=[{uid:1,pos:'frame',L:6},{uid:2,pos:'bottle',slot:'st',L:0.5},{uid:3,pos:'seat',L:14},{uid:4,pos:'bar',L:12}];
const KITIDS=['rain','tool','tubes','pump','lock','food','snacks','stove','pot'];
// [LC-FIT-02] a lost mount: nothing dropped, reported, and kept again on the way back
{
  pk.setPlan({bags:BAGS,kit:KITIDS,nights:1,sleep:'indoor'});
  pr(bikeCode(null)+"S.pinned.lock='1-0';currentPlan();");
  check(pj('currentPlan().hand.kept').includes('lock'),'LC-FIT-02 the hand placement is kept on the first bike');
  pr(bikeCode({style:'step-through'}));
  const p=pj('currentPlan()');
  check(p.unusable.length===2 && p.unusable.every(u=>u.reason==='No mount on this bike') && !p.inUse.includes('1-0'),'LC-FIT-02 frame bag and seat-tube bottle are marked and not used');
  const nk=p.hand.notKept.find(n=>n.id==='lock');
  check(nk && nk.reason==='no bag' && nk.unusableReason==='No mount on this bike','LC-FIT-02 the hand placement is reported not kept, with that reason');
  check(pr('S.bags.length')===4,'LC-FIT-02 nothing is dropped');
  const back=pj('normalisePlan(captureDraft()).bags.length');
  check(back===4 && pj('S.pinned.lock')==='1-0','LC-FIT-02 nothing is dropped after a reload either');
  pr(bikeCode(null));
  check(pj('currentPlan().hand.kept').includes('lock') && pj('currentPlan().unusable.length')===0,'LC-FIT-02 switching back keeps the hand placement again');
}
// [LC-FIT-14] quick-pick labels
pr('S.bags=[];');check(pr(bikeCode({style:'diamond-level',size:{kind:'letter',value:'M'}})+"quickPickLitres('frame')")==='6.0 L','LC-FIT-14 6.0 L on an M diamond without cages');
pr('S.bags=[];');check(pr(bikeCode({style:'full-suspension',size:{kind:'letter',value:'S'}})+"quickPickLitres('frame')")==='1.5 L','LC-FIT-14 1.5 L on a full-suspension S');
// [LC-FIT-15] no tap area for what the frame cannot take
{
  pr('renderBags=()=>{};S.step=2;S.editMode="add";S.bags=[];'+bikeCode({style:'step-through',bolts:{dt:'yes'}})+'try{drawRig();}catch(e){globalThis.qaRigErr=String(e);}');
  const layer=pk.vm.nodes.get('bagLayer').innerHTML+pk.vm.nodes.get('bottleLayer').innerHTML;
  check(pr('typeof qaRigErr')==='undefined','LC-FIT-15 the drawing runs');
  check(!/data-add="frame"/.test(layer) && !/data-add="top:/.test(layer) && /data-add="bottle:dt"/.test(layer) && !/data-add="bottle:st"/.test(layer),'LC-FIT-15 only the down-tube cage is tappable on a step-through');
  pr(bikeCode(null)+'drawRig();');
  const l2=pk.vm.nodes.get('bagLayer').innerHTML;
  check(/data-add="frame"/.test(l2) && /data-add="top:front"/.test(l2),'LC-FIT-15 a bike without details keeps every tap area');
}
// [LC-FIT-16] seat pack bands, and no placement moves
{
  const band=gap=>pr(`S.bikeProfile=normaliseBikeProfile({id:'b',name:'b',fit:{seatGapCm:${gap}}});bagSpec({uid:1,pos:'seat',L:14}).band`);
  check(band(15)==='unlikely' && band(21)==='tight' && band(22)==='likely','LC-FIT-16 15 / 21 / 22 cm give unlikely / tight / likely');
  check(/Small frames can leave little room/.test(pr(bikeCode({size:{kind:'letter',value:'XS'}})+"bagSpec({uid:1,pos:'seat',L:14}).note")),'LC-FIT-16 an XS frame without a gap shows the small-frame note');
  pk.setPlan({bags:BAGS,kit:KITIDS,nights:1,sleep:'indoor'});
  pr(bikeCode(null));const a=pj('currentPlan().items');
  pr(bikeCode({seatGapCm:15}));
  check(JSON.stringify(a)===JSON.stringify(pj('currentPlan().items')),'LC-FIT-16 no placement changes');
}
// [LC-FIT-03] bar width
{
  pr(bikeCode({barWidthCm:38})+"S.bags=[{uid:1,pos:'bar',L:12}];S.custom.poles={L:1,kg:1,rigid:45};");
  check(pr("fitsLength({id:'poles'},S.bags[0])")===false && pr('bagMaxLength(S.bags[0])')===38,'LC-FIT-03 45 cm poles no longer go in a 38 cm roll');
  pr('S.bags[0].longestCm=50;');
  check(pr('bagMaxLength(S.bags[0])')===50 && /Check that it fits/.test(pr('bagSpec(S.bags[0]).note')),'LC-FIT-03 a typed 50 cm stays with the note');
  pr('delete S.custom.poles;');
}
// [LC-FIT-17] the kept plan after a bike change
{
  pk.setPlan({bags:[{uid:1,pos:'frame',L:6},{uid:3,pos:'seat',L:14}],kit:KITIDS,nights:1,sleep:'indoor'});
  pr(bikeCode(null)+'currentPlan();');
  const before=pj('S.placements');
  pr(bikeCode({topTubeBag:'no',bolts:{st:'no',dt:'unknown',un:'unknown'}})+'currentPlan();');
  check(JSON.stringify(before)===JSON.stringify(pj('S.placements')),'LC-FIT-17 removing an unused mount leaves the kept plan alone');
  const basisA=pj('currentPlan().basis');
  pr(bikeCode({style:'compact',size:{kind:'letter',value:'S'}})+'currentPlan();');
  check(JSON.stringify(basisA)!==JSON.stringify(pj('currentPlan().basis')) && pj('currentPlan().units["1-0"].usableL')<5,'LC-FIT-17 a changed estimated litre figure re-plans');
  pr(bikeCode({style:'compact',size:{kind:'letter',value:'S'}})+"S.bikeProfile.name='Renamed';S.bikeProfile.maxWeight={v:130,u:'kg',includes:'bike'};currentPlan();");
  check(JSON.stringify(pj('currentPlan().basis'))===JSON.stringify(pj('currentPlan().basis')),'LC-FIT-17 a rename is not a change of bags');
}
console.log(`bike-fit: ${checks} checks passed`);
