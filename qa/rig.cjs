'use strict';
// The rig drawn by bike.js (spec 7.1 item 11 "Launch", 7.4 "Bags and anchors"): the page's tap targets, tags and bags placed from
// the bike's anchors, on the page's own code. No browser here: tests/e2e/rig.spec.ts taps the rig in a real one.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {appVM}=require('./app-vm.cjs');
const axes=JSON.parse(fs.readFileSync(path.join(__dirname,'..','contracts','drawing-set','axes.json'),'utf8'));
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

const q=appVM();
const {run,nodes}=q;
const json=code=>JSON.parse(run(`JSON.stringify(${code})`));
run(`var qaRig=(bike,bags,step,decks,mode)=>{
  S.bikeProfile=bike?normaliseBikeProfile(bike):null;S.bags=bags.map(b=>({...b}));S.nextUid=1+Math.max(0,...S.bags.map(b=>b.uid));
  S.decks={bar:false,rack:false,...(decks||{})};S.step=step;S.editMode=mode||'add';drawRig();
  return document.getElementById('bagLayer').innerHTML+document.getElementById('bottleLayer').innerHTML;};`);
const rig=(bike,bags,step=2,decks={},mode='add')=>run(`qaRig(${JSON.stringify(bike)},${JSON.stringify(bags)},${step},${JSON.stringify(decks)},${JSON.stringify(mode)})`);

// Bag sets in the page's own shape: some owned, the rest offered as dashed spots.
const SETS={
  none:[],
  bikepacking:[{uid:1,pos:'seat',L:14},{uid:2,pos:'bar',L:13},{uid:3,pos:'frame',L:4.5},{uid:4,pos:'top',L:1,slot:'front'},
    {uid:5,pos:'fork',L:3,pair:true},{uid:6,pos:'bottle',slot:'dt',L:0.75}],
  touring:[{uid:1,pos:'rack',L:20,pair:true},{uid:2,pos:'bar',L:9},{uid:3,pos:'bottle',slot:'st',L:0.5},{uid:4,pos:'bottle',slot:'dt',L:0.75},
    {uid:5,pos:'bottleU',slot:'un',L:0.5},{uid:6,pos:'pack',L:12}],
  singles:[{uid:1,pos:'rack',L:10},{uid:2,pos:'fork',L:3},{uid:3,pos:'frame',L:6},{uid:4,pos:'top',L:0.8,slot:'rear'}],
};
// Four wheel sizes of the drawing set's tyres, from a road tyre to a 20-inch wheel and a fat tyre.
const TYRES=['28-622','47-584','26 x 4.0','20 x 2.0'];
const bikeOf=(style,size,bars,tyre)=>({id:'qa_rig',fit:{style,size:{kind:'letter',value:size}},look:{bars},frontTyre:tyre,rearTyre:tyre});

// Every tap target in the markup: its element, its box, and the action of the control it belongs to.
function targets(svg){
  const out=[];const stack=[];
  for(const m of svg.matchAll(/<(\/?)(g|rect|circle|polygon|path|text)\b([^>]*?)(\/?)>/g)){
    const [,close,tag,rest,self]=m;
    if(close){if(tag==='g')stack.pop();continue;}
    const attrs={};for(const a of rest.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g))attrs[a[1]]=a[2];
    if(tag==='g'&&!self){stack.push(attrs);continue;}
    if(!/\bhit\b/.test(attrs.class||''))continue;
    const owner=[...stack].reverse().find(g=>['data-add','data-bump','data-del','data-deck','data-deldeck','data-setshape','data-inspect'].some(k=>k in g))||{};
    const action=Object.entries(owner).filter(([k])=>k.startsWith('data-')).map(([k,v])=>k+'='+v).join(' ');
    const turn=stack.map(g=>g.transform).filter(Boolean)[0];
    const n=k=>Number(attrs[k]);
    let box;
    if(tag==='rect')box={x:n('x'),y:n('y'),w:n('width'),h:n('height')};
    else if(tag==='circle')box={x:n('cx')-n('r'),y:n('cy')-n('r'),w:2*n('r'),h:2*n('r'),cx:n('cx'),cy:n('cy'),r:n('r')};
    else{const v=attrs.points.split(/[\s,]+/).map(Number);const xs=v.filter((_,i)=>i%2===0),ys=v.filter((_,i)=>i%2===1);
      box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
    out.push({tag,box,action,turn,nested:stack.some(g=>'data-setshape' in g),owner});
  }
  return out;
}
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>0.01&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>0.01;
const circleHitsRect=(c,b)=>{const dx=Math.max(b.x-c.cx,0,c.cx-(b.x+b.w)),dy=Math.max(b.y-c.cy,0,c.cy-(b.y+b.h));return Math.hypot(dx,dy)<c.r-0.01;};

