'use strict';
// Look in Bike details (spec 7.4 "Look", 3.7, 7.1 "Bikes"), on the page's own code: taps that apply at once, Not set, Undo, where a
// look is saved, the link from the co-pilot. No browser here: tests/e2e/app-bike-planner.spec.ts taps the dialog in a real one.
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {appVM,sharedStore}=require('./app-vm.cjs');
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

const BIKE={id:'bike_look_1',name:'Blue tourer',frontTyre:'40-622',rearTyre:'40-622',fit:{style:'diamond-level',size:{kind:'letter',value:'M'}},look:{colour:'#2563b8',bars:'drop',ebike:false}};
const OTHER={id:'bike_look_2',name:'Town bike',fit:{style:'step-through'},look:null};

// A page with its bikes loaded and the draft ready, as after start-up; every write to storage counted.
function page({plan=BIKE,library=[BIKE,OTHER],format}={}){
  const storage=sharedStore();
  const q=appVM({storage});
  const writes=[];
  const set=q.localStorage.setItem;
  q.localStorage.setItem=(k,v)=>{writes.push(k);set(k,v);};
  q.context.history={replaceState(...a){writes.push('history:'+a[2]);}};
  Object.assign(q.context.location,{pathname:'/tools/bags/',search:''});
  q.context.qaPlan=JSON.stringify(plan);q.context.qaLibrary=JSON.stringify(library);q.context.qaFormat=format??null;
  q.run(`BIKE_PROFILES=JSON.parse(qaLibrary).map(normaliseBikeProfile).filter(Boolean);
    S.bikeProfile=normaliseBikeProfile(JSON.parse(qaPlan));DRAFT_READY=true;
    if(qaFormat!==null)window.localStorage.setItem(BIKE_FORMAT_KEY,JSON.stringify(qaFormat));
    window.localStorage.setItem(BIKE_PROFILE_CURRENT_KEY,JSON.stringify(S.bikeProfile));
    window.localStorage.setItem(BIKE_PROFILE_KEY,JSON.stringify(BIKE_PROFILES));`);
  writes.length=0;
  const json=code=>JSON.parse(q.run(`JSON.stringify(${code})`)??'null');
  const stored=key=>q.values.get(key)??null;
  const settle=()=>q.run('BIKE_PROFILE_WRITES.then(()=>true)');
  return {...q,storage,writes,json,stored,settle};
}
const open=(p,bike)=>{p.run(`openBikeDetails(null);fillBikeProfileForm(${bike?`BIKE_PROFILES.find(b=>b.id===${JSON.stringify(bike)})||S.bikeProfile`:'S.bikeProfile'});rememberLookOpening();renderLook();`);};
const stroke=p=>(p.run("document.getElementById('lookPreview').innerHTML").match(/class="bk-paint[^"]*"[^>]*stroke="(#[0-9a-f]{6})"/)||[])[1]||null;

test('[LC-LOOK-TAPS] every colour, bar and e-bike choice is a labelled radio, no text input; each target is at least 44 px',()=>{
  const p=page();
  p.run('renderLookChoices()');
  const sw=p.run("document.getElementById('lookSwatches').innerHTML"),bars=p.run("document.getElementById('lookBars').innerHTML"),eb=p.run("document.getElementById('lookEbike').innerHTML");
  const radios=html=>[...html.matchAll(/<label class="look-(?:swatch|chip)"><input type="radio" name="(\w+)" value="([^"]*)">[\s\S]*?<span>([^<]+)<\/span><\/label>/g)].map(m=>({name:m[1],value:m[2],label:m[3]}));
  const colours=radios(sw);
  assert.equal(colours.length,17,'16 swatches and None');
  assert.deepEqual(colours.slice(1).map(c=>c.value),p.json('window.WayfinchBike.SWATCHES.map(w=>w.hex)'));
  assert.ok(colours.every(c=>c.label.trim().length>0),'each swatch is named');
  assert.deepEqual(radios(bars).map(c=>c.label),['Drop','Flat','Other','Not set']);
  assert.deepEqual(radios(eb).map(c=>c.label),['Yes','No','Not set']);
  // the section holds no text input: only radios and the phone's own colour picker
  const html=p.html,section=html.slice(html.indexOf('id="bikeLook"'),html.indexOf('id="bikeMoreDetails"'));
  const inputs=[...section.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]);
  assert.ok(inputs.length===1&&/type="color"/.test(inputs[0]),'More colours is the phone\'s picker, not a text field');
  assert.ok(!/<textarea|<select/.test(section),'no form fields');
  const css=html.slice(0,html.indexOf('</style>'));
  assert.ok(/\.look-swatch,\.look-chip\{[^}]*min-height:44px;min-width:44px/.test(css),'each choice is at least 44 px');
});

test('[LC-LOOK-INSTANT] a swatch tap repaints the preview and the rig in the same task, before anything is stored',()=>{
  const p=page();
  open(p);
  assert.equal(stroke(p),'#2563b8');
  const before=p.writes.length;
  const t=p.run(`(()=>{const t0=Date.now();setLook({colour:'#c62f2a'});return Date.now()-t0;})()`);
  assert.equal(stroke(p),'#c62f2a','the preview shows it at once');
  assert.ok(/stroke="#c62f2a"/.test(p.run("document.getElementById('rigBike').innerHTML")),'the rig behind too, for the plan\'s bike');
  assert.equal(p.writes.length,before,'storage follows afterwards, never in the way of the drawing');
  assert.ok(t<=50,`drawn in ${t} ms`);
});

test('[LC-LOOK-UNDO] after three changes Undo restores the opening look byte for byte; closing with no change writes nothing',async()=>{
  const p=page();
  const beforePlan=p.stored('loadcheck:bikeProfile'),beforeLib=p.stored('loadcheck:bikeProfiles');
  open(p);
  p.run('closeBikeDetails()');
  await p.settle();
  assert.deepEqual(p.writes,[],'opening and closing writes nothing');
  open(p);
  p.run("setLook({colour:'#f1c232'});setLook({bars:'flat'});setLook({ebike:true})");
  assert.equal(p.run("document.getElementById('lookUndo').classList.contains('hidden')"),false,'Undo is there after a change');
  await p.settle();
  assert.notEqual(p.stored('loadcheck:bikeProfile'),beforePlan);
  p.run('undoLook()');
  await p.settle();
  assert.equal(p.stored('loadcheck:bikeProfile'),beforePlan,'the plan\'s bike, byte for byte');
  assert.equal(p.stored('loadcheck:bikeProfiles'),beforeLib,'its saved copy, byte for byte');
  assert.deepEqual(p.json('S.bikeProfile.look'),BIKE.look);
  assert.equal(stroke(p),'#2563b8','the preview is back too');
});

test('[LC-LOOK-NOTSET] each choice goes back to Not set: no colour is the outline, no bars is the guess, an empty look is stored as null',async()=>{
  const p=page();
  open(p);
  p.run("setLook({colour:null})");
  assert.equal(stroke(p),null,'no colour: no paint');
  assert.ok(/class="bk-frame"/.test(p.run("document.getElementById('lookPreview').innerHTML")),'the frame in the theme\'s outline');
  p.run("setLook({bars:null})");
  assert.equal(p.run("document.getElementById('lookGuess').textContent"),'Handlebar: drop · guessed');
  p.run("setLook({ebike:null})");
  assert.equal(p.json('S.bikeProfile.look'),null,'an empty look is null');
  await p.settle();
  assert.equal(JSON.parse(p.stored('loadcheck:bikeProfile')).look,null);
  assert.equal(JSON.parse(p.stored('loadcheck:bikeProfiles')).find(b=>b.id===BIKE.id).look,null);
  assert.equal(p.run("document.getElementById('lookGuess').textContent"),'Handlebar: drop · guessed · E-bike: no · guessed');
});

test('[LC-LOOK-SAVES] the plan\'s bike updates loadcheck:bikeProfile and its saved copy; a saved bike alone stays out of the plan; lower case; the format guard holds',async()=>{
  const p=page();
  open(p);
  p.run("document.getElementById('lookPicker').value='#A1B2C3';flushLookPicker();LOOK_PICKER_TIMER=1;flushLookPicker();");
  await p.settle();
  assert.equal(JSON.parse(p.stored('loadcheck:bikeProfile')).look.colour,'#a1b2c3');
  assert.equal(JSON.parse(p.stored('loadcheck:bikeProfiles')).find(b=>b.id===BIKE.id).look.colour,'#a1b2c3');
  // a saved bike shown without applying it: only the library changes
  const plan=p.stored('loadcheck:bikeProfile');
  open(p,OTHER.id);
  p.run("setLook({colour:'#2f7d4f'})");
  await p.settle();
  assert.equal(p.stored('loadcheck:bikeProfile'),plan,'the plan keeps its own bike');
  assert.equal(JSON.parse(p.stored('loadcheck:bikeProfiles')).find(b=>b.id===OTHER.id).look.colour,'#2f7d4f');
  assert.equal(p.json('S.bikeProfile.id'),BIKE.id);
  assert.match(p.run("document.getElementById('lookStatus').textContent"),/Saved to Town bike/);
  // a newer page's bike list is never overwritten
  const g=page({format:3});
  const lib=g.stored('loadcheck:bikeProfiles'),cur=g.stored('loadcheck:bikeProfile');
  open(g);
  g.run("setLook({colour:'#e46b1f'})");
  await g.settle();
  assert.equal(g.stored('loadcheck:bikeProfiles'),lib);
  assert.equal(g.stored('loadcheck:bikeProfile'),cur);
  assert.equal(g.run("document.getElementById('lookStatus').textContent"),g.run('BIKE_NEWER_MESSAGE'));
});

test('[LC-LOOK-DEEP] #bike-details=<id>&back=trip&section=look opens at Look without applying the bike; new starts one; any other back is You; the fragment goes',async()=>{
  const p=page();
  assert.equal(p.run(`openBikeDetailsFromLink('#bike-details=${OTHER.id}&back=trip&section=look')`),true);
  assert.equal(p.run('BIKE_PROFILE_EDITOR_ID'),OTHER.id,'that bike is shown');
  assert.equal(p.json('S.bikeProfile.id'),BIKE.id,'and not applied to the plan');
  assert.equal(p.run("document.getElementById('bikeDetailsBack').href"),'/#/trip');
  assert.equal(p.run("document.getElementById('bikeDetailsBack').textContent"),'Back to Trip');
  assert.ok(p.writes.includes('history:/tools/bags/'),'the fragment is removed');
  assert.ok(!p.writes.some(k=>k.startsWith('loadcheck:')),'opening writes nothing');
  const q=page();
  q.run(`openBikeDetailsFromLink('#bike-details=new&back=nowhere')`);
  assert.equal(q.run('BIKE_PROFILE_EDITOR_ID'),'','new starts a new bike');
  assert.equal(q.run("document.getElementById('bikeDetailsBack').href"),'/#/you','any other back means You');
  const r=page();
  r.run(`openBikeDetailsFromLink('#bike-details=${BIKE.id}&back=tyre')`);
  assert.equal(r.run('BIKE_PROFILE_EDITOR_ID'),BIKE.id,'the plan\'s own bike');
  assert.equal(r.run("document.getElementById('bikeDetailsBack').href"),'/#/tools/tyre');
  for(const bad of ['#bike-details','#dev','#bike-details=x y','','#bike-details=%E0%A4%A'])assert.equal(r.run(`bikeDetailsLink(${JSON.stringify(bad)})`),null,bad);
  // a new bike from a link, with no bike in the plan: the first tap saves it to the saved bikes, shown at once; the plan stays as it is
  const n=page({plan:null,library:[]});
  n.run(`openBikeDetailsFromLink('#bike-details=new&back=trip&section=look');setLook({colour:'#6b3fa0'})`);
  assert.equal(stroke(n),'#6b3fa0');
  await n.settle();await new Promise(r=>setTimeout(r,5));await n.settle();
  assert.equal(n.json('S.bikeProfile'),null);
  assert.equal(JSON.parse(n.stored('loadcheck:bikeProfiles'))[0].look.colour,'#6b3fa0');
});

test('[LC-LOOK-QUICK] the two-tap start passes unchanged, and Look sits below it',()=>{
  const r=spawnSync(process.execPath,[path.join(__dirname,'bike-quick-start.cjs')],{encoding:'utf8',env:process.env});
  assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''));
  const html=appVM().html,at=s=>html.indexOf(s);
  assert.ok(at('id="bikeQuick"')<at('id="bikeLook"')&&at('id="bikeLook"')<at('id="bikeMoreDetails"'));
});

