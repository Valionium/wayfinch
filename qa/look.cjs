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
  return {...q,writes,json,stored,settle};
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

test('[LC-LOOK-DEEP] #bike-details=<id>&back=trip&section=look opens at Look without applying the bike; new starts one; any other back is You; the fragment goes',()=>{
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
  // a new bike from a link: the first tap makes it the plan's bike, with the look
  const n=page({plan:null,library:[]});
  n.run(`openBikeDetailsFromLink('#bike-details=new&back=trip&section=look');applyPressureBikeDetails=async()=>{S.bikeProfile=readBikeProfileEditor();return true;};setLook({colour:'#6b3fa0'})`);
  assert.equal(n.run('LOOK_NEW.colour'),'#6b3fa0');
  assert.equal(stroke(n),'#6b3fa0');
});

test('[LC-LOOK-QUICK] the two-tap start passes unchanged, and Look sits below it',()=>{
  const r=spawnSync(process.execPath,[path.join(__dirname,'bike-quick-start.cjs')],{encoding:'utf8',env:process.env});
  assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''));
  const html=appVM().html,at=s=>html.indexOf(s);
  assert.ok(at('id="bikeQuick"')<at('id="bikeLook"')&&at('id="bikeLook"')<at('id="bikeMoreDetails"'));
});

test('[LC-WORDS] no banned word in the bike wording table, Look included; every limit sentence still says "you entered"',()=>{
  const p=page();
  const words=p.json('Object.values(BIKE_WORDING)');
  const banned=/\bsafe\b|\bOK\b|okay|approv|certif|guarant|warning|error|fail|invalid|must\b/i;
  for(const w of words)assert.ok(!banned.test(w.text),w.text);
  assert.ok(words.filter(w=>w.limit).length>=4&&words.filter(w=>w.limit).every(w=>/you entered/.test(w.text)));
  for(const key of ['lookHint','lookNone','lookNotSet','lookMore','lookPhoto','lookUndo','lookGuessBars','lookGuessEbike'])assert.ok(p.json(`BIKE_WORDING.${key}.text`).length>0,key);
});

(async()=>{
  for(const [name,fn] of tests){await fn();passed++;console.log('ok',name);}
  console.log(`${passed} look tests passed`);
})().catch(e=>{console.error(e);process.exit(1);});