test('[LC-RIG-ANCHORS] every style, size, handlebar and tyre with each bag set: each tap target sits on its anchor, inside the view, no two overlapping',()=>{
  let drawn=0,hits=0;
  for(const style of axes.styles)for(const size of axes.sizes)for(const bars of axes.bars)for(const tyre of TYRES)for(const [set,bags] of Object.entries(SETS)){
    const name=`${style} ${size} ${bars} ${tyre||'no tyre'} ${set}`;
    const svg=rig(bikeOf(style,size,bars,tyre),bags,2,set==='bikepacking'?{bar:true}:set==='touring'?{rack:true}:{});
    const a=json('rigAnchors()');
    const list=targets(svg);
    hits+=list.length;drawn++;
    for(const t of list){
      assert.ok(t.box.x>=-0.01&&t.box.y>=-0.01&&t.box.x+t.box.w<=320.01&&t.box.y+t.box.h<=150.01,`${name}: ${t.action} inside the view`);
      assert.ok(t.box.w>0&&t.box.h>0,`${name}: ${t.action} has size`);
    }
    // each target on its anchor: the cage's circle on its bolt, a spot's rectangle over the place bike.js gives it
    for(const t of list.filter(t=>t.tag==='circle')){
      const sid=(t.action.match(/bottle:(st|dt|un)/)||[])[1]||Object.entries(a.bottles).find(([,s])=>s&&Math.abs(s.cx-t.box.cx)<0.02&&Math.abs(s.cy-t.box.cy)<0.02)?.[0];
      assert.ok(sid&&a.bottles[sid],`${name}: a cage target sits on a bolt the bike has`);
      assert.ok(Math.abs(a.bottles[sid].cx-t.box.cx)<0.02&&Math.abs(a.bottles[sid].cy-t.box.cy)<0.02,`${name}: the ${sid} cage target is on its bolt`);
    }
    for(const t of list.filter(t=>t.tag==='rect'&&/data-add=(seat|bar|pack|rack|fork|top:front|top:rear)$/.test(t.action))){
      const key=t.action.split('=')[1];
      const place=key==='top:front'?a.top.front:key==='top:rear'?a.top.rear:a[key];
      assert.ok(place,`${name}: ${key} has a place`);
      const cx=place.x+place.w/2,cy=place.y+place.h/2;
      assert.ok(cx>=t.box.x-0.01&&cx<=t.box.x+t.box.w+0.01&&cy>=t.box.y-0.01&&cy<=t.box.y+t.box.h+0.01,`${name}: the ${key} target covers its place`);
    }
    // no two targets of different controls overlap; the frame bag's triangle sits under its cages and shape numbers by design
    const flat=list.filter(t=>t.tag!=='polygon');
    for(let i=0;i<flat.length;i++)for(let j=i+1;j<flat.length;j++){
      const [p,r]=[flat[i],flat[j]];
      if(p.action===r.action)continue;
      if(p.nested&&r.nested)continue;      // the three shape numbers sit side by side inside one frame bag
      const hit=p.tag==='circle'&&r.tag==='circle'?Math.hypot(p.box.cx-r.box.cx,p.box.cy-r.box.cy)<p.box.r+r.box.r-0.01
        :p.tag==='circle'?circleHitsRect(p.box,r.box):r.tag==='circle'?circleHitsRect(r.box,p.box):overlap(p.box,r.box);
      assert.ok(!hit,`${name}: ${p.action} and ${r.action} overlap`);
    }
  }
  assert.ok(drawn>=7*5*3*4*4&&hits>drawn*4,`drawn ${drawn}, ${hits} targets`);
});

