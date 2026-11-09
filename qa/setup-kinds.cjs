// General and trip setups (guided Trip design of 8 Nov 2026, §5, with the owner's answer 3 of 8 Nov): a saved setup is a trip
// setup unless the rider marked it general; two groups in Saved setups; 20 general and 40 trip setups. Source-level: the page's
// functions in the QA VM, nothing printed of it.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');

let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

const q=appVM();
const {run}=q;
const json=code=>{const t=run(`JSON.stringify(${code})`);return t===undefined ? undefined : JSON.parse(t);};
// no drawing in the VM: a saved setup's thumbnail is empty here
run('DRAFT_READY=true;buildThumb=()=>"";');
run(`var qaSetup=(id,extra={})=>normaliseSetup({...captureDraft(),id,name:'Setup '+id,saved:'2026-10-30',
  predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14},thumb:'',...extra});`);
const HASH='a'.repeat(64);

test('[SET-KIND] a setup with no kind is a trip setup; general, the trip it is for, the setup it came from and the default mark are kept; an older setup reads back byte for byte',()=>{
  const old=json(`(()=>{const raw={...captureDraft(),id:'old_1',name:'Old',saved:'2026-10-30',predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14},thumb:''};
    return [JSON.stringify(normaliseSetup(raw)),JSON.stringify(normaliseSetup(JSON.parse(JSON.stringify(normaliseSetup(raw)))))];})()`);
  assert.equal(old[0],old[1],'an older setup normalises to itself');
  assert.ok(!/"kind"|"forRoute"|"base"|"isDefault"/.test(old[0]),'an older setup gains no new field until the rider changes it');
  assert.equal(json(`setupKind(qaSetup('t_1'))`),'trip','no kind: a trip setup (the owner, 8 Nov: existing setups become trip setups)');
  assert.equal(json(`setupKind(qaSetup('g_1',{kind:'general'}))`),'general');
  assert.equal(json(`setupKind(qaSetup('x_1',{kind:'something'}))`),'trip','an unknown kind reads as a trip setup');
  const kept=json(`qaSetup('t_2',{kind:'specific',forRoute:{hash:'${HASH}',name:'Heidelberg → Strasbourg',departureDate:'2026-11-14'},base:'g_1'})`);
  assert.deepEqual(kept.forRoute,{hash:HASH,name:'Heidelberg → Strasbourg',departureDate:'2026-11-14'});
  assert.equal(kept.base,'g_1');
  assert.equal(kept.kind,undefined,'a trip setup stores no kind: missing means trip');
  assert.equal(json(`qaSetup('t_3',{forRoute:{hash:'nothex',name:'X'}}).forRoute`),undefined,'a broken route link is dropped');
  assert.equal(json(`qaSetup('g_2',{kind:'general',isDefault:true}).isDefault`),true);
  assert.equal(json(`qaSetup('t_4',{isDefault:true}).isDefault`),undefined,'only a general setup can be the default');
  // the fields travel with an export and back
  run(`SETUPS=[qaSetup('g_9',{kind:'general',isDefault:true}),qaSetup('t_9',{forRoute:{hash:'${HASH}',name:'Ride',departureDate:null},base:'g_9'})];FEEDBACK=[];`);
  const exported=run('exportAll()');
  run('SETUPS=[];');
  return run(`importAll(${JSON.stringify(exported)})`).then(()=>{
    const back=json('SETUPS.map(s=>[s.id,setupKind(s),s.isDefault||false,s.base||null,s.forRoute||null])');
    assert.deepEqual(back.sort(),[['g_9','general',true,null,null],['t_9','trip',false,'g_9',{hash:HASH,name:'Ride',departureDate:null}]].sort());
  });
});

test('[SET-KIND] the rider marks a trip setup as general and can change it back; a new save is a trip setup',async()=>{
  run(`SETUPS=[qaSetup('t_a'),qaSetup('t_b')];SAVE_MESSAGE='';`);
  assert.equal(await run(`setSetupKind('t_a','general')`),true);
  assert.equal(json(`setupKind(SETUPS.find(s=>s.id==='t_a'))`),'general');
  // read as a page opened afresh reads the store (the setups this page adds are not in the list older pages read: third review, I-B)
  assert.equal(json(`storedSetupsLocal().find(s=>s.id==='t_a').kind`),'general','stored at once');
  assert.match(json('SAVE_MESSAGE'),/general setup/);
  assert.equal(await run(`setSetupKind('t_a','trip')`),true);
  const stored=json(`storedSetupsLocal().find(s=>s.id==='t_a')`);
  assert.equal(stored.kind,undefined,'back to a trip setup: the kind is gone again');
  assert.equal(await run(`saveSetup('New one','')`),true);
  assert.equal(json(`setupKind(SETUPS[0])`),'trip','a setup saved from the planner is a trip setup');
  await run(`setSetupKind('t_b','general')`);
  assert.equal(await run(`duplicateSetup('t_b').then(c=>setupKind(c))`),'general','a copy keeps its kind');
  assert.equal(json(`SETUPS.filter(s=>s.isDefault).length`),0);
});

