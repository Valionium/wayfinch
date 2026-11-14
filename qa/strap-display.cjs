'use strict';
// Exercise the actual allocation and SVG-producing code without a browser.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),{run,nodes,context}=app;
let checks=0,cases=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
run('const strapQaInitial=JSON.parse(JSON.stringify(S));');
function render(options={}){
  context.strapQaOptions=JSON.stringify(options);
  run(`Object.assign(S,JSON.parse(JSON.stringify(strapQaInitial)),{
    step:4,kit:{},qty:{},custom:{},pinned:{},bags:[],decks:{bar:false,rack:false},mode:'light',nights:3,sleep:'camp'
  },JSON.parse(strapQaOptions));drawRig();`);
  return nodes.get('bagLayer').innerHTML;
}
function deck(which){
  // the deck sits where bike.js anchors it for this bike (sub-project 6, Task 3), no longer at fixed points
  const svg=nodes.get('bagLayer').innerHTML,x=run(`String(r2(rigAnchors().${which==='bar'?'barDeck':'rackTop'}.x))`).replace('.','\.');
  const groups=[...svg.matchAll(/<g class="([^"]*)"([^>]*)>([\s\S]*?)<\/g>/g)];
  // once the kit is chosen the bar's straps are drawn on the roll itself (the owner's finding G, 8 Nov 2026, BK-BAR-STRAPS): found by
  // their own class there, by the anchor's x elsewhere
  const g=groups.find(m=>m[1].split(/\s+/).includes('deck')&&(which==='bar'&&m[1].split(/\s+/).includes('deck-bar')||new RegExp(`class="bag-shell" x="${x}"`).test(m[3])));
  if(!g)return null;
  const label=svg.match(new RegExp(`<text class="([^"]*)"[^>]*>${which==='bar'?'STRAPS':'DECK'}<\\/text>`));
  return {classes:new Set(g[1].split(/\s+/)),attributes:g[2],body:g[3],labelClasses:new Set((label?.[1]||'').split(/\s+/))};
}
function test(name,callback){callback();cases++;}
const bar={uid:1,pos:'bar',L:12};
const frame={uid:2,pos:'frame',L:6};

test('mounted handlebar roll has empty, grey straps',()=>{
  render({bags:[bar],kit:{tent:true},decks:{bar:true,rack:false}});
  check(run('allocate().slots.some(s=>s.pos==="bar" && s.items.some(k=>k.id==="tent"))'),'real packing loads the tent inside the handlebar roll');
  const d=deck('bar');
  check(d?.classes.has('deck-empty'),'empty handlebar straps have the empty state');
  check(!d.classes.has('idle'),'empty straps on a mounted roll are not marked left at home');
  check(d.labelClasses.has('deck-empty'),'empty strap label shares the muted state');
  check(run('deckClaims().length===0'),'the tent inside the roll is not counted as strapped outside');
});

test('straps follow a handlebar roll omitted from the final arrangement',()=>{
  render({bags:[bar,frame],kit:{pump:true},decks:{bar:true,rack:false}});
  check(run('allocate().slots.some(s=>s.pos==="frame") && !allocate().slots.some(s=>s.pos==="bar")'),'real lightweight packing keeps the frame bag and omits the roll');
  const d=deck('bar');
  check(d?.classes.has('deck-empty')&&d.classes.has('idle'),'straps on the omitted carrier are empty and left at home');
  check(d.labelClasses.has('deck-empty'),'omitted strap label is muted');
});

test('empty rack deck stays empty when other bags carry kit',()=>{
  render({bags:[frame],kit:{pump:true},decks:{bar:false,rack:true}});
  const d=deck('rack');
  check(run('deckClaims().length===0'),'ordinary repair kit does not create an outside claim');
  check(d?.classes.has('deck-empty')&&!d.classes.has('idle'),'empty standalone rack deck has a solid empty state');
  check(d.labelClasses.has('deck-empty'),'empty rack deck label is muted');
});

test('rack deck carrying camping kit keeps the loaded colour state',()=>{
  render({bags:[frame],kit:{tent:true,pad:true,pump:true},decks:{bar:false,rack:true}});
  const d=deck('rack');
  check(run('deckClaims().length===2'),'actual tent and sleeping mat are carried on the rack');
  check(d&&!d.classes.has('deck-empty')&&!d.classes.has('idle'),'loaded rack deck is neither empty nor left at home');
  check(d.labelClasses.has('active')&&!d.labelClasses.has('deck-empty'),'loaded rack tag retains its active colour');
  check(run('allocate().slots.every(s=>s.items.every(k=>!DECK_CLAIMS.includes(k.id)))'),'outside kit remains excluded from inside bag allocation');
});

