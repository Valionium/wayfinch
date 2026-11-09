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

test('[LC-RIG-TAPS] with no bike.js the rig still shows a bike, the bags and every dashed spot, and each still adds its bag',()=>{
  const bare=appVM({bike:false});
  bare.run(`S.bags=[{uid:1,pos:'seat',L:14}];S.nextUid=2;S.decks={bar:false,rack:false};S.step=2;S.editMode='add';drawRig();`);
  assert.ok(/class="bg-line"/.test(bare.run('document.getElementById("rigBike").innerHTML')),'the plain bike outline of today');
  const svg=bare.run('document.getElementById("bagLayer").innerHTML+document.getElementById("bottleLayer").innerHTML');
  assert.ok(/class="bagg owned[^"]*" data-bump="1"|class="bagg owned[^"]*"/.test(svg),'the seat pack is drawn');
  for(const key of ['bar','frame','fork','rack','pack','top:front','top:rear','bottle:st','bottle:dt','bottle:un'])assert.ok(svg.includes(`data-add="${key}"`),`${key} is offered`);
  assert.ok(svg.includes('data-deck="rack"'),'the rack deck is offered');
  assert.ok(/<rect class="hit"/.test(svg),'with its tap targets');
  bare.run("addBag('frame')");
  assert.equal(bare.run("S.bags.some(b=>b.pos==='frame')"),true);
  assert.ok(bare.run('frameShapeGlyph(S.bags.find(b=>b.pos==="frame"))').includes('sg-bag'),'the frame-bag picture beside its controls');
  bare.run('Object.keys(S.kit).forEach(k=>S.kit[k]=false);KIT.forEach(k=>S.kit[k.id]=!!k.on);S.step=4;drawRig()');
  assert.ok(bare.run('Object.keys(INSPECT).length')>0,'the finished plan opens its bags');
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

// The groups of the rig's markup with their silhouette, inside lines and tap target, each in the drawing's frame.
function shapeGroups(svg){
  const out=[];const stack=[];
  for(const m of svg.matchAll(/<(\/?)(g|rect|circle|polygon|path|text)\b([^>]*?)(\/?)>/g)){
    const [,close,tag,rest,self]=m;
    if(close){if(tag==='g'){const g=stack.pop();if(g&&g.top)out.push(g);}continue;}
    const attrs={};for(const a of rest.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g))attrs[a[1]]=a[2];
    if(tag==='g'&&!self){const top=/\bbagg\b/.test(attrs.class||'');const g={attrs,top,shells:[],details:0,hits:[],turn:attrs.transform||null};
      if(!top&&stack.length){const owner=stack[stack.length-1];g.owner=owner.owner||owner;}stack.push(g);
      if(/\bbk-detail\b/.test(attrs.class||'')){const o=g.owner;if(o)o.details++;}continue;}
    const g=stack.length?(stack[stack.length-1].owner||stack[stack.length-1]):null;if(!g)continue;
    const turn=stack.map(x=>x.turn).filter(Boolean)[0]||null;
    if(/\bbag-shell\b/.test(attrs.class||''))g.shells.push({tag,attrs,turn});
    if(/\bhit\b/.test(attrs.class||''))g.hits.push({tag,attrs});
  }
  return out;
}
const turnPt=([x,y],t)=>{const m=t&&/^rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)$/.exec(t);if(!m)return [x,y];
  const a=Number(m[1])*Math.PI/180,cx=Number(m[2]),cy=Number(m[3]);return [cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)];};
const pathPts=d=>{const v=(d.match(/-?\d*\.?\d+/g)||[]).map(Number);const p=[];for(let i=0;i+1<v.length;i+=2)p.push([v[i],v[i+1]]);return p;};
const inHit=(p,h)=>{const n=k=>Number(h.attrs[k]);
  if(h.tag==='rect')return p[0]>=n('x')-0.01&&p[0]<=n('x')+n('width')+0.01&&p[1]>=n('y')-0.01&&p[1]<=n('y')+n('height')+0.01;
  if(h.tag==='circle')return Math.hypot(p[0]-n('cx'),p[1]-n('cy'))<=n('r');
  const q=h.attrs.points.split(/[\s,]+/).map(Number);let c=false;
  for(let i=0,j=q.length-2;i<q.length;j=i,i+=2){if((q[i+1]>p[1])!==(q[j+1]>p[1])&&p[0]<(q[j]-q[i])*(p[1]-q[i+1])/(q[j+1]-q[i+1])+q[i])c=!c;}return c;};