test('[SET-GROUPS] Saved setups shows General setups first, then Trip setups, each setup once in its own group with the button that moves it',()=>{
  run(`SETUPS=[qaSetup('t_1'),qaSetup('g_1',{kind:'general'}),qaSetup('t_2',{base:'g_1'}),qaSetup('g_2',{kind:'general'})];`);
  const groups=json('setupGroups(SETUPS)');
  assert.deepEqual(groups.general.map(s=>s.id),['g_1','g_2']);
  assert.deepEqual(groups.trip.map(s=>s.id),['t_1','t_2']);
  const html=run(`setupGroupsHtml(s=>'<i data-card="'+s.id+'"></i>')`);
  const at=id=>html.indexOf(`data-card="${id}"`);
  assert.ok(html.indexOf('General setups')>=0 && html.indexOf('Trip setups')>html.indexOf('General setups'),'two headings, General first');
  assert.ok(at('g_1')<at('g_2') && at('g_2')<html.indexOf('Trip setups') && html.indexOf('Trip setups')<at('t_1') && at('t_1')<at('t_2'));
  assert.equal(json(`setupKindButton(SETUPS[0])`).includes('data-setup-kind="t_1:general"'),true);
  assert.match(json(`setupKindButton(SETUPS[0])`),/Use as a general setup/);
  assert.match(json(`setupKindButton(SETUPS[1])`),/Use as a trip setup/);
  assert.match(json(`setupBaseLine(SETUPS[2])`),/from Setup g_1/,'a trip setup names the general setup it came from');
  assert.equal(json(`setupBaseLine(SETUPS[0])`),'');
  run(`SETUPS=[qaSetup('t_1')];`);
  const none=run(`setupGroupsHtml(s=>'')`);
  assert.match(none,/Use as a general setup/,'with no general setup yet, the group says how to make one');
  assert.deepEqual(json(`setupGroups(SETUPS).general`),[]);
  // the start-from list of the bags step puts the general setups first too
  run(`SETUPS=[qaSetup('t_1'),qaSetup('g_1',{kind:'general'})];`);
  assert.deepEqual(json('recallOrder(SETUPS).map(s=>s.id)'),['g_1','t_1']);
});

test('[SET-LIMITS] 20 general and 40 trip setups: a save, a copy, a mark, an undo and an import each stop at their own kind\'s limit and say so',async()=>{
  run(`SETUPS=[...Array.from({length:40},(_,i)=>qaSetup('t'+i)),...Array.from({length:19},(_,i)=>qaSetup('g'+i,{kind:'general'}))];SAVE_MESSAGE='';DELETED_SETUPS.length=0;`);
  assert.equal(await run(`saveSetup('One more trip','')`),false,'the 41st trip setup is refused');
  assert.match(json('SAVE_MESSAGE'),/40 trip setups/);
  assert.equal(await run(`setSetupKind('t0','general')`),true,'the 20th general setup is fine');
  assert.equal(await run(`saveSetup('Room again','')`),true,'marking one general made room for a trip setup');
  assert.equal(json('SETUPS.length'),60);
  assert.equal(await run(`setSetupKind('t1','general')`),false,'a 21st general setup is refused');
  assert.match(json('SAVE_MESSAGE'),/20 general setups/);
  assert.equal(await run(`duplicateSetup('g0')`),false,'a copy of a general setup at its limit is refused');
  assert.equal(await run(`setSetupKind('g0','trip')`),false,'and a 41st trip setup by a mark too');
  await run(`deleteSetup('t1')`);
  assert.equal(await run(`saveSetup('Fills it','')`),true);
  assert.equal(await run(`undoDeleteSetup()`),false,'undoing a delete into a full kind is refused');
  // an import adds each kind up to its own limit
  run(`SETUPS=[...Array.from({length:20},(_,i)=>qaSetup('t'+i))];`);
  const msg=await run(`importAll(JSON.stringify({setups:[...Array.from({length:22},(_,i)=>qaSetup('n'+i)),...Array.from({length:3},(_,i)=>qaSetup('ng'+i,{kind:'general'}))]}))`);
  assert.equal(json(`SETUPS.filter(s=>setupKind(s)==='trip').length`),40);
  assert.equal(json(`SETUPS.filter(s=>setupKind(s)==='general').length`),3);
  assert.match(msg,/Skipped 2 setups beyond/);
});