test('non-camping and deselected camping kit do not light the rack deck',()=>{
  render({bags:[frame],kit:{tent:true,pad:true,pump:true},sleep:'indoor',decks:{bar:false,rack:true}});
  check(run('deckClaims().length===0')&&deck('rack')?.classes.has('deck-empty'),'accommodation trip leaves the rack deck empty');
  render({bags:[frame],kit:{pump:true},decks:{bar:false,rack:true}});
  check(run('deckClaims().length===0')&&deck('rack')?.classes.has('deck-empty'),'deselecting camping kit leaves the rack deck empty');
});

test('selected rack and bar states remain independent',()=>{
  render({bags:[bar,frame],kit:{tent:true,pad:true,pump:true},decks:{bar:true,rack:true}});
  check(deck('bar')?.classes.has('deck-empty'),'unused bar straps are empty even while the rack carries kit');
  check(!deck('rack')?.classes.has('deck-empty'),'loaded rack stays coloured beside unused bar straps');
});

test('kit and result stages share the same empty/load semantics',()=>{
  render({step:3,bags:[bar],kit:{tent:true},decks:{bar:true,rack:true}});
  check(deck('bar')?.classes.has('deck-empty'),'Kit step also marks unused handlebar straps empty');
  check(!deck('rack')?.classes.has('deck-empty'),'Kit step retains the actually loaded rack deck');
});

test('unselected straps are absent from results',()=>{
  render({bags:[bar],kit:{tent:true},decks:{bar:false,rack:false}});
  check(deck('bar')===null&&deck('rack')===null,'disabled decks are not drawn as mounted result hardware');
  render({bags:[frame],kit:{pump:true},decks:{bar:true,rack:false}});
  check(deck('bar')===null,'straps cannot appear without an owned handlebar roll');
});

test('Step 2 keeps add, selected and remove affordances',()=>{
  render({step:2,bags:[bar],decks:{bar:false,rack:false}});
  check(deck('bar')?.classes.has('ghostdeck')&&deck('bar').classes.has('addable'),'unselected bar straps remain an addable dashed choice');
  check(deck('bar').attributes.includes('data-deck="bar"'),'the add control retains its target');
  run('toggleDeck("bar");');
  check(run('S.decks.bar')&&!deck('bar').classes.has('deck-empty'),'selecting straps in Bags keeps the selection appearance');
  check(deck('bar').classes.has('addable')&&deck('bar').labelClasses.has('active'),'selected straps retain their toggle and active label');
  run('S.editMode="remove";drawRig();');
  check(deck('bar').classes.has('removable')&&deck('bar').attributes.includes('data-deldeck="bar"'),'remove mode still exposes the remove action');
  run('toggleDeck("bar");');
  check(!run('S.decks.bar')&&deck('bar').classes.has('ghostdeck'),'removing straps restores the inactive drawing');
  render({step:2,bags:[frame],decks:{bar:false,rack:false}});
  check(deck('bar')===null,'Bags step does not offer handlebar straps without a roll');
});

test('empty shell, lines and labels all have muted rules',()=>{
  const css=app.html.slice(0,app.html.indexOf('</style>'));
  check(/\.bagg(?:\.deck)?\.deck-empty \.bag-shell\{[^}]*stroke:var\(--muted-dim\)/.test(css),'empty deck outline is grey');
  check(/\.bagg(?:\.deck)?\.deck-empty \.strapline\{[^}]*stroke:var\(--muted-dim\)/.test(css),'empty strap lines are grey');
  check(/\.deck-tag\.deck-empty\{[^}]*fill:var\(--muted-dim\)/.test(css),'empty deck label is grey');
  check(!/\.deck-tag(?:\.active)?\{[^}]*!important/.test(css),'active deck colour cannot override the empty state with important');
  const sanitizer=app.script.slice(app.script.indexOf('function safeDataThumb('),app.script.indexOf('function safeDataThumb(')+2200);
  const retained=sanitizer.match(/const drawingClasses = new Set\(\[([^\]]+)\]\)/);
  check(retained&&retained[1].includes("'deck-empty'"),'saved/imported setup thumbnails retain the empty deck state');
});