test('[BK-SHAPES-PAGE] the rig draws every bag, empty spot and pair ghost as its real shape, and the middle of each shape is inside its own tap target',()=>{
  let groups=0;
  for(const style of axes.styles)for(const size of ['XS','M','XL'])for(const tyre of TYRES)for(const [set,bags] of Object.entries(SETS)){
    const bike=bikeOf(style,size,'drop',tyre);
    for(const [step,mode] of [[2,'add'],[2,'remove'],[3,'add']]){
      const where=`${style} ${size} ${tyre} ${set} step ${step} ${mode}`;
      for(const g of shapeGroups(rig(bike,bags,step,{},mode))){
        const cls=g.attrs.class;
        if(/\b(deck|ghostdeck)\b/.test(cls))continue; // the decks keep their strap boxes
        assert.equal(g.shells.length,1,`${where}: one silhouette in ${cls}`);
        const sh=g.shells[0];
        assert.equal(sh.tag,'path',`${where}: ${cls} is a shape, not a box`);
        assert.equal(g.details,/\bowned\b/.test(cls)?1:0,`${where}: inside lines on owned bags only (${cls})`);
        const pts=pathPts(sh.attrs.d).map(p=>turnPt(p,sh.turn));
        const mid=[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length];
        if(g.hits.length){assert.ok(g.hits.some(h=>inHit(mid,h)),`${where}: the middle of ${cls} ${JSON.stringify(Object.fromEntries(Object.entries(g.attrs).filter(([k])=>k.startsWith('data-'))))} is on its tap target`);groups++;}
      }
    }
  }
  assert.ok(groups>500,`${groups} shapes with targets`);
  // the Gear advisor's sketches draw the bags as shapes too; bikeDrawing without `shaped` stays the app's drawing (C-DRAWING-SET)
  const view={items:[{pos:'seat',L:12,fill:.5},{pos:'rack',L:20,pair:true,fill:[.5,.5]}],decks:{bar:null,rack:null},bottles:[]};
  const prof=JSON.stringify(bikeOf('diamond-sloping','M','drop','47-584'));
  assert.match(run(`bikeDrawing(${prof},${JSON.stringify(view)},{theme:'dark',idPrefix:'q'},true).svg`),/<g class="bk-detail"/);
  assert.doesNotMatch(run(`bikeDrawing(${prof},${JSON.stringify(view)},{theme:'dark',idPrefix:'q'}).svg`),/bk-detail/);
  const sketches=(fs.readFileSync(path.join(__dirname,'..','public','tools','bags','index.html'),'utf8').match(/bikeDrawing\(S\.bikeProfile,[^\n]*/g)||[]);
  assert.ok(sketches.length>=3&&sketches.every(l=>/, true\);/.test(l)),'every advisor sketch asks for the shapes');
  // a saved thumbnail keeps the shapes' own classes
  const src=fs.readFileSync(path.join(__dirname,'..','public','tools','bags','index.html'),'utf8');
  const start=src.indexOf("const drawingClasses = new Set([");const list=src.slice(start,src.indexOf(']);',start));
  const svg=rig(bikeOf('diamond-sloping','M','drop','47-584'),SETS.bikepacking,3,{},'add')+rig(bikeOf('diamond-sloping','M','drop','47-584'),SETS.touring,3,{},'add');
  for(const c of new Set([...svg.matchAll(/class="([^"]*)"/g)].flatMap(m=>m[1].split(/\s+/))).values())
    if(/^bk-/.test(c))assert.ok(list.includes(`'${c}'`),`thumbnails keep ${c}`);
});

// The owner's decision of 9 Nov 2026 (weight map design, "slim the weight map down"): at the packing check one line under the drawing;
// the map only when the plan differs from the best arrangement the planner finds in the rider's own bags, behind "Show the map". One
// ideal, the rider's own bags (the switch with and without panniers is gone, and with it review of PR 78, m-C).
const FOUND=()=>json(`(()=>{const f=weightMapIdeal(true);return f&&{gain:f.gain,partial:f.partial,note:f.note};})()`);
const DEFAULT_LINE='Your load is as balanced as your bags allow.';
test('[WM-PAGE] the weight map reads the plan as the rig draws it: each packed bag, bottle and the rack deck with its kilos and drawn outline, nothing lost; the line only at the packing check, the map off by default and offered only when the plan differs',()=>{
  const bike=bikeOf('diamond-sloping','M','drop','47-584');
  for(const step of [2,3]){
    rig(bike,SETS.touring,step,{rack:true});
    assert.equal(nodes.get('weightLine').hidden,true,`step ${step}: no line before the packing check`);
    assert.equal(nodes.get('rigWeightMap').hidden,true,`step ${step}: no button before the packing check`);
  }
  for(const [set,bags] of Object.entries(SETS)){
    rig(bike,bags,4,{rack:true});
    const f=FOUND();
    run('drawWeightMap()');
    if(f.note){
      assert.equal(nodes.get('weightLine').hidden,false,`${set}: the line at the packing check`);
      assert.equal(nodes.get('weightLine').textContent,f.note.text,`${set}: the line says what the search found`);
      assert.equal(nodes.get('rigWeightMap').hidden,!f.note.map,`${set}: "Show the map" only when the plan differs from the ideal`);
      if(f.note.map)assert.equal(nodes.get('rigWeightMap').textContent,'Show the map');
    }
    assert.equal(nodes.get('weightMap').hidden,true,`${set}: the map off by default`);
    const got=json(`(()=>{const i=weightMapInput();const A=currentPlan();
      const packed=A.slots.reduce((t,s)=>t+(s.items||[]).reduce((u,k)=>u+placedKg(k),0),0)+deckClaims().reduce((t,k)=>t+itemKg(k),0);
      return {packed,items:i.items.map(x=>({pos:x.pos,kg:x.kg,n:x.outline.length})),keys:Object.keys(i).sort(),scale:i.scale};})()`);
    const kg=got.items.reduce((t,x)=>t+x.kg,0);
    assert.ok(Math.abs(kg-got.packed)<1e-6,`${set}: ${kg} kg on the map, ${got.packed} kg packed`);
    for(const x of got.items)assert.ok(x.n>=3&&x.kg>0,`${set}: ${x.pos} has an outline and kilos`);
    assert.ok(got.scale>0);
    assert.ok(!got.keys.includes('which')&&!got.keys.includes('onIdeal'),`${set}: no switch between two ideals`);
    if(set==='touring')assert.ok(got.items.length>=3,'the packed bags are on the map');
  }
});

// The ideal's own numbers, as the map gets them.
const IDEAL=`(()=>{weightMapIdeal(true);const i=weightMapInput();const kg=l=>l.reduce((t,x)=>t+x.kg,0);const w=l=>l.reduce((t,x)=>t+x.kg*(window.WayfinchAdvisor.WEIGHTS[x.pos]||1),0);
  const d=i.ideal;return {keys:Object.keys(d).sort(),yours:kg(i.items),ideal:kg(d.items),wy:w(i.items),wi:w(d.items),racks:d.items.filter(x=>x.pos==='rack').length,
  yoursRacks:i.items.filter(x=>x.pos==='rack').length,outlines:d.items.every(x=>x.outline.length>=3),back:kg(d.items.filter(x=>x.pos==='pack')),yoursBack:kg(i.items.filter(x=>x.pos==='pack'))};})()`;
test("[WM-IDEAL] one ideal: the rider's own things and kilos in the rider's own bags, balanced; never panniers added or taken away, and the plan never changes",()=>{
  const bike=bikeOf('diamond-sloping','M','drop','47-584');
  for(const [name,bags] of Object.entries({...SETS,'seat, frame and bar':[{uid:1,pos:'seat',L:14},{uid:2,pos:'frame',L:4.5},{uid:3,pos:'bar',L:13}]})){
    if(!bags.length)continue;
    rig(bike,bags,4,{rack:bags.some(b=>b.pos==='rack')});
    const before=run('JSON.stringify([S.bags,S.pinned,S.placements,S.kit,S.decks])');
    const g=json(IDEAL);
    assert.deepEqual(g.keys,['items'],`${name}: the ideal is its bags and kilos, nothing to switch`);
    assert.ok(Math.abs(g.ideal-g.yours)<0.01,`${name}: the same kilos (${g.ideal} and ${g.yours})`);
    assert.ok(g.wi<=g.wy+1e-6,`${name}: never worse than yours by the handling weights (${g.wi} and ${g.wy})`);
    assert.ok(g.back<=g.yoursBack+1e-6,`${name}: never more on the back`);
    assert.equal(g.outlines,true,`${name}: every bag drawn`);
    assert.equal(g.racks,g.yoursRacks,`${name}: no panniers added or taken away`);
    assert.equal(run('JSON.stringify([S.bags,S.pinned,S.placements,S.kit,S.decks])'),before,`${name}: the plan is as it was`);
  }
  assert.equal(json("typeof idealSetup+' '+typeof idealFirst"),'undefined undefined','the two ideals are gone');
});

// Review of PR 78, m-A: "no better balance" showed where putting the spork or the tyre levers into a fork cage still lowered the score
// (a thing moved to a heavier place lets the re-pack put heavier things where it was). The probe: from the ideal, every single placement
// of one thing into another bag in use, whichever way it weighs (split things whole too), and every swap of two things in different bags;
// none that the planner keeps where it was put may keep the promises (measured from the plan) and lower the score by 0.01 or more once
// the search has finished. The default line only then; where the search found more, it is real.
const PROBE=()=>json(`(()=>{const W=window.WayfinchAdvisor.WEIGHTS;
  const sc=r=>Math.round(Object.entries(r.kgByPos).reduce((t,[p,k])=>t+(k||0)*W[p],0)*100)/100;
  const f=weightMapIdeal(true),b=f.balanced,st=f.start.result,sp=new Set(st.spillIds);
  const keeps=r=>r.overL<=st.overL+0.005&&r.spillIds.every(id=>sp.has(id))&&r.backL<=st.backL+0.005&&r.outOfReach<=st.outOfReach;
  const best=sc(b.packing.result),better=[];let n=0;
  const tryPins=(pins,name)=>{n++;const t=idealTrial(S.bags,{...b.pins,...pins},b.packing.state),r=t.result;
    const placed=Object.entries(pins).every(([id,key])=>(t.state.items[id]||[]).length>0&&t.state.items[id].every(u=>u[0]===key));
    if(placed&&keeps(r)&&sc(r)<=best-0.01)better.push(name+' '+best+'>'+sc(r));};
  if(!f.partial){
    const ids=Object.keys(b.packing.state.items).filter(id=>!(kitById(id)||{}).divisible);
    ids.forEach(id=>b.packing.rooms.forEach(r=>{const at=b.packing.state.items[id]||[];if(!(at.length===1&&at[0][0]===r.key))tryPins({[id]:r.key},id+'>'+r.key);}));
    const P=b.packing.pieces;P.forEach(p=>P.forEach(q=>{if(p.unit!==q.unit&&p.kg>q.kg&&W[q.pos]<W[p.pos])tryPins({[p.id]:q.unit,[q.id]:p.unit},p.id+'<>'+q.id);}));
  }
  return {partial:f.partial,gain:f.gain,text:f.note&&f.note.text,groups:f.note?f.note.groups.length:0,min:window.WayfinchAdvisor.MIN_GAIN_SCORE,keeps:keeps(b.packing.result),plan:sc(st),best,better,n};})()`);
const MA_PLAN=[{uid:1,pos:'frame',L:4.5},{uid:2,pos:'fork',L:5,pair:true}];
test('[WM-IDEAL] the ideal is a balance no single placement of one thing (either way) or swap improves while keeping the promises, once the search finished; the default line only with nothing the rider fixed moved and no clearly better balance',()=>{
  const bike=bikeOf('diamond-sloping','M','drop','47-584');
  const plans={
    'the frame bag and two fork cages (review of PR 78, m-A)':MA_PLAN,
    'a backpack alone':[{uid:1,pos:'pack',L:30}],
    touring:SETS.touring,
    bikepacking:SETS.bikepacking,
    'full bags and a backpack':[{uid:1,pos:'seat',L:9},{uid:2,pos:'bar',L:9},{uid:3,pos:'frame',L:6},{uid:4,pos:'pack',L:30}],
  };
  let finished=0;
  for(const [name,bags] of Object.entries(plans)){
    rig(bike,bags,4,{rack:bags.some(b=>b.pos==='rack')});
    const r=PROBE();
    assert.equal(r.keeps,true,`${name}: the ideal keeps every promise`);
    assert.ok(r.best<=r.plan,`${name}: never worse than the plan`);
    assert.ok(Math.abs(r.plan-r.best-r.gain)<0.006,`${name}: the gain is the plan's score less the ideal's (${r.plan} - ${r.best}, ${r.gain})`);
    if(!r.partial){finished++;assert.deepEqual(r.better,[],`${name}: ${r.n} trials; none of them may beat the finished ideal`);}
    // the owner's choice of 9 Nov 2026: the balancing reaches the best balance itself, so a gain under its threshold left is the default line
    if(r.text===DEFAULT_LINE)assert.ok(r.gain<r.min,`${name}: the default line only with less than ${r.min} better left (${r.gain})`);
    else if(r.text)assert.ok(r.groups>0&&r.gain>=r.min,`${name}: a line that says the load could be better, only when it could be (${r.gain})`);
  }
  assert.ok(finished>=3,`the probe ran on finished searches (${finished})`);
  // review of PR 78, m-A: the old note said "no better balance" here, yet the tyre levers into a fork cage lowered the score; the ideal
  // finds that now, and the gain (a few hundredths) is under the balancing's threshold, so the default line (the owner's choice of 9 Nov)
  rig(bike,MA_PLAN,4,{});
  const m=PROBE();
  assert.ok(m.gain>=0.01&&m.gain<m.min,`the frame bag and two fork cages: ${m.gain} better, found`);
  assert.equal(m.text,DEFAULT_LINE);
  rig(bike,[{uid:1,pos:'pack',L:30}],4,{});
  assert.equal(PROBE().text,DEFAULT_LINE,'a backpack alone: nothing to move, so the default line');
});

// The line's words (the owner's decision of 9 Nov): which of the rider's hand placements and must-reach things the best arrangement
// found puts elsewhere, and what that does, from the same search; never a guess.
const NOTE=()=>json(`(()=>{const f=weightMapIdeal(true);const to=new Map(f.balanced.packing.pieces.map(p=>[p.id,p]));
  const from=new Map(f.start.pieces.map(p=>[p.id,p]));
  return {gain:f.gain,partial:f.partial,text:f.note&&f.note.text,map:f.note&&f.note.map,groups:(f.note&&f.note.groups||[]).map(g=>({...g,things:g.things.map(t=>({...t,
    was:from.get(t.id)&&from.get(t.id).unit,now:to.get(t.id)&&to.get(t.id).unit,pinned:(S.pinned||{})[t.id]||null,
    must:!!(kitById(t.id)&&isMustReach(kitById(t.id))&&reachableFor(kitById(t.id),from.get(t.id).pos))}))}))};})()`);
const BANNED=/safe|guarant|prevent|you should|must not|warning|error|fail/i;
test('[WM-NOTE] the line names the hand placements and must-reach things the best arrangement found puts elsewhere, and what they do; otherwise the default line, and nothing when the planner could do clearly better itself',()=>{
  const bike=bikeOf('diamond-sloping','M','drop','47-584');
  const seen=new Set();
  const check=name=>{
    const n=NOTE();
    if(!n.text){assert.ok(!n.groups.length&&n.gain>=json('window.WayfinchAdvisor.MIN_GAIN_SCORE'),`${name}: no line only when the planner could do clearly better itself (${n.gain})`);return n;}
    assert.ok(!BANNED.test(n.text),`${name}: plain words (${n.text})`);
    seen.add(n.text===DEFAULT_LINE?'default':'groups');
    if(n.text===DEFAULT_LINE){assert.equal(n.map,false,`${name}: no map with the default line`);assert.ok(n.gain<json('window.WayfinchAdvisor.MIN_GAIN_SCORE'),`${name}: the default line only under the balancing's threshold (${n.gain})`);return n;}
    assert.equal(n.map,true,`${name}: "Show the map" with every other line`);
    for(const g of n.groups){
      for(const t of g.things){
        assert.equal(t.was,g.unit,`${name}: ${t.id} is in the bag the line names`);
        assert.notEqual(t.now,t.was,`${name}: the ideal puts ${t.id} elsewhere`);
        if(g.kind==='hand')assert.equal(t.pinned,g.unit,`${name}: ${t.id} is a hand placement there`);
        else{assert.equal(g.kind,'reach');assert.equal(t.must,true,`${name}: ${t.id} is a must-reach thing within reach there`);assert.notEqual(t.pinned,g.unit);}
      }
      assert.match(n.text,g.kind==='hand'?/Your hand placements? in the /:/Your must-reach things? in the /,`${name}: the kind said`);
    }
    assert.ok(n.groups.length>0&&n.gain>=json('window.WayfinchAdvisor.MIN_GAIN_SCORE'),`${name}: every other line names what the rider fixed, with a gain the balancing would take (${n.text}, ${n.gain})`);
    assert.doesNotMatch(n.text,/better balance is possible/,`${name}: no line beyond the owner's two kinds`);
    return n;
  };
  // each plan balanced first, as the packing check does: the line speaks of what the balancing leaves (review of PR 89, C1)
  const settle=()=>run('DRAFT_READY=true;BALANCE.checked=null;BALANCE.pins=null;BALANCE.run=null;autoBalancePlan();IDEAL_CACHE={key:null,value:null}');
  // bikepacking bags, balanced: what the line says, if anything, holds (with this suite's kit the balancing leaves only a few hundredths;
  // qa/auto-balance.cjs names must-reach things on the page's starting kit)
  rig(bike,SETS.bikepacking,4,{});settle();
  check('bikepacking');
  // a hand placement: the heaviest thing of the frame bag put in the seat pack by hand
  const heavy=json(`(()=>{const f=weightMapIdeal(true);const p=f.start.pieces.filter(p=>p.pos==='frame').sort((a,b)=>b.kg-a.kg)[0];return p&&p.id;})()`);
  run(`S.pinned={${JSON.stringify(heavy)}:'1-0'};S.placements=null;currentPlan();drawRig()`);settle();
  assert.equal(json(`currentPlan().items[${JSON.stringify(heavy)}][0][0]`),'1-0','the planner keeps the hand placement');
  const hand=check('a hand placement in the seat pack');
  assert.ok(hand.groups.length&&hand.groups[0].kind==='hand',`a hand placement named first (${hand.text})`);
  assert.match(hand.text,/^Your hand placement in the seat pack \([^)]+\) puts more weight at the rear\./);
  run('S.pinned={};S.placements=null');
  for(const [name,bags] of Object.entries(SETS)){rig(bike,bags,4,{rack:bags.some(b=>b.pos==='rack')});check(name);settle();check(name+', balanced');}
  rig(bike,[{uid:1,pos:'pack',L:30}],4,{});
  assert.equal(check('a backpack alone').text,DEFAULT_LINE);
  assert.ok(seen.has('default')&&seen.has('groups'),`the lines seen: ${[...seen]}`);
});

test("[WM-NOTE] things are listed with \"and\", four or more as two and how many more; a kit name's first letter is lowered unless it is a capital word, a thing the rider added reads as typed",()=>{
  const words=json(`[noteList(['rain gear']),noteList(['rain gear','socks']),noteList(['rain gear','socks','pump']),noteList(['rain gear','socks','pump','tyre levers']),kitWord({name:'ID, cards, insurance'}),kitWord({name:'Rain gear'}),kitWord({name:'my Thing',added:true})]`);
  assert.deepEqual(words,['rain gear','rain gear and socks','rain gear, socks and pump','rain gear, socks and 2 more','ID, cards, insurance','rain gear','my Thing']);
});

test("[WM-NEUTRAL] the bike in the weight maps has no frame colour or paint, and the same shape as the rig's",()=>{
  const bike={...bikeOf('diamond-sloping','M','drop','47-584'),look:{bars:'drop',colour:'#c62f2a',ebike:true}};
  // the packing check, where the map is (the owner's decision of 9 Nov 2026)
  rig(bike,SETS.bikepacking,4,{});
  const r=json(`(()=>{weightMapIdeal(true);const i=weightMapInput();return {map:i.bike,rig:rigArt().svg,same:JSON.stringify(rigArt(true).anchors)===JSON.stringify(rigArt().anchors)};})()`);
  assert.ok(r.rig.includes('#c62f2a'),'the rig is red');
  assert.ok(!r.map.includes('#c62f2a'),"the maps' bike is not");
  assert.ok(r.map.includes('bk-'),'it is the bike drawing');
  assert.equal(r.same,true,'the same shape and anchors');
});

// The owner's finding G (8 Nov 2026): the handlebar roll's straps stood in the air beside the roll.
test('[BK-BAR-STRAPS] once the kit is chosen the bar straps are drawn on the roll, for every style, size and bar; while editing their tap target stays where it was',()=>{
  const box=(svg,cls)=>{const g=svg.match(new RegExp(`<g class="bagg [^"]*\\b${cls}\\b[^"]*"[^>]*>(.*?)</g>`));if(!g)return null;
    const r=g[1].match(/<rect class="bag-shell" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/);return r&&{x:+r[1],y:+r[2],w:+r[3],h:+r[4]};};
  let n=0;
  for(const style of axes.styles)for(const size of axes.sizes)for(const bars of axes.bars){
    const bike=bikeOf(style,size,bars,'47-584');
    for(const L of [5,9,16]){
      const svg=rig(bike,[{uid:1,pos:'bar',L},{uid:2,pos:'seat',L:10}],3,{bar:true});
      const roll=json("(()=>{const o=Object.values(RIG_OUTLINES).filter(x=>x.pos==='bar').flatMap(x=>x.outline);const xs=o.map(p=>p[0]),ys=o.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};})()");
      const d=box(svg,'deck-bar');
      assert.ok(d,`${style} ${size} ${bars} ${L} L: the straps are drawn`);
      const cx=d.x+d.w/2;
      assert.ok(cx>roll.x&&cx<roll.x+roll.w,`${style} ${size} ${bars} ${L} L: the straps sit over the roll (${cx} in ${roll.x}..${roll.x+roll.w})`);
      assert.ok(d.y<roll.y+roll.h&&d.y+d.h>roll.y,`${style} ${size} ${bars} ${L} L: on the roll, not above or below it`);
      n++;
    }
    // editing: the strap deck's own tap target, where its anchor puts it
    const edit=rig(bike,[{uid:1,pos:'bar',L:9}],2,{bar:true});
    const hit=json("rigAnchors().hits.find(h=>h.key==='barDeck').box");
    const g=edit.match(/<g class="bagg [^"]*\bdeck-bar\b[^"]*"[^>]*>(.*?)<\/g>/);
    assert.ok(g&&g[1].includes(`<rect class="hit" x="${Math.round(hit.x*100)/100}"`),`${style} ${size} ${bars}: the tap target stays at its anchor while editing`);
  }
  assert.ok(n>=315);
});

for(const [name,fn] of tests){fn();passed++;console.log('ok',name);}
console.log(`${passed} rig tests passed`);