// Older pages (the page live before this one, an old open tab, a rollback, the tagged site's page, the frozen copy at /) read
// loadcheck:setups alone, cut it to 20 on every setup write and drop kind, forRoute, base and isDefault (review of PR 80, I1). This page
// adds no setup there (third review of PR 80, I-B). The browser tests with the real old pages are in tests/e2e/launch.spec.ts.
const {sharedStore}=require('./app-vm.cjs');
function tab(storage){
  const p=appVM({storage});
  p.run('DRAFT_READY=true;buildThumb=()=>"";');
  p.run(`var qaSetup=(id,extra={})=>normaliseSetup({...captureDraft(),id,name:'Setup '+id,saved:'2026-10-30',
    predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14},thumb:'',...extra});
    var qaLibrary=()=>[...Array.from({length:30},(_,i)=>qaSetup('t'+i,{forRoute:{hash:'${HASH}',name:'Ride '+i,departureDate:null},...(i===5 ? {base:'g1'} : {})})),
      ...Array.from({length:3},(_,i)=>qaSetup('g'+i,{kind:'general',...(i===1 ? {isDefault:true} : {})}))];
    var qaOpen=async()=>{SETUPS=await storedSetups();SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));SETUPS_KNOWN=new Set(storedSetupIds());
      DELETED_SETUPS.length=0;SETUPS_STORED=true;SAVE_MESSAGE='';};`);
  p.json=code=>{const t=p.run(`JSON.stringify(${code})`);return t===undefined ? undefined : JSON.parse(t);};
  return p;
}
const MARKS=['kind','forRoute','base','isDefault'];
const strip=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!MARKS.includes(k)));
// A tab of an older page, as its frozen code keeps the saved setups (read in the page live before this one, whose normaliseSetup is this
// page's without the four fields and whose stampSaved is this page's): it reads loadcheck:setups alone; a setup write puts its own change
// first, adds after it the stored setups it never saw, cuts the list to 20, writes it and stamps it; it saves no setup past 20 of its own;
// open() is its start-up, or a storage event it hears. Its code runs in a VM of this page that no storage event reaches.
function olderTab(storage){
  const p=tab(storage),t={seen:new Set(),list:[]};
  storage.vms.delete(p);
  // values cross into the VM as text: its own objects are what the page's checks accept
  const read=()=>{
    p.context.qaText=storage.values.get('loadcheck:setups') ?? 'null';
    return p.json('(()=>{ let v=null; try { v=JSON.parse(qaText); } catch(e){} return Array.isArray(v) ? v.map(x=>normaliseSetup(x)).filter(Boolean) : []; })()').map(strip);
  };
  t.open=()=>{ t.list=read(); t.list.forEach(s=>t.seen.add(s.id)); return t; };
  t.write=change=>{
    change(t.list);
    for(const x of read()) if(!t.seen.has(x.id) && !t.list.some(y=>y.id===x.id)) t.list.push(x);
    t.list.splice(20);
    p.context.qaText=JSON.stringify(t.list); p.context.qaBefore=storage.values.get('loadcheck:setups') ?? null;
    p.run('window.localStorage.setItem(SETUP_KEY,qaText);stampSaved(SETUP_KEY,JSON.parse(qaText),qaBefore);');
    t.list.forEach(s=>t.seen.add(s.id));
  };
  t.save=(id,extra={})=>{
    if(t.list.length>=20) return false;
    const s=strip(p.json(`qaSetup(${JSON.stringify(id)},${JSON.stringify(extra)})`));
    t.write(l=>l.unshift(s));
    return true;
  };
  return t;
}
// What a page opened afresh reads from these values: the setups as its own reader makes them, in its order.
const reader=tab(sharedStore());
function freshRead(values){
  reader.values.clear();
  for(const [k,v] of values) reader.values.set(k,v);
  return reader.json('storedSetupsLocal()');
}
const ids=list=>list.map(s=>s.id);
const byId=list=>Object.fromEntries(list.map(s=>[s.id,JSON.stringify(s)]));
// a tab on a copy of these values: another browser profile with the same storage, which hears nothing of the first
function copyOf(values){ const p=tab(sharedStore()); for(const [k,v] of values) p.values.set(k,v); return p; }
const later=()=>new Promise(r=>setTimeout(r,5));
const request=(values,c,at=new Date().toISOString())=>values.set('copilot:delete-request:v1',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id:c.repeat(32),createdAt:at}));

test('[SET-LIMITS] this page adds no setup to the list older pages read: an older page sees the setups it saved itself and keeps its changes to them; what this page adds is kept where older pages never look, with its marks, in its order (third review of PR 80, I-B)',async()=>{
  const storage=sharedStore(),old=olderTab(storage);
  old.open();
  for(let i=0;i<5;i++) old.save('o'+i);   // newest first: o4 to o0
  const theirs=storage.values.get('loadcheck:setups');
  const a=tab(storage);
  await a.run('qaOpen()');
  assert.deepEqual(a.json('SETUPS.map(s=>s.id)'),['o4','o3','o2','o1','o0']);
  // this page adds a library past 20 (30 trip setups with their trips, 3 general ones) and marks one of the older page's general
  assert.equal(await a.run('SETUPS.push(...qaLibrary());store.set(SETUP_KEY,SETUPS)'),true);
  assert.equal(await a.run(`setSetupKind('o2','general')`),true);
  assert.equal(storage.values.get('loadcheck:setups'),theirs,'the list older pages read is as the older page left it, byte for byte');
  // an older page opened now sees its own five; it deletes one and renames another through its own write
  old.open();
  assert.deepEqual(ids(old.list),['o4','o3','o2','o1','o0']);
  old.write(l=>{ l.splice(l.findIndex(s=>s.id==='o3'),1); l.find(s=>s.id==='o1').name='Renamed in an old tab'; });
  // read afresh: the 37 left, in this page's order, every mark there; the older page's delete and rename stay
  const read=freshRead(storage.values);
  assert.deepEqual(ids(read),['o4','o2','o1','o0',...Array.from({length:30},(_,i)=>'t'+i),'g0','g1','g2']);
  assert.equal(read.find(s=>s.id==='o1').name,'Renamed in an old tab');
  assert.deepEqual(ids(read.filter(s=>s.kind==='general')),['o2','g0','g1','g2']);
  assert.equal(read.filter(s=>s.forRoute).length,30,'every trip link');
  assert.equal(read.find(s=>s.id==='t5').base,'g1');
  assert.equal(read.find(s=>s.id==='g1').isDefault,true);
  // the open tab follows the older page's write the same way, and names the setup it deleted
  assert.deepEqual(a.json('SETUPS.map(s=>s.id)'),ids(read));
  assert.match(String(a.nodes.get('tabText').textContent),/^A saved setup was removed in another tab: Setup o3\./);
  // a library of plain setups saved here leaves the list older pages read alone too
  const c=tab(sharedStore());
  await c.run(`SETUPS=Array.from({length:5},(_,i)=>qaSetup('p'+i));store.set(SETUP_KEY,SETUPS)`);
  assert.equal(c.values.get('loadcheck:setups'),undefined);
  assert.deepEqual(ids(freshRead(c.values)),['p0','p1','p2','p3','p4']);
});