test('outside suggestions explain the omitted handlebar roll prerequisite',()=>{
  const start=app.script.indexOf('function renderResult(){');
  const end=app.script.indexOf('/* ==== 84-packing-checklist.js ==== */',start);
  assert(start>=0&&end>start,'actual result renderer is available');
  run(app.script.slice(start,end));
  render({bags:[bar,frame],kit:{pump:true},decks:{bar:true,rack:false}});
  run('renderResult();');
  check(nodes.get('resultBox').innerHTML.includes('Mount your handlebar roll before using its straps.'),'omitted roll produces the mounting prerequisite beside strap advice');
  render({bags:[bar],kit:{tent:true},decks:{bar:true,rack:false}});
  run('renderResult();');
  check(!nodes.get('resultBox').innerHTML.includes('Mount your handlebar roll before using its straps.'),'mounted roll does not get an unnecessary prerequisite');
  render({bags:[frame],kit:{pump:true},decks:{bar:false,rack:true}});
  run('renderResult();');
  check(!nodes.get('resultBox').innerHTML.includes('Mount your handlebar roll before using its straps.'),'standalone rack deck does not require a handlebar roll');
});

// ---- The owner's decision of 7 Nov 2026: a sleeping bag may go on the rack deck, like the tent and the mat ----
const seat={uid:3,pos:'seat',L:14},rackBag={uid:4,pos:'rack',L:20};
const kgOf=ids=>run(`+${JSON.stringify(ids)}.reduce((n,id)=>n+itemKg(kitById(id)),0).toFixed(2)`);
const near=(a,b)=>Math.abs(a-b)<0.005;

test('[LC-DECK-QUILT] camping with the rack deck on, the sleeping bag rides on the rack top deck with the tent and the mat: never in a bag, all three at once, its kilos the deck\'s',()=>{
  render({bags:[frame,seat],kit:{quilt:true,tent:true,pad:true,pump:true},decks:{bar:false,rack:true}});
  check(run('JSON.stringify(deckedIds())')==='["quilt","pad","tent"]','the sleeping bag, the mat and the tent, in the kit list\'s order: the deck has no limit, so none waits for room');
  check(run('allocate().slots.every(s=>s.items.every(k=>k.id!=="quilt"))'),'the sleeping bag is in no bag');
  check(run('!currentPlan().items.quilt'),'nor in the plan\'s placements');
  check(run('near=(a,b)=>Math.abs(a-b)<0.005;near(kitL(),+activeKit().filter(k=>!["quilt","pad","tent"].includes(k.id)).reduce((s,k)=>s+itemL(k),0).toFixed(2))'),'the litres inside leave the three out');
  const three=kgOf(['quilt','pad','tent']);
  check(near(run('deckMapItem(rigAnchors()).reduce((t,i)=>t+i.kg,0)'),three),'the weight map\'s deck carries their kilos');
  check(near(run('advisorResult(currentPlan()).kgByPos.deck'),three),'so does the Gear advisor\'s deck');
  check(near(run('loadByZone(currentPlan().slots).rear')-run('currentPlan().slots.filter(s=>POSITIONS[s.pos].zone==="rear").reduce((t,s)=>t+weightIn(s),0)'),three),'Handling first counts them at the rear');
  check(run('loadSummary().decks.rack')==='loaded'&&near(run('loadSummary().weight.byPositionKg.rack'),three),'Wayfinch\'s summary: the rack deck loaded, its kilos the rack\'s');
  const d=deck('rack');
  check(d&&!d.classes.has('deck-empty'),'the rig draws the deck loaded');
  // the sleeping bag alone loads the deck
  render({bags:[frame,seat],kit:{quilt:true,pump:true},decks:{bar:false,rack:true}});
  check(run('JSON.stringify(deckedIds())')==='["quilt"]'&&!deck('rack').classes.has('deck-empty'),'the sleeping bag alone is a loaded deck');
  // and as before everywhere else
  render({bags:[frame,seat],kit:{quilt:true,tent:true,pad:true,pump:true},decks:{bar:false,rack:false}});
  check(run('deckedIds().length===0&&!!currentPlan().items.quilt'),'deck off: the sleeping bag is in a bag');
  render({bags:[frame,seat],kit:{quilt:true,tent:true,pad:true,pump:true},sleep:'indoor',decks:{bar:false,rack:true}});
  check(run('deckedIds().length===0'),'an indoor trip: nothing on the deck');
  render({bags:[frame,seat],kit:{tent:true,pad:true,pump:true},decks:{bar:false,rack:true}});
  check(run('JSON.stringify(deckedIds())')==='["pad","tent"]','the sleeping bag unticked: the mat and the tent, as before');
});

