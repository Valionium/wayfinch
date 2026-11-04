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
  const g=groups.find(m=>m[1].split(/\s+/).includes('deck')&&new RegExp(`class="bag-shell" x="${x}"`).test(m[3]));
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

console.log(JSON.stringify({suite:'strap-display',cases,checks,scope:'actual allocation and emitted SVG plus scoped colour/thumbnail rules; no browser rendering'}));