// ---- Review of PR 42 (C1, I1, minors 1, 2 and 8): a rider never loses a bike, and anything can be changed back ----
// An unsaved plan bike: set by the two-taps start, never saved for next time, so it lives only in the plan.
const UNSAVED={id:'bike_plan_a',name:'Plan bike',frontTyre:'47-584',rearTyre:'47-584',fit:{style:'compact',size:{kind:'letter',value:'S'}},look:{colour:'#2f7d4f',bars:'flat',ebike:null}};
const draftOf=p=>p.run('JSON.stringify(captureDraft())');
const settleAll=async p=>{for(let i=0;i<4;i++){await p.settle();await new Promise(r=>setTimeout(r,5));}};

test('[LC-LOOK-DEEP] Add bike from the co-pilot (#bike-details=new): a tap saves a new bike to the library and never touches the plan\'s unsaved bike',async()=>{
  const p=page({plan:UNSAVED,library:[]});
  const plan=p.stored('loadcheck:bikeProfile'),draft=draftOf(p);
  p.run(`openBikeDetailsFromLink('#bike-details=new&back=you&section=look')`);
  p.run("setLook({colour:'#c62f2a'})");
  await settleAll(p);
  assert.equal(p.json('S.bikeProfile.id'),UNSAVED.id,'the plan keeps its bike');
  assert.equal(p.stored('loadcheck:bikeProfile'),plan,'and its stored copy');
  assert.equal(draftOf(p),draft,'and the plan itself');
  const lib=JSON.parse(p.stored('loadcheck:bikeProfiles'));
  assert.equal(lib.length,1,'a new bike in the library');
  assert.equal(lib[0].look.colour,'#c62f2a');
  assert.equal(p.run('BIKE_PROFILE_EDITOR_ID'),lib[0].id,'Bike details now shows that new bike');
  p.run("setLook({bars:'drop'});quickPickSize('L')");
  await settleAll(p);
  const again=JSON.parse(p.stored('loadcheck:bikeProfiles'));
  assert.equal(again.length,1,'further taps change the same new bike');
  assert.deepEqual([again[0].look.bars,again[0].fit.size.value],['drop','L']);
  assert.equal(p.json('S.bikeProfile.id'),UNSAVED.id);
  // it becomes the plan's bike only by the plain tap for that
  assert.equal(p.run('linkHoldsBike()'),true,'Use this bike for this plan is offered');   // the fake page has no class list: the rule it follows
  await p.run('useShownBike()');
  await settleAll(p);
  assert.equal(p.json('S.bikeProfile.id'),again[0].id);
});