test('[LC-DECK-WORDS] the rider reads the deck\'s kit as a list, the sleeping bag in a dry bag wherever it rides there: the rack top note, Already up there, the rack\'s deck line and the checklist',()=>{
  const dry='sleeping quilt or bag (in a dry bag), sleeping mat and tent';
  render({step:2,bags:[frame,seat,rackBag],kit:{quilt:true,tent:true,pad:true,pump:true},decks:{bar:false,rack:true}});
  run('renderBags();');
  const list=nodes.get('bagList').innerHTML;
  check(list.includes('<b>The rack top takes '+dry+'</b>'),'the rack top note, a list, the dry bag said');
  check(list.includes('<p>'+run('activeKit().filter(k=>["quilt","pad","tent"].includes(k.id)).reduce((s,k)=>s+itemL(k),0).toFixed(1)')+' L strapped outside bags.'),'with their litres');
  check(list.includes('<i class="deckline">'+dry+' live up here, panniers or not</i>'),'the rack\'s deck line, in the same words');
  check(run('POSITIONS.rack.strapNote')==='tent and sleeping mat live up here, panniers or not','POSITIONS itself unchanged');
  // a rack deck with no pannier at all: the notes still say it
  render({bags:[frame,seat],kit:{quilt:true,tent:true,pad:true,pump:true},decks:{bar:false,rack:true}});
  run('renderBags();');
  check(nodes.get('bagList').innerHTML.includes('<b>The rack top takes '+dry+'</b>'),'no pannier: the rack top note says it');
  run('renderResult();');
  const result=nodes.get('resultBox').innerHTML,up=(result.match(/<b>Already up there: [^<]*<\/b>/)||[''])[0];
  check(up==='<b>Already up there: '+dry+'</b>','Already up there, a list, the dry bag said');
  check(!/ and [^<]* and /.test(up),'never "and … and"');
  const rows=()=>JSON.parse(run('JSON.stringify(checklistOfBags(currentPlan()).groups.flatMap(g=>g.items))'));
  const quilt=rows().find(r=>r.id==='quilt'),tent=rows().find(r=>r.id==='tent');
  check(quilt&&quilt.placementLabel==='Rack top deck'&&quilt.note.includes('On the rack top deck it rides in a dry bag.'),'the checklist\'s rack top deck row says it');
  check(tent&&!tent.note.includes('dry bag'),'only for the sleeping bag');
  // the sleeping bag unticked: the words as before, no dry bag
  render({bags:[frame,seat],kit:{tent:true,pad:true,pump:true},decks:{bar:false,rack:true}});
  run('renderBags();');
  check(nodes.get('bagList').innerHTML.includes('<b>The rack top takes sleeping mat and tent</b>'),'the mat and the tent alone');
});