test('[LC-RIG-ANCHORS] the cages and the frame bag follow the bike: no cage target where bikeFit says there is no bolt, no frame bag on a step-through',()=>{
  const svg=rig(bikeOf('step-through','M','flat',''),[],2);
  assert.ok(!/data-add="frame"/.test(svg),'no frame bag spot on a step-through');
  assert.ok(!/data-add="bottle:/.test(svg),'a step-through has no cage bolts by default');
  const bolts=rig({id:'qa_rig',fit:{style:'diamond-sloping',bolts:{st:'no',dt:'yes',un:'yes'}}},[],2);
  assert.ok(!/data-add="bottle:st"/.test(bolts)&&/data-add="bottle:dt"/.test(bolts)&&/data-add="bottle:un"/.test(bolts),'cages exactly where the rider has bolts');
  const plain=rig(null,[],2);
  for(const key of ['seat','bar','pack','rack','fork','frame','top:front','top:rear','bottle:st','bottle:dt','bottle:un'])assert.ok(plain.includes(`data-add="${key}"`),`no bike: ${key} offered, as before`);
});

test('[LC-RIG-TAPS] every control that worked before still works: add, a second of a pair, remove, decks, frame shape; tags name every place',()=>{
  const plain={id:'qa_rig'};
  let svg=rig(plain,[],2);
  for(const pos of ['seat','bar','frame','fork','rack','pack','top','frame'])assert.ok(new RegExp(`<text class="bag-tag"[^>]*>${json(`POSITIONS.${pos}.short`)}</text>`).test(svg),`${pos} is named`);
  // add every offered spot, one tap each, as the click handler does
  for(const key of ['seat','bar','frame','fork','rack','pack','top:front','top:rear','bottle:dt']){
    const before=json('S.bags.length');
    const [pos,slot]=key.split(':');
    run(`addBag(${JSON.stringify(pos)},${JSON.stringify(slot||undefined)})`);
    assert.equal(json('S.bags.length'),before+1,`a tap on ${key} adds it`);
  }
  svg=run('document.getElementById("bagLayer").innerHTML');
  // a second of a pair: the fork bag shows where its pair goes
  const fork=json("S.bags.find(b=>b.pos==='fork').uid");
  assert.ok(new RegExp(`class="bagg pairghost addable" data-bump="${fork}"`).test(svg),'the second fork bag is offered');
  run(`bumpBag(${fork})`);
  assert.equal(json("S.bags.find(b=>b.pos==='fork').pair"),true,'a tap on it makes a pair');
  // the frame bag's shape numbers, and the deck controls
  svg=run('drawRig();document.getElementById("bagLayer").innerHTML');
  const frame=json("S.bags.find(b=>b.pos==='frame').uid");
  for(const n of [0,1,2])assert.ok(svg.includes(`data-setshape="${frame}:${n}"`),`shape ${n+1} is offered`);
  run(`setFrameShape(${frame},2)`);
  assert.equal(json(`frameShapeIdx(S.bags.find(b=>b.uid===${frame}))`),2,'a tap on 3 sets the half frame');
  assert.ok(svg.includes('data-deck="bar"')&&svg.includes('data-deck="rack"'),'both decks are offered');
  run('toggleDeck("bar");toggleDeck("rack")');
  assert.equal(json('S.decks.bar&&S.decks.rack'),true,'a tap adds each deck');
  // remove mode: every bag and deck can come off
  run("S.editMode='remove';drawRig()");
  svg=run('document.getElementById("bagLayer").innerHTML+document.getElementById("bottleLayer").innerHTML');
  for(const b of json('S.bags'))assert.ok(svg.includes(`data-del="${b.uid}"`),`${b.pos} can be removed`);
  assert.ok(svg.includes('data-deldeck="bar"')&&svg.includes('data-deldeck="rack"'),'decks can be removed');
  const n=json('S.bags.length');run(`removeBag(${frame})`);assert.equal(json('S.bags.length'),n-1,'a tap removes it');
  // step four: every packed bag opens its contents
  run("S.editMode='add';Object.keys(S.kit).forEach(k=>S.kit[k]=false);KIT.forEach(k=>S.kit[k.id]=!!k.on);S.step=4;drawRig()");
  svg=run('document.getElementById("bagLayer").innerHTML');
  const keys=json('Object.keys(INSPECT)');
  assert.ok(keys.length>=4,'packed bags are inspectable');
  for(const k of keys)assert.ok(svg.includes(`data-inspect="${k}"`),`${k} opens`);
  for(const k of keys){const g=json(`INSPECT[${JSON.stringify(k)}]`);assert.ok(g.geom&&g.box.w>0&&g.box.h>0,`${k} has a shape the inspector can lift`);}
});

test('[LC-RIG-TAPS] with no bike.js the page still plans and draws its bags list, and the rig throws nothing',()=>{
  const bare=appVM({bike:false});
  bare.run(`S.bags=[{uid:1,pos:'seat',L:14}];S.step=2;drawRig();`);
  assert.equal(bare.run('document.getElementById("rigBike").innerHTML'),'');
  assert.equal(bare.run('frameShapeGlyph({pos:"frame"})'),'');
  assert.ok(bare.run('currentPlan().slots.length')>0);
});

test('[LC-RIG-SAME-PLAN] a bike without frame details plans byte-identically to the frozen root copy, and drawing the rig changes nothing',()=>{
  const old=appVM({page:path.join(__dirname,'..','releases','load-check-root.html'),bike:false});
  const snapshot=(vm,code)=>vm.run(`(()=>{${code};const A=currentPlan();
    return JSON.stringify({slots:A.slots,inUse:A.inUse,items:A.items,overflow:A.overflow,summary:packingSummary(A),
      specs:S.bags.map(b=>bagSpec(b)),cap:capL(),rated:ratedTotal(),water:waterL(),kit:kitL()});})()`);
  const bikes=[null,{id:'qa_plain'},{id:'qa_named',name:'Tourer',frontTyre:'40-622',rearTyre:'40-622',brakes:'rim',look:{colour:'#2563b8',bars:'flat',ebike:true}}];
  let n=0;
  for(const bike of bikes)for(const bags of Object.values(SETS))for(const step of [2,3,4])for(const nights of [0,3]){
    const set=`S.bikeProfile=${bike?`normaliseBikeProfile(${JSON.stringify(bike)})`:'null'};S.bags=${JSON.stringify(bags)};S.step=${step};S.nights=${nights};
      S.decks={bar:true,rack:true};Object.keys(S.kit).forEach(k=>S.kit[k]=false);KIT.forEach(k=>S.kit[k.id]=!!k.on)`;
    const before=snapshot(q,set);
    assert.equal(before,snapshot(old,set),`same plan as the root copy: ${JSON.stringify(bike)} step ${step}`);
    assert.equal(snapshot(q,'drawRig()'),before,'drawing the rig changes nothing');
    n++;
  }
  assert.ok(n>=72);
  // the frozen rules are untouched (the selection fixtures and LC-FREEZE-01 run in their own suite)
  assert.equal(q.run('FRAME_PRESETS.map(p=>p.L+p.label).join()'),old.run('FRAME_PRESETS.map(p=>p.L+p.label).join()'));
});

test('[LC-RIG-THUMB] safeDataThumb keeps the bk-* classes and a hex stroke, so a saved thumbnail keeps its colour; a hostile string still fails',()=>{
  const src=q.script;
  const start=src.indexOf('const drawingClasses = new Set([');
  const list=src.slice(start,src.indexOf(']);',start));
  const svg=run(`bikeDrawing(normaliseBikeProfile({id:'t',look:{colour:'#2f7d4f'}}),null,{theme:'dark'}).svg`);
  const classes=new Set([...svg.matchAll(/class="([^"]*)"/g)].flatMap(m=>m[1].split(/\s+/)));
  for(const c of classes)assert.ok(list.includes(`'${c}'`),`thumbnails keep ${c}`);
  const strokeRule=src.match(/key === 'fill' \|\| key === 'stroke'\) valid = (\/.*\/)\.test\(value\);/)[1];
  const stroke=new Function(`return ${strokeRule}`)();
  assert.ok(stroke.test('#2f7d4f')&&stroke.test('none'),'a hex stroke and fill="none" survive');
  for(const bad of ['url(https://example.test/x)','red;background:url(x)','javascript:alert(1)','#2f7d4f" onload="x'])assert.ok(!stroke.test(bad),`${bad} fails`);
  // the page's own guard rejects what it always did
  assert.ok(src.includes("if(!tags.has(node.localName)"),'only drawing elements are copied');
  assert.ok(!list.includes("'hit'")&&!list.includes("'addable'"),'no tap or edit classes survive');
});

for(const [name,fn] of tests){fn();passed++;console.log('ok',name);}
console.log(`${passed} rig tests passed`);