test('[LC-LOOK-DEEP] Edit from You: one size or frame-picture tap changes that saved bike only; the plan keeps its own',async()=>{
  const p=page({plan:UNSAVED,library:[BIKE,OTHER]});
  const plan=p.stored('loadcheck:bikeProfile'),draft=draftOf(p);
  p.run(`openBikeDetailsFromLink('#bike-details=${OTHER.id}&back=you')`);
  p.run("quickPickSize('L')");
  await settleAll(p);
  p.run("quickPickStyle('compact')");
  await settleAll(p);
  assert.equal(p.json('S.bikeProfile.id'),UNSAVED.id,'the plan keeps its bike');
  assert.equal(p.stored('loadcheck:bikeProfile'),plan);
  assert.equal(draftOf(p),draft);
  const other=JSON.parse(p.stored('loadcheck:bikeProfiles')).find(b=>b.id===OTHER.id);
  assert.deepEqual([other.fit.style,other.fit.size.value],['compact','L'],'the saved bike got the taps');
  assert.match(p.run("document.getElementById('bikeProfileStatus').textContent"),/Saved to Town bike/);
});

test('[LC-LOOK-UNDO] New bike in Bike details replacing an unsaved plan bike: said plainly, and Undo brings back that bike, its look and the plan byte for byte',async()=>{
  const p=page({plan:UNSAVED,library:[]});
  const plan=p.stored('loadcheck:bikeProfile'),draft=draftOf(p),bike=p.run('JSON.stringify(S.bikeProfile)');
  open(p);
  p.run('startNewBike()');
  p.run("setLook({colour:'#c62f2a'})");
  await settleAll(p);
  assert.notEqual(p.json('S.bikeProfile.id'),UNSAVED.id,'the two-tap start applies the new bike, as before');
  assert.match(p.run("document.getElementById('bikeSwapNote').textContent"),/Plan bike/,'the page says which bike was replaced');
  assert.equal(p.json('liveBikeSwap().prev.id'),UNSAVED.id,'Undo is offered for it');
  p.run('undoBikeSwap()');
  await settleAll(p);
  assert.equal(p.run('JSON.stringify(S.bikeProfile)'),bike,'the previous plan bike, its look included');
  assert.equal(p.stored('loadcheck:bikeProfile'),plan,'stored byte for byte');
  assert.equal(draftOf(p),draft,'the plan byte for byte');
  assert.equal(p.json('liveBikeSwap()'),null,'and then no longer offered');
});