test('[SET-LIMITS] a stale tab of an older page that saves a setup loses none of the setups this page added, and none of their marks (third review of PR 80, I-B)',async()=>{
  const storage=sharedStore(),old=olderTab(storage);
  old.open();
  for(let i=0;i<18;i++) old.save('o'+i);   // the older page's own 18, all of which it has seen
  // from here on it hears nothing (frozen in the background, or back from the back/forward cache)
  const a=tab(storage);
  await a.run('qaOpen()');
  assert.equal(a.json('SETUPS.length'),18);
  // this page adds 12 trip setups (each with its trip) and 3 general ones, newest first
  await a.run(`SETUPS.unshift(...Array.from({length:12},(_,i)=>qaSetup('n'+i,{forRoute:{hash:'${HASH}',name:'Ride '+i,departureDate:null}})),
    ...Array.from({length:3},(_,i)=>qaSetup('g'+i,{kind:'general'})));store.set(SETUP_KEY,SETUPS)`);
  const before=a.json('SETUPS.map(s=>s.id)');
  assert.equal(before.length,33);
  // the stale tab writes a note on one of its own setups, through its own write
  old.write(l=>{ l[0].note='A note from the stale tab'; });
  const read=freshRead(storage.values);
  assert.deepEqual(ids(read),before,'every setup is still there, in its order');
  assert.deepEqual(ids(read.filter(s=>s.kind==='general')),['g0','g1','g2'],'the general ones still general');
  assert.equal(read.filter(s=>s.forRoute).length,12,'every trip link');
  assert.equal(read.find(s=>s.id==='o17').note,'A note from the stale tab','the stale tab\'s own change stays');
  // the open tab follows, and has nothing to name as removed
  assert.deepEqual(a.json('SETUPS.map(s=>s.id)'),before);
  assert.equal(String(a.nodes.get('tabText')?.textContent ?? ''),'');
});

test('[SET-LIMITS] a library an older page grows past the limits is kept whole: nothing is cut, and each add is refused with the true count (third review of PR 80, I-A)',async()=>{
  const storage=sharedStore(),a=tab(storage),old=olderTab(storage);
  await a.run(`SETUPS=[...Array.from({length:20},(_,i)=>qaSetup('g'+i,{kind:'general'})),...Array.from({length:40},(_,i)=>qaSetup('t'+i))];store.set(SETUP_KEY,SETUPS)`);
  // the rider deletes five general setups here
  await a.run(`(async()=>{for(const id of ['g3','g4','g5','g6','g7']) await deleteSetup(id);})()`);
  // an older page's tab, open and following, saves setups of its own, as many as it lets the rider save there
  old.open();
  for(let i=0;i<10;i++) old.save('old'+i);
  const count=()=>{ const r=freshRead(storage.values); return {all:r.length,general:r.filter(s=>s.kind==='general').length,trip:r.filter(s=>s.kind!=='general').length}; };
  assert.ok(count().all>=60,'the library is at the limit of 60 or past it: '+count().all);
  assert.equal(a.json('SETUPS.length'),count().all,'the open tab follows');
  // each of these adds one setup or more: a copy of a general setup, an import of three, the undo of a general delete, a new trip setup
  const adds=[
    ['a copy of a general setup',`duplicateSetup('g0')`],
    ['an import of three general setups',`importAll(JSON.stringify({setups:Array.from({length:3},(_,i)=>qaSetup('ng'+i,{kind:'general'}))}))`],
    ['the undo of a general delete',`undoDeleteSetup()`],
    ['a new trip setup',`saveSetup('One more','')`],
  ];
  for(const [what,code] of adds){
    const before=byId(freshRead(storage.values)),n=count();
    const out=JSON.parse(await a.run(`(async()=>{SAVE_MESSAGE='';const r=await (${code});return JSON.stringify({text:typeof r==='string' ? r : SAVE_MESSAGE});})()`));
    const after=byId(freshRead(storage.values));
    for(const id of Object.keys(before)){
      assert.ok(after[id],`${what}: ${id} is lost`);
      assert.equal(after[id],before[id],`${what}: ${id} changed`);
    }
    if(Object.keys(after).length===n.all)
      assert.match(out.text,new RegExp(`You have (${n.general} general|${n.trip} trip|${n.all} saved) setups|Skipped 3 setups beyond the library limit`),`${what}: refused, and the words give the true count: ${out.text}`);
    assert.equal(a.json('SETUPS.length'),Object.keys(after).length,`${what}: the tab shows what is stored`);
  }
  // a reload shows every setup there was
  const b=copyOf(storage.values);
  await b.run('qaOpen()');
  assert.equal(b.json('SETUPS.length'),count().all);
});