const NOTE_KEY='loadcheck:deck-note:v1';
const stored=()=>JSON.parse(app.values.get(NOTE_KEY)||'null');
const noteIn=html=>(html.match(/<div class="finding note" data-deck-note="1">[\s\S]*?<\/div>/)||[null])[0];
test('[LC-DECK-NOTE] a kept plan from before, with the sleeping bag in a bag and the deck on: only the sleeping bag goes up on the deck, and a note that lasts until the rider has seen it names the bag it left and the way back; once per stored plan',()=>{
  // a plan as the page before this rule kept it with the rack deck on: the tent and the mat on the deck, the sleeping bag in a bag
  render({step:1,bags:[frame,seat],kit:{quilt:true,tent:true,pad:true,pump:true,rain:true,puffy:true,cap:true,socks:true},decks:{bar:false,rack:false}});
  run('S.pinned={};S.packed={};S.placements=null;currentPlan();');
  const fresh=JSON.parse(run('JSON.stringify(S.placements)'));
  check(fresh.items.quilt&&fresh.items.tent&&fresh.items.pad,'with the deck off all three are in bags');
  // the rider turning the deck on is no rule change: no note
  run('S.decks={bar:false,rack:true};currentPlan();');
  check(stored()===null,'the deck turned on by the rider: no note');
  const old={...fresh,basis:{...fresh.basis,rackDeck:true},items:Object.fromEntries(Object.entries(fresh.items).filter(([id])=>!['tent','pad'].includes(id)))};
  const from=old.items.quilt[0][0];
  context.qaStored=JSON.stringify(old);
  run('S.decks={bar:false,rack:true};S.step=1;keepPlan({load:JSON.parse(qaStored)});');
  const plan=JSON.parse(run('JSON.stringify((()=>{const a=currentPlan();return {items:a.items,decked:deckedIds()};})())'));
  check(!plan.items.quilt&&plan.decked.includes('quilt'),'the sleeping bag is on the deck');
  for(const [id,entries] of Object.entries(old.items))if(id!=='quilt'&&id!=='food')
    check(JSON.stringify(plan.items[id])===JSON.stringify(entries),id+' stays where it was');
  check(run('JSON.stringify(S.placements.items.quilt||null)')==='null','the kept plan is stored without it');
  const bag=run('unitLabel(usableUnits().find(u=>u.key==='+JSON.stringify(from)+')).toLowerCase()');
  const pending=stored()&&stored().pending;
  check(pending&&JSON.stringify(pending.items)===JSON.stringify([{id:'quilt',from:bag,hand:false,packed:false}]),'the note waits in the planner\'s own storage, with the bag it left');
  // I1: a tick, a reload, the bags drawn while the rider is on another step: the note is still waiting
  run('S.kit.socks=false;currentPlan();keepPlan({load:JSON.parse(JSON.stringify(S.placements))});currentPlan();renderBags();');
  check(stored().pending&&stored().pending.sig===pending.sig,'after a tick and a reload, and the bags drawn on another step, it still waits');
  // the packing check shows it: then it is seen, and stays on screen for this visit
  const text='<p>Your sleeping quilt or bag now rides on the rack top deck, in a dry bag, as the planner now packs it on a camping trip with the rack deck on. It was in the '+bag+'; everything else stays where it was. To carry it inside again, turn the rack top deck off.</p>';
  run('S.step=4;renderResult();');
  check(noteIn(nodes.get('resultBox').innerHTML)==='<div class="finding note" data-deck-note="1">'+text+'</div>','the rider reads it at the packing check');
  check(stored().pending===null&&stored().seen.includes(pending.sig),'seen: no longer waiting');
  run('S.kit.socks=true;currentPlan();renderResult();');
  check(!!noteIn(nodes.get('resultBox').innerHTML),'still on screen through this visit');
  run('S.decks={bar:false,rack:false};currentPlan();renderResult();');
  check(!noteIn(nodes.get('resultBox').innerHTML),'never once the deck is off: it would not be true');
  // m3: the same stored plan opened again (a saved setup is not rewritten) gives no second note, in this visit or the next
  run('S.decks={bar:false,rack:true};DECK_NOTE_SHOWN=null;keepPlan({load:JSON.parse(qaStored)});currentPlan();renderResult();');
  check(stored().pending===null&&!noteIn(nodes.get('resultBox').innerHTML),'opened again: no note');
  // I2: a hand placement, ticked as packed: the note says it was the rider's own choice and how to keep it; the packed line (design 7.7)
  const handOld={...old,items:Object.fromEntries(Object.entries(old.items).filter(([id])=>id!=='cap'))};
  context.qaStored=JSON.stringify(handOld);
  run('S.step=2;S.pinned={quilt:'+JSON.stringify(from)+'};S.packed={quilt:true};keepPlan({load:JSON.parse(qaStored)});currentPlan();');
  check(JSON.stringify(stored().pending.items)===JSON.stringify([{id:'quilt',from:bag,hand:true,packed:true}]),'a second stored plan: its own note');
  check(run('recordOfPin("quilt")')==='dormant'&&run('S.pinned.quilt')===from,'the hand placement is kept, waiting');
  run('renderBags();');
  check(noteIn(nodes.get('bagList').innerHTML)==='<div class="finding note" data-deck-note="1"><p>You had put your sleeping quilt or bag in the '+bag+'; it now rides on the rack top deck, in a dry bag. To keep it in the '+bag+', turn the rack top deck off.</p><p>Packed already, now planned for the rack top deck: sleeping quilt or bag.</p></div>','seen first at the bags step: the rider\'s own choice, the way back, the packed line');
  check(stored().pending===null,'seen there');
  run('S.decks={bar:false,rack:false};currentPlan();');
  check(run('currentPlan().items.quilt[0][0]')===from,'deck off: the sleeping bag is back where the rider put it');
});

console.log(JSON.stringify({suite:'strap-display',cases,checks,scope:'actual allocation and emitted SVG plus scoped colour/thumbnail rules; no browser rendering'}));