test('[LC-LOOK-UNDO] Undo belongs to the bike it was opened for: after Use no bike, Undo writes nothing and makes no bike',async()=>{
  const p=page();
  open(p);
  p.run("setLook({colour:'#c62f2a'})");
  await p.run('clearBikeProfile()');
  await settleAll(p);
  const before=[p.stored('loadcheck:bikeProfile'),p.stored('loadcheck:bikeProfiles')];
  p.writes.length=0;
  p.run('undoLook()');
  await settleAll(p);
  assert.equal(p.json('S.bikeProfile'),null);
  assert.deepEqual(p.writes.filter(k=>k.startsWith('loadcheck:bike')),[]);
  assert.deepEqual([p.stored('loadcheck:bikeProfile'),p.stored('loadcheck:bikeProfiles')],before);
  assert.equal(p.json('LOOK_CHANGED || !!liveBikeSwap()'),false,'no Undo for a bike that is not shown');
});

test('[LC-LOOK-NOTSET] a colour chosen for one new bike never carries over to the next one',async()=>{
  const p=page({plan:null,library:[]});
  open(p);
  p.run('startNewBike()');
  p.run("setLook({colour:'#c62f2a'})");
  await settleAll(p);
  assert.equal(p.json('S.bikeProfile.look.colour'),'#c62f2a');
  await p.run('clearBikeProfile()');
  await settleAll(p);
  p.run("quickPickStyle('compact')");
  await settleAll(p);
  assert.equal(p.json('S.bikeProfile.look'),null,'the next new bike starts with no look');
});