test('[SET-LIMITS] another tab follows the library, and its next write keeps every setup and every mark (review of PR 80, I1)',async()=>{
  const storage=sharedStore(),a=tab(storage),b=tab(storage);
  await b.run('qaOpen()');
  await a.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)');
  assert.equal(b.json('SETUPS.length'),33,'the other tab follows');
  assert.equal(b.json(`SETUPS.filter(s=>setupKind(s)==='general').length`),3);
  assert.equal(await b.run(`saveSetup('One more','')`),true);
  assert.equal(a.json('SETUPS.length'),34);
  assert.equal(freshRead(storage.values).length,34);
  // a general setup marked back to a trip setup loses its mark in both places
  await a.run(`setSetupKind('g0','trip')`);
  assert.equal(freshRead(storage.values).find(s=>s.id==='g0').kind,undefined);
  assert.equal(b.json(`setupKind(SETUPS.find(s=>s.id==='g0'))`),'trip');
  // deletes in one tab reach the other and nothing else goes; a setup added after them is kept with the rest
  await a.run(`(async()=>{for(const s of SETUPS.slice(0,15)) await deleteSetup(s.id);})()`);
  assert.equal(a.json('SETUPS.length'),19);
  assert.deepEqual(b.json('SETUPS.map(s=>s.id)'),a.json('SETUPS.map(s=>s.id)'));
  assert.deepEqual(ids(freshRead(storage.values)),a.json('SETUPS.map(s=>s.id)'));
  assert.equal(await a.run(`saveSetup('After the deletes','')`),true);
  assert.deepEqual(ids(freshRead(storage.values)),a.json('SETUPS.map(s=>s.id)'));
  assert.equal(b.json('SETUPS.length'),20);
});

test('[SET-LIMITS] Also delete bag planner data takes every setup saved before the request, from either list, and keeps one saved or marked after it, with its marks (review of PR 80, I1)',async()=>{
  const storage=sharedStore(),old=olderTab(storage);
  old.open();
  for(let i=0;i<3;i++) old.save('o'+i);
  const a=tab(storage);
  await a.run('qaOpen()');
  await a.run('SETUPS.push(...qaLibrary());store.set(SETUP_KEY,SETUPS)');
  await a.run(`setSetupKind('o1','general')`);
  await later();
  request(storage.values,'f');
  await later();
  // after the request, in a tab that has not seen it yet: a trip setup this page added gets a new name, and an older page's one a mark
  const b=copyOf(storage.values);
  await b.run(`(async()=>{await qaOpen();await renameSetup('t25','Planned after');await setSetupKind('o2','general');})()`);
  const c=copyOf(b.values);
  assert.equal(c.run('applyDeleteRequest()'),true);
  assert.deepEqual(c.json(`storedSetupsLocal().map(s=>[s.id,s.name,!!s.forRoute,setupKind(s)])`),[['o2','Setup o2',false,'general'],['t25','Planned after',true,'trip']]);
  // with nothing saved after it, nothing of the setups is left
  const d=tab(sharedStore());
  await d.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)');
  request(d.values,'e',new Date(Date.now()+60000).toISOString());
  assert.equal(d.run('applyDeleteRequest()'),true);
  assert.deepEqual([...d.values.keys()].filter(k=>k.startsWith('loadcheck:setup')),[]);
});

// A full storage (fix round of PR 80, I-1). `fill` leaves `room` characters: a write that would take the store past that throws, as a
// full localStorage does. `failAt` makes one write of a setup save throw: the n-th setItem of the setup keys and the ledger.
function fill(p,room){
  const size=()=>[...p.values].reduce((n,[k,v])=>n+k.length+v.length,0),cap=size()+room,put=p.localStorage.setItem;
  p.localStorage.setItem=function(key,value){
    const was=p.values.has(key) ? key.length+p.values.get(key).length : 0;
    if(size()-was+key.length+String(value).length>cap) throw new Error('QuotaExceededError');
    return put.call(this,key,value);
  };
}
const SETUP_WRITE_KEYS=['loadcheck:setups','loadcheck:setups-more:v1','loadcheck:setup-marks:v1','loadcheck:saved-at:v1'];
function failAt(p,n){
  const put=p.localStorage.setItem,log={count:0,failed:null,after:[]};
  p.localStorage.setItem=function(key,value){
    if(SETUP_WRITE_KEYS.includes(key)){
      if(log.failed) log.after.push(key);
      if(log.count++===n){ log.failed=key; throw new Error('QuotaExceededError'); }
    }
    return put.call(this,key,value);
  };
  return log;
}

test('[SET-LIMITS] storage that fills during a setup write never loses an untouched setup: a delete frees room, and a write that cannot finish keeps what was stored (review of PR 80, I-1)',async()=>{
  // Probe A: 25 trip setups, one (t20) a little larger; storage within 200 characters of full. The rider deletes t3 to make room.
  const storage=sharedStore(),a=tab(storage);
  await a.run(`SETUPS=Array.from({length:25},(_,i)=>qaSetup('t'+i,i===20 ? {note:'x'.repeat(600)} : {}));store.set(SETUP_KEY,SETUPS)`);
  fill(a,200);
  await a.run(`deleteSetup('t3')`);
  const left=ids(freshRead(storage.values));
  assert.equal(left.includes('t20'),true,'the larger setup the rider never touched is still there');
  assert.equal(left.includes('t3'),false,'and the delete went through, freeing its room');
  assert.equal(left.length,24);
  assert.equal(a.json('SETUPS_STORED'),true);
  // Probe B: 20 trip setups, the 20th (t19) larger; storage within 1,000 characters of full. A small new setup goes on top, as Plan
  // bags for this trip adds its setups without a picture.
  const s2=sharedStore(),b=tab(s2);
  await b.run(`SETUPS=Array.from({length:20},(_,i)=>qaSetup('t'+i,i===19 ? {thumb:'<svg>'+'x'.repeat(5000)+'</svg>'} : {}));store.set(SETUP_KEY,SETUPS)`);
  const before=freshRead(s2.values);
  fill(b,1000);
  await b.run(`saveSetup('Small','')`);
  assert.deepEqual(freshRead(s2.values),before,'what was stored before is all there, unchanged, t19 with it, and nothing else');
  assert.equal(b.json('SETUPS_STORED'),false,'the page says the save did not reach storage');
  assert.match(b.json('storageNote()'),/did not reach storage/);
  assert.match(b.json('SAVE_MESSAGE'),/session only/);
});