test('[LC-LOOK-DEEP] the fragment is read exactly: no bike id turns on dev mode or quiet mode',()=>{
  const p=page();
  assert.deepEqual(p.json("hashFlags('#bike-details=bike_devx1&back=you')"),{dev:false,quiet:false});
  assert.deepEqual(p.json("hashFlags('#bike-details=bike_quiet7&back=you')"),{dev:false,quiet:false});
  assert.deepEqual(p.json("hashFlags('#dev')"),{dev:true,quiet:false});
  assert.deepEqual(p.json("hashFlags('#quiet')"),{dev:false,quiet:true});
  assert.deepEqual(p.json("hashFlags('#dev&quiet')"),{dev:true,quiet:true});
  assert.deepEqual(p.json("hashFlags('')"),{dev:false,quiet:false});
  // and the page reads its flags through it
  assert.ok(/S\.devMode *= *hashFlags\(/.test(p.script.slice(p.script.indexOf('/* ==== 95-init.js ==== */'))),'95-init uses hashFlags');
});

test('[LC-LOOK-UNDO] Undo of a replaced bike keeps every kit choice made since: only what the swap alone changed goes back',async()=>{
  // A tubeless plan bike: its starting kit has tyre plugs; the new, empty bike's has none
  const tubeless={...UNSAVED,tyres:'tubeless'};
  const p=page({plan:tubeless,library:[]});
  p.run("Object.keys(S.kit).forEach(k=>S.kit[k]=false);KIT.forEach(k=>S.kit[k.id]=!!k.on);S.kitTouched={};applyTripKitDefaults();");
  const plan=p.stored('loadcheck:bikeProfile'),bike=p.run('JSON.stringify(S.bikeProfile)');
  assert.equal(p.json('S.kit.plugs'),true,'A starts with plugs');
  const kitA=p.json('S.kit');
  open(p);
  p.run('startNewBike()');
  p.run("quickPickStyle('compact')");
  await settleAll(p);
  assert.notEqual(p.json('S.bikeProfile.id'),UNSAVED.id,'the new bike replaced A');
  assert.equal(p.json('S.kit.plugs'),false,'the swap took the plugs off');
  // the rider's own choice after the swap: a lock packed by hand
  const lockA=kitA.lock;
  p.run(`S.kit.lock=${!lockA};S.kitTouched.lock=true;`);
  const kitBefore=p.json('S.kit');
  const other=p.run('JSON.stringify({placements:S.placements,packed:S.packed,pinned:S.pinned,bags:S.bags,qty:S.qty,kitTouched:S.kitTouched})');
  p.run('undoBikeSwap()');
  await settleAll(p);
  assert.equal(p.run('JSON.stringify(S.bikeProfile)'),bike,'bike A is back, its look included');
  assert.equal(p.stored('loadcheck:bikeProfile'),plan,'and its stored copy');
  assert.equal(p.json('S.kit.lock'),!lockA,'the rider\'s lock stays as the rider set it');
  assert.equal(p.json('S.kit.plugs'),true,'the plugs the swap alone took off come back');
  const kitAfter=p.json('S.kit');
  for(const id of Object.keys(kitBefore)){
    if(id==='plugs')continue;
    const swapChanged=kitA[id]!==kitBefore[id] && id!=='lock';
    assert.equal(kitAfter[id],swapChanged ? kitA[id] : kitBefore[id],`kit ${id}`);
  }
  assert.equal(p.run('JSON.stringify({placements:S.placements,packed:S.packed,pinned:S.pinned,bags:S.bags,qty:S.qty,kitTouched:S.kitTouched})'),other,'placements, ticks and the rest byte for byte');
});


// ---- Look's extras (owner's wish, 5 November 2026): frame pattern, colours, fork, rim depth ----
const MARBLE={pattern:'marble',colours:['#6b3fa0','#1f7f80'],fork:{kind:'pattern',pattern:'camo',pair:2},rimMm:45};
const extrasHtml=p=>Object.fromEntries(['lookPattern','lookColour2','lookColour3','lookFork','lookForkColour','lookForkFade','lookForkPattern','lookForkPair','lookRimBox']
  .map(id=>[id,p.run(`document.getElementById('${id}').innerHTML`)]));
const radiosOf=html=>[...html.matchAll(/<label class="lx-(?:swatch|chip)"><input type="radio" name="(\w+)" value="([^"]*)">[\s\S]*?<span>([^<]+)<\/span><\/label>/g)].map(m=>({name:m[1],value:m[2],label:m[3]}));

test('[LC-LOOK-EXTRAS] Frame pattern, its colours, the fork and the rims are labelled radios and one slider, built from bike.js\'s lists and words',()=>{
  const p=page();
  p.run('renderLookChoices()');
  const h=extrasHtml(p),B=p.json('({p:window.WayfinchBike.PATTERN_LIST,f:window.WayfinchBike.FADES,s:window.WayfinchBike.SWATCHES})');
  assert.deepEqual(radiosOf(h.lookPattern).map(r=>[r.value,r.label]),B.p.map(x=>[x.value,x.name]),'the 14 patterns, named as in the try-out');
  assert.equal(B.p.length,14);
  for(const id of ['lookColour2','lookColour3','lookForkColour'])assert.deepEqual(radiosOf(h[id]).map(r=>r.value),B.s.map(w=>w.hex),`${id}: the 16 swatches`);
  assert.deepEqual(radiosOf(h.lookFork).map(r=>r.label),['Like the frame','Own colour','Fade','Pattern']);
  for(const id of ['lookForkFade','lookForkPair'])assert.deepEqual(radiosOf(h[id]).map(r=>r.label),B.f.map(x=>x.name),`${id}: the six fades`);
  assert.deepEqual(radiosOf(h.lookForkPattern).map(r=>r.label),['Water-dyed','Stripes','Speckle','Camo','Metallic sparkle','Liquid metal','Raw carbon']);
  // the rims: one labelled slider, 15 to 60 mm, and Not set as a button; no text input anywhere in the extras
  assert.match(h.lookRimBox,/<label for="lookRim">Rim depth<\/label>/);
  assert.match(h.lookRimBox,/<input type="range" id="lookRim" min="15" max="60" step="1"/);
  assert.match(h.lookRimBox,/<button type="button" class="lx-chip" id="lookRimNotSet" aria-pressed="false">Not set<\/button>/);
  const inputs=Object.values(h).flatMap(x=>[...x.matchAll(/<input\b[^>]*>/g)].map(m=>m[0]));
  assert.ok(inputs.every(i=>/type="(radio|range)"/.test(i)),'radios and the slider only');
  assert.equal(inputs.filter(i=>/type="range"/.test(i)).length,1);
  const css=p.html.slice(0,p.html.indexOf('</style>'));
  assert.ok(/\.lx-swatch,\.lx-chip\{[^}]*min-height:44px;min-width:44px/.test(css),'each choice is at least 44 px');
  assert.ok(/\.lx-rim input\[type=range\]\{[^}]*min-height:44px/.test(css),'the slider too');
});

test('[LC-LOOK-EXTRAS] each extra shows at once on the preview and the rig; with no colour a pattern starts on Blue, raw carbon on Black; Undo restores byte for byte',async()=>{
  const p=page();
  const beforePlan=p.stored('loadcheck:bikeProfile'),beforeLib=p.stored('loadcheck:bikeProfiles');
  open(p);
  const before=p.writes.length;
  p.run("setPaint({pattern:'fade-h',colours:['#6b3fa0',null]})");
  assert.equal(stroke(p),null,'the frame is no longer one hex colour');
  assert.match(p.run("document.getElementById('lookPreview').innerHTML"),/class="bk-paint bk-frame"[^>]*stroke="url\(#bkpf\)"/,'the preview shows the fade at once');
  assert.match(p.run("document.getElementById('rigBike').innerHTML"),/stroke="url\(#rigpf\)"/,'the rig behind too, with its own ids');
  assert.equal(p.writes.length,before,'storage follows afterwards');
  p.run("setPaint({fork:{kind:'own',colour:'#c62f2a'}});setPaint({rimMm:55})");
  const html=p.run("document.getElementById('lookPreview').innerHTML");
  assert.match(html,/class="bk-paint bk-fork"[^>]*stroke="#c62f2a"/);
  assert.equal((html.match(/class="bk-rimband"/g)||[]).length,2);
  assert.match(html,/aria-label="[^"]*blue and purple frame, fade, front to back, red fork, 55 mm deep rims/,'the name says the pattern and colours');
  await p.settle();
  assert.deepEqual(JSON.parse(p.stored('loadcheck:bikeProfile')).look.paint,{pattern:'fade-h',colours:['#6b3fa0',null],fork:{kind:'own',colour:'#c62f2a'},rimMm:55});
  p.run('undoLook()');
  await p.settle();
  assert.equal(p.stored('loadcheck:bikeProfile'),beforePlan,'the plan\'s bike, byte for byte');
  assert.equal(p.stored('loadcheck:bikeProfiles'),beforeLib,'its saved copy, byte for byte');
  assert.equal(stroke(p),'#2563b8');
  // no colour yet: the first pattern tap also picks Blue; raw carbon picks Black; a rim needs no colour
  p.run("setLook({colour:null})");
  p.run("setPaint({pattern:'stripes',colours:['#f1c232',null]})");
  assert.equal(p.json('S.bikeProfile.look.colour'),'#2563b8');
  p.run("setPaint({pattern:'carbon'})");
  assert.equal(p.json('S.bikeProfile.look.colour'),'#1d1d1f');
  p.run("setLook({colour:null,paint:null});setPaint({rimMm:20})");
  assert.equal(p.json('S.bikeProfile.look.colour'),null);
  assert.equal(p.json('S.bikeProfile.look.paint.rimMm'),20);
  // Not set takes the rims back to today's
  p.run("setPaint({rimMm:null})");
  assert.equal(p.json("'paint' in S.bikeProfile.look"),false,'nothing left of the extras: the look is as before');
});