test('[SET-LIMITS] after a change that did not fit, a delete still reaches storage and frees its room, whichever list holds the setup (third review of PR 80, m-A)',async()=>{
  const stories=[
    // [what, whose library, the change that does not fit, the setup then deleted]
    ['20 setups saved here, then a 21st','here',`saveSetup('One more','')`,'t5'],
    ['an older page\'s 12, then a mark here','old',`setSetupKind('o3','general')`,'o7'],
    ['an older page\'s 12, then a new setup here','old',`saveSetup('One more','')`,'o7'],
  ];
  for(const [what,whose,change,gone] of stories){
    const storage=sharedStore();
    if(whose==='here'){ const p=tab(storage); await p.run(`SETUPS=Array.from({length:20},(_,i)=>qaSetup('t'+i));store.set(SETUP_KEY,SETUPS)`); storage.vms.delete(p); }
    else { const old=olderTab(storage); old.open(); for(let i=0;i<12;i++) old.save('o'+i); }
    const a=tab(storage);
    await a.run('qaOpen()');
    const before=ids(freshRead(storage.values));
    fill(a,30);
    await a.run(change);
    assert.deepEqual(ids(freshRead(storage.values)),before,`${what}: it did not fit, and nothing changed`);
    assert.equal(a.json('SETUPS_STORED'),false,`${what}: the page says so`);
    await a.run(`deleteSetup('${gone}')`);
    const after=ids(freshRead(storage.values));
    assert.equal(after.includes(gone),false,`${what}: the delete after it reached storage`);
    for(const id of before) if(id!==gone) assert.ok(after.includes(id),`${what}: ${id} is lost`);
    // with the room the delete freed, the change before it may fit now too; either way the page says exactly what is stored
    assert.equal(a.json('SETUPS_STORED'),JSON.stringify(a.json('SETUPS.map(s=>normaliseSetup(s))'))===JSON.stringify(freshRead(storage.values)),`${what}: the page says what is stored`);
  }
});

test('[SET-LIMITS] whichever single write of a setup save fails, no setup the rider did not delete is lost or changed, the rest of the save stops, and the page says exactly whether the store holds what it shows (review of PR 80, I-1; third review, m-B)',async()=>{
  // [what, the older page's setups, this page's library, marks given here, the setups each change works on]
  const libraries=[
    ['fewer than 20, saved here',0,`Array.from({length:5},(_,i)=>qaSetup('t'+i))`,[],{here:'t1',trip:'t2'}],
    ['an older page\'s 12, two marked general here, and 5 saved here',12,`Array.from({length:5},(_,i)=>qaSetup('t'+i))`,['o2','o9'],{old:'o4',here:'t1',trip:'o6',general:'o2'}],
    ['more than 20, general and trip setups mixed, saved here',0,'qaLibrary()',[],{here:'t25',trip:'t3',general:'g1'}],
    ['an older page\'s 20 and 24 saved here, 19 of them general',20,`[...Array.from({length:19},(_,i)=>qaSetup('g'+i,{kind:'general'})),...Array.from({length:5},(_,i)=>qaSetup('t'+i))]`,[],
      {old:'o3',here:'t2',trip:'o5',general:'g1'}],
  ];
  // [what, the write, the setup it deletes, the setup it changes, a write before it]
  const ops=x=>[
    ['a new setup on top',`saveSetup('New one','')`],
    x.old && ['a delete of an older page\'s setup',`deleteSetup('${x.old}')`,x.old],
    ['a delete of one saved here',`deleteSetup('${x.here}')`,x.here],
    x.trip && ['a mark as a general setup',`setSetupKind('${x.trip}','general')`,null,x.trip],
    x.general && ['a mark back to a trip setup',`setSetupKind('${x.general}','trip')`,null,x.general],
    x.old && ['a rename of an older page\'s setup',`renameSetup('${x.old}','Renamed')`,null,x.old],
    ['a rename of one saved here',`renameSetup('${x.here}','Renamed')`,null,x.here],
    ['a copy',`duplicateSetup('${x.here}')`],
    ['an undone delete',`undoDeleteSetup()`,x.here,null,`deleteSetup('${x.here}')`],
    ['an import',`importAll(JSON.stringify({setups:[qaSetup('imp1'),qaSetup('imp2',{saved:'2026-11-05'})]}))`],
  ].filter(Boolean);
  // what the tab shows, and whether a page opened afresh reads exactly that
  const holds=p=>JSON.stringify(p.json('SETUPS.map(s=>normaliseSetup(s))'))===JSON.stringify(freshRead(p.values));
  let cases=0;
  for(const [what,older,library,marked,x] of libraries){
    const storage=sharedStore();
    if(older){ const old=olderTab(storage); old.open(); for(let i=0;i<older;i++) old.save('o'+i); }
    const base=tab(storage);
    await base.run(`(async()=>{await qaOpen();SETUPS.push(...${library});await store.set(SETUP_KEY,SETUPS);for(const id of ${JSON.stringify(marked)}) await setSetupKind(id,'general');})()`);
    storage.vms.delete(base);
    const stored=byId(freshRead(storage.values));
    for(const [op,code,deleted,changed,prep] of ops(x)){
      const start=async()=>{
        const p=copyOf(storage.values);
        await p.run('qaOpen()');
        if(prep) await p.run(prep);
        return p;
      };
      const dry=await start(),count=failAt(dry,Infinity);
      await dry.run(code);
      assert.equal(dry.json('SETUPS_STORED'),true,`${what}, ${op}: stored`);
      assert.ok(holds(dry),`${what}, ${op}: a page opened afresh reads what the tab shows, in its order`);
      for(let n=0;n<count.count;n++){
        const p=await start(),log=failAt(p,n);
        await p.run(code);
        const label=`${what}, ${op}, write ${n+1} of ${count.count} (${log.failed}) fails`;
        const now=byId(freshRead(p.values));
        for(const id of Object.keys(stored)){
          if(id === deleted) continue;
          assert.ok(now[id],`${label}: ${id} is lost`);
          if(id !== changed) assert.equal(now[id],stored[id],`${label}: ${id} changed`);
        }
        assert.equal(p.json('SETUPS_STORED'),holds(p),`${label}: the page says ${p.json('SETUPS_STORED') ? '' : 'not '}stored, the store ${holds(p) ? 'holds' : 'does not hold'} what the tab shows`);
        if(!p.json('SETUPS_STORED')) assert.match(p.json('storageNote()'),/did not reach storage/,label);
        assert.deepEqual(log.after.filter(k=>k!=='loadcheck:saved-at:v1'),[],`${label}: the save went on after the failure`);
        cases++;
      }
    }
  }
  assert.ok(cases>=40,'enough failing writes were tried: '+cases);
});

test('[SET-LIMITS] a page opened afresh shows each group in the tab\'s order, so Plan bags for this trip starts from the same general setup (third review of PR 80, m-C)',async()=>{
  const storage=sharedStore(),a=tab(storage);
  await a.run(`SETUPS=qaLibrary().map(s=>{delete s.isDefault;return s;});store.set(SETUP_KEY,SETUPS)`);
  assert.equal(await a.run(`setSetupKind('t25','general')`),true);
  const order=a.json(`setupGroups(SETUPS).general.map(s=>s.id)`),foundation=a.json('tripFoundation().id');
  assert.deepEqual(order,['t25','g0','g1','g2']);
  const b=copyOf(storage.values);
  await b.run('qaOpen()');
  assert.deepEqual(b.json(`setupGroups(SETUPS).general.map(s=>s.id)`),order);
  assert.equal(b.json('tripFoundation().id'),foundation);
});

test('[SET-LIMITS] whichever single write of Also delete bag planner data fails, every setup saved after the request is still stored (review of PR 80, I-1)',async()=>{
  const storage=sharedStore(),old=olderTab(storage);
  old.open();
  for(let i=0;i<4;i++) old.save('o'+i);
  const base=tab(storage);
  await base.run(`(async()=>{await qaOpen();SETUPS.push(...qaLibrary());await store.set(SETUP_KEY,SETUPS);await setSetupKind('o1','general');})()`);
  await later();
  request(storage.values,'d');
  await later();
  await base.run(`(async()=>{await renameSetup('t25','After, saved here');await renameSetup('o2','After, an older page\\'s');})()`);
  const dry=copyOf(storage.values),count=failAt(dry,Infinity);
  assert.equal(dry.run('applyDeleteRequest()'),true);
  assert.deepEqual(ids(freshRead(dry.values)).sort(),['o2','t25']);
  for(let n=0;n<count.count;n++){
    const p=copyOf(storage.values);
    failAt(p,n);
    p.run('applyDeleteRequest()');
    const now=ids(freshRead(p.values));
    assert.ok(now.includes('o2') && now.includes('t25'),`write ${n+1} of ${count.count} fails: a setup saved after the request is lost`);
  }
});

test('[SET-LIMITS] when a write of Also delete bag planner data fails, the request is not marked applied: the page says so, the next start applies it again, and every setup saved after it stays (third review of PR 80, m-E)',async()=>{
  const storage=sharedStore(),old=olderTab(storage);
  old.open();
  for(let i=0;i<4;i++) old.save('o'+i);
  const base=tab(storage);
  await base.run(`(async()=>{await qaOpen();SETUPS.push(...qaLibrary());await store.set(SETUP_KEY,SETUPS);})()`);
  await later();
  request(storage.values,'d');
  await later();
  // after the request: the older page saves one more setup, and this page renames one of its own
  old.open();
  old.save('oAfter');
  await base.run(`renameSetup('t25','After the request')`);
  const applied=p=>{ try { return JSON.parse(p.values.get('loadcheck:delete-applied') ?? 'null'); } catch(e){ return null; } };
  const dry=copyOf(storage.values),count=failAt(dry,Infinity);
  assert.equal(dry.run('applyDeleteRequest()'),true);
  let cases=0;
  for(let n=0;n<count.count;n++){
    const p=copyOf(storage.values),log=failAt(p,n);
    p.run('applyDeleteRequest()');
    if(log.failed === 'loadcheck:saved-at:v1') continue;   // every removal reached storage; only the stamps of what is left did not
    const label=`write ${n+1} of ${count.count} (${log.failed}) fails`;
    assert.equal(applied(p),null,`${label}: the request is not marked applied`);
    assert.match(String(p.nodes.get('tabText').textContent),/could not be deleted/,`${label}: the page says so`);
    for(const id of ['oAfter','t25']) assert.ok(ids(freshRead(p.values)).includes(id),`${label}: ${id}, saved after the request, stays`);
    // the next start, with storage that takes the writes again: the request is applied, once
    assert.equal(p.run('applyDeleteRequest()'),true,label);
    assert.equal(applied(p).id,'d'.repeat(32),label);
    assert.deepEqual(ids(freshRead(p.values)).sort(),['oAfter','t25'],`${label}: only the setups saved after the request are left`);
    assert.equal(p.run('applyDeleteRequest()'),false,`${label}: and it is applied once`);
    cases++;
  }
  assert.ok(cases>=2,'failing writes tried: '+cases);
});