test('[LC-LOOK-EXTRAS-SAVE] the extras round-trip: saved, read again by a new page, exported and imported, and read by bike.js the same way',async()=>{
  const p=page();
  open(p);
  p.run(`setLook({paint:${JSON.stringify(MARBLE)}})`);
  await p.settle();
  for(const key of ['loadcheck:bikeProfile','loadcheck:bikeProfiles']){
    const v=JSON.parse(p.stored(key));
    assert.deepEqual((Array.isArray(v)?v.find(b=>b.id===BIKE.id):v).look.paint,MARBLE,key);
  }
  // another page on the same storage reads it back
  const q=appVM({storage:p.storage});
  q.run('BIKE_PROFILES=JSON.parse(window.localStorage.getItem(BIKE_PROFILE_KEY)).map(normaliseBikeProfile).filter(Boolean);S.bikeProfile=normaliseBikeProfile(JSON.parse(window.localStorage.getItem(BIKE_PROFILE_CURRENT_KEY)))');
  assert.deepEqual(JSON.parse(q.run('JSON.stringify(S.bikeProfile.look.paint)')),MARBLE);
  // export, then import into an empty page
  const file=p.run('exportAll()');
  assert.deepEqual(JSON.parse(file).bikeProfiles.find(b=>b.id===BIKE.id).look.paint,MARBLE);
  const r=appVM();
  r.context.qaFile=file;
  await r.run('importAll(qaFile)');
  assert.deepEqual(JSON.parse(r.run(`JSON.stringify(BIKE_PROFILES.find(b=>b.id===${JSON.stringify(BIKE.id)}).look.paint)`)),MARBLE);
  // the page and bike.js read every field, and every broken one, the same way
  const raws=[MARBLE,{pattern:'tartan',colours:['#ABCDEF','x']},{fork:{kind:'fade',pair:'3'}},{fork:{kind:'own'}},{rimMm:'45'},{rimMm:61},{pattern:'solid'},[],'marble',null,
    {fork:{kind:'pattern',pattern:'panel',pair:1}},{colours:[null,'#000000'],extra:true}];
  for(const raw of raws){
    p.context.qaRaw=JSON.stringify({id:'x',look:{colour:'#2563b8',paint:raw}});
    const page=p.run('JSON.stringify(normaliseBikeProfile(JSON.parse(qaRaw)).look)');
    const module=p.run('JSON.stringify(window.WayfinchBike.normaliseBike(JSON.parse(qaRaw)).look)');
    assert.equal(page,module,JSON.stringify(raw));
  }
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} look tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