test('[SET-LIMITS] Also delete bag planner data takes every setup saved before the request, whichever list holds it now: moving between the lists is not a change (review of PR 80, m-1)',async()=>{
  // The twin of the case above, in a tab that has not seen the request: a new setup on top, a delete, and two deletes, then a new setup.
  const cases=[
    ['a new setup on top',`saveSetup('Planned after','')`,['Planned after']],
    ['a delete',`deleteSetup('t0')`,[]],
    ['two deletes, then a new setup',`(async()=>{await deleteSetup('t0');await deleteSetup('t1');await saveSetup('Planned after','');})()`,['Planned after']],
  ];
  for(const [what,code,left] of cases){
    const storage=sharedStore(),a=tab(storage);
    await a.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)');
    await later();
    storage.values.set('copilot:delete-request:v1',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id:'f'.repeat(32),createdAt:new Date().toISOString()}));
    await later();
    const b=tab(sharedStore());
    for(const [k,v] of storage.values) b.values.set(k,v);
    await b.run('SETUPS=storedSetupsLocal();SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));');
    await b.run(code);
    const c=tab(sharedStore());
    for(const [k,v] of b.values) c.values.set(k,v);
    assert.equal(c.run('applyDeleteRequest()'),true);
    assert.deepEqual(c.json('storedSetupsLocal().map(s=>s.name)'),left,what);
  }
});

test('[SET-LIMITS] Also delete bag planner data still takes the setups saved before the request when an older page writes its setups in between (third review of PR 80, m-D)',async()=>{
  const storage=sharedStore(),old=olderTab(storage);
  old.open();
  for(let i=0;i<8;i++) old.save('o'+i);
  const a=tab(storage);
  await a.run('qaOpen()');
  // this page marks three of the older page's setups general, and adds a library of its own
  await a.run(`(async()=>{for(const id of ['o1','o3','o5']) await setSetupKind(id,'general');SETUPS.push(...qaLibrary());await store.set(SETUP_KEY,SETUPS);})()`);
  await later();
  request(storage.values,'f');
  await later();
  // after the request, before the bag planner applies it: an older page's tab writes a note on o6, and this page renames t25
  old.open();
  old.write(l=>{ l.find(s=>s.id==='o6').note='Written after the request'; });
  await a.run(`renameSetup('t25','Renamed after the request')`);
  // the older page writes once more after that rename
  old.open();
  old.write(l=>{ l.find(s=>s.id==='o6').note='Written after the request, again'; });
  const c=copyOf(storage.values);
  assert.equal(c.run('applyDeleteRequest()'),true);
  assert.deepEqual(c.json('storedSetupsLocal().map(s=>[s.id,s.name,s.note])'),[['o6','Setup o6','Written after the request, again'],['t25','Renamed after the request','']],
    'only the setups changed after the request stay: the older page\'s own write changed no other, and the rename here kept its time');
});

test('[SET-LIMITS] a tab whose saved setups another tab removes names them, so a loss from an older tab is never silent (review of PR 80, m-2)',async()=>{
  const storage=sharedStore(),old=olderTab(storage);
  old.open();
  for(let i=0;i<20;i++) old.save('o'+i);
  const a=tab(storage),b=tab(storage);
  await b.run('qaOpen()');
  await a.run('(async()=>{await qaOpen();SETUPS.push(...qaLibrary());await store.set(SETUP_KEY,SETUPS);})()');
  assert.equal(b.json('SETUPS.length'),53);
  // an older page's write of its list, without 13 of its setups (its rider deleted them there, or it was a tab that cut them)
  old.open();
  old.write(l=>{ l.splice(0,13); });
  assert.equal(b.json('SETUPS.length'),40);
  const text=String(b.nodes.get('tabText').textContent);
  assert.match(text,/^13 saved setups were removed in another tab: Setup o19, /);
  assert.match(text,/older Bag planner tab/);
  // the tab's own delete names nothing there; a delete in another tab is named
  b.nodes.get('tabText').textContent='';
  await b.run(`deleteSetup('t12')`);
  assert.equal(String(b.nodes.get('tabText').textContent),'');
  await a.run(`deleteSetup('t13')`);
  assert.match(String(b.nodes.get('tabText').textContent),/^A saved setup was removed in another tab: Setup t13\./);
});

test('[SET-LIMITS] the page starts with storedSetups(), and the stored values are read through the store in one place (review of PR 80, m-4)',()=>{
  const init=q.script.slice(q.script.indexOf('/* ==== 95-init.js ==== */'));
  assert.match(init,/SETUPS\s*=\s*await storedSetups\(\)/,'the start-up reads the setups with storedSetups()');
  assert.doesNotMatch(init,/joinSetups\(|SETUP_MORE_KEY|SETUP_MARKS_KEY/,'and nothing else of the start-up reads the stored values');
  assert.equal((q.script.match(/store\.get\(SETUP_MORE_KEY\)/g) || []).length,1,'one place reads them through the store');
});

(async()=>{
  for(const [name,fn] of tests){
    try { await fn(); passed++; } catch(e){ console.error('FAIL '+name+'\n'+(e && e.stack || e)); process.exitCode=1; }
  }
  console.log(`setup-kinds: ${passed} of ${tests.length} passed`);
})();
