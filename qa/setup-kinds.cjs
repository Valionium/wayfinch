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
  assert.equal(json(`storedSetupsLocal().find(s=>s.id==='t_a').kind`),'general','stored at once');
  assert.match(json('SAVE_MESSAGE'),/general setup/);
  assert.equal(await run(`setSetupKind('t_a','trip')`),true);
  const stored=json(`storedSetupsLocal().find(s=>s.id==='t_a')`);
  assert.equal(stored.kind,undefined,'back to a trip setup: the kind is gone again');
  assert.equal(JSON.stringify(JSON.parse(q.values.get('loadcheck:setups-more:v1')).find(s=>s.id==='t_a')).includes('"kind"'),false,'in its stored copy too');
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

// Older pages (an old open tab, a rollback, the frozen copy at /) read loadcheck:setups, cut it to 20 on every setup write and drop
// kind, forRoute, base and isDefault (review of PR 80, I1). The browser test with the real old pages is in tests/e2e/launch.spec.ts.
const {sharedStore}=require('./app-vm.cjs');
function tab(storage){
  const p=appVM({storage});
  p.run('DRAFT_READY=true;buildThumb=()=>"";');
  p.run(`var qaSetup=(id,extra={})=>normaliseSetup({...captureDraft(),id,name:'Setup '+id,saved:'2026-10-30',
    predicted:{mounted:35,kit:31,spare:4,spilled:0,kg:14},thumb:'',...extra});
    var qaLibrary=()=>[...Array.from({length:30},(_,i)=>qaSetup('t'+i,{forRoute:{hash:'${HASH}',name:'Ride '+i,departureDate:null},...(i===5 ? {base:'g1'} : {})})),
      ...Array.from({length:3},(_,i)=>qaSetup('g'+i,{kind:'general',...(i===1 ? {isDefault:true} : {})}))];`);
  p.json=code=>{const t=p.run(`JSON.stringify(${code})`);return t===undefined ? undefined : JSON.parse(t);};
  return p;
}
const MARKS=['kind','forRoute','base','isDefault'];
const strip=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!MARKS.includes(k)));

test('[SET-LIMITS] a setup this page adds never enters the list older pages read: that list keeps only what older pages saved there; the rest and every setup\'s marks are kept where older pages never look; read together they are the one list (review of PR 80, I1; the owner\'s choice of 9 Nov 2026)',async()=>{
  const storage=sharedStore(),a=tab(storage);
  // 5 setups an older page saved, then this page's library of 33 on top
  olderPageSaved(a,`Array.from({length:5},(_,i)=>qaSetup('o'+i))`);
  const older=storage.values.get('loadcheck:setups');
  assert.equal(await a.run('SETUPS=[...qaLibrary(),...storedSetupsLocal()];store.set(SETUP_KEY,SETUPS)'),true);
  assert.equal(storage.values.get('loadcheck:setups'),older,'the list older pages read is as the older page left it, byte for byte');
  const more=JSON.parse(storage.values.get('loadcheck:setups-more:v1'));
  assert.deepEqual(more.map(s=>s.id),a.json('qaLibrary().map(s=>s.id)'),'every setup this page added is in the second list, in the list\'s order');
  // marking one of the older page's setups general moves it nowhere
  assert.equal(await a.run(`setSetupKind('o2','general')`),true);
  assert.deepEqual(JSON.parse(storage.values.get('loadcheck:setups')).map(s=>s.id),['o0','o1','o2','o3','o4']);
  // An older page writes its 5 back through its own normaliseSetup: the new fields go; it renamed one and deleted another.
  const old=JSON.parse(storage.values.get('loadcheck:setups')).map(strip).filter(s=>s.id!=='o3').map(s=>s.id==='o2' ? {...s,name:'Renamed in an old tab'} : s);
  storage.values.set('loadcheck:setups',JSON.stringify(old));
  const b=tab(sharedStore());
  for(const [k,v] of storage.values) b.values.set(k,v);
  const read=await b.run('storedSetups()');
  const ids=b.json('storedSetupsLocal().map(s=>s.id)');
  assert.equal(ids.length,37,'nothing cut: 38 less the one the old tab deleted');
  assert.equal(ids.includes('o3'),false,'the old tab\'s delete stays');
  assert.equal(read.length,37);
  const back=b.json(`storedSetupsLocal().map(s=>[s.id,setupKind(s),!!s.forRoute,s.base||null,s.isDefault||false,s.name])`);
  assert.deepEqual(back.filter(x=>x[1]==='general').map(x=>x[0]).sort(),['g0','g1','g2','o2'],'the general marks are back, the older page\'s setup among them');
  assert.equal(back.filter(x=>x[0].startsWith('t') && x[2]).length,30,'and every trip link');
  assert.deepEqual(back.find(x=>x[0]==='t5').slice(3,4),['g1']);
  assert.equal(back.find(x=>x[0]==='g1')[4],true);
  assert.equal(back.find(x=>x[0]==='o2')[5],'Renamed in an old tab','the old tab\'s own change stays');
  // a library this page saves from the start has nothing in the list older pages read, and plain setups need nothing else
  const c=tab(sharedStore());
  await c.run(`SETUPS=Array.from({length:5},(_,i)=>qaSetup('p'+i));store.set(SETUP_KEY,SETUPS)`);
  assert.deepEqual([...c.values.keys()].filter(k=>k.startsWith('loadcheck:setup')).sort(),['loadcheck:setups-more:v1']);
  assert.deepEqual(JSON.parse(c.values.get('loadcheck:setups-more:v1')).map(s=>s.id),['p0','p1','p2','p3','p4']);
});

test('[SET-LIMITS] another tab follows a library kept in two lists, and its next write keeps every setup (review of PR 80, I1)',async()=>{
  const storage=sharedStore(),a=tab(storage),b=tab(storage);
  await b.run('SETUPS=[];');
  await a.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)');
  assert.equal(b.json('SETUPS.length'),33,'the other tab follows both lists');
  assert.equal(b.json(`SETUPS.filter(s=>setupKind(s)==='general').length`),3);
  assert.equal(await b.run(`saveSetup('One more','')`),true);
  assert.equal(a.json('SETUPS.length'),34);
  assert.equal(b.json('storedSetupsLocal().length'),34);
  // a general setup marked back to a trip setup loses its mark in both places
  await a.run(`setSetupKind('g0','trip')`);
  assert.equal(b.json(`setupKind(storedSetupsLocal().find(s=>s.id==='g0'))`),'trip');
  assert.equal(b.json(`setupKind(SETUPS.find(s=>s.id==='g0'))`),'trip');
  // deletes move nothing, so a delete on a full storage frees room (fix round of PR 80, I-1), and nothing else goes; a setup added
  // after them goes to the second list too, never to the list older pages read (the owner's choice of 9 Nov 2026)
  await a.run(`(async()=>{for(const s of SETUPS.slice(0,15)) await deleteSetup(s.id);})()`);
  assert.equal(a.json('SETUPS.length'),19);
  assert.equal(b.json('storedSetupsLocal().length'),19);
  assert.equal(storage.values.get('loadcheck:setups'),undefined,'nothing in the list older pages read');
  assert.equal(JSON.parse(storage.values.get('loadcheck:setups-more:v1')).length,19,'each setup in one list');
  assert.equal(await a.run(`saveSetup('Into the second list','')`),true);
  assert.equal(a.json('SETUPS.length'),20);
  assert.equal(storage.values.get('loadcheck:setups'),undefined);
  assert.equal(JSON.parse(storage.values.get('loadcheck:setups-more:v1'))[0].name,'Into the second list');
  assert.equal(b.json('SETUPS.length'),20);
});

test('[SET-LIMITS] Also delete bag planner data takes the setups past 20 and their marks with the rest; one saved after the request stays with its marks (review of PR 80, I1)',async()=>{
  const storage=sharedStore(),a=tab(storage);
  await a.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)');
  await new Promise(r=>setTimeout(r,5));   // the request comes after that save
  const asked=new Date().toISOString();
  storage.values.set('copilot:delete-request:v1',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id:'f'.repeat(32),createdAt:asked}));
  await new Promise(r=>setTimeout(r,5));
  // after the request, in another tab that has not seen it yet: one trip setup of the second list gets a new name
  const b=tab(sharedStore());
  for(const [k,v] of storage.values) b.values.set(k,v);
  await b.run(`SETUPS=storedSetupsLocal();renameSetup('t25','Planned after')`);
  const c=tab(sharedStore());
  for(const [k,v] of b.values) c.values.set(k,v);
  assert.equal(c.run('applyDeleteRequest()'),true);
  assert.equal(c.values.get('loadcheck:setups'),undefined,'every setup of the first list was saved before');
  assert.deepEqual(JSON.parse(c.values.get('loadcheck:setups-more:v1')).map(s=>s.id),['t25']);
  const marks=JSON.parse(c.values.get('loadcheck:setup-marks:v1'));
  assert.deepEqual(Object.keys(marks.marks),['t25'],'the marks of what went go too');
  assert.deepEqual(c.json(`storedSetupsLocal().map(s=>[s.id,s.name,!!s.forRoute])`),[['t25','Planned after',true]]);
  // with nothing saved after it, nothing of the three is left
  const d=tab(sharedStore());
  await d.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)');
  d.values.set('copilot:delete-request:v1',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id:'e'.repeat(32),createdAt:new Date(Date.now()+60000).toISOString()}));
  assert.equal(d.run('applyDeleteRequest()'),true);
  assert.deepEqual([...d.values.keys()].filter(k=>k.startsWith('loadcheck:setup')),[]);
});

// A full storage (fix round of PR 80, I-1). `fill` leaves `room` characters: a write that would take the store past that throws, as a
// full localStorage does. `failAt` makes one write of a setup save throw: the n-th setItem of the three setup keys and the ledger.
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
  const put=p.localStorage.setItem,log={count:0,failed:null,after:[],afterWrites:[]};
  p.localStorage.setItem=function(key,value){
    if(SETUP_WRITE_KEYS.includes(key)){
      if(log.failed){ log.after.push(key); log.afterWrites.push([key,p.values.get(key) ?? null,String(value)]); }
      if(log.count++===n){ log.failed=key; throw new Error('QuotaExceededError'); }
    }
    return put.call(this,key,value);
  };
  return log;
}
// What a page opened afresh reads from this store, by id: each setup's first stored copy and its marks, and what the page's own reader
// (joinSetups) makes of them. One VM reads every store; a setup stored and marked exactly as in `base` reads as it read there.
const reader=tab(sharedStore());
reader.run(`var qaRead=(values,base)=>{
  const get=k=>{ try { return JSON.parse(values[k] ?? 'null'); } catch(e){ return null; } };
  const record=get('loadcheck:setup-marks:v1'),marks=record && record.marks || {},out={};
  for(const l of [get('loadcheck:setups'),get('loadcheck:setups-more:v1')]) for(const x of Array.isArray(l) ? l : []){
    if(!x || typeof x.id!=='string' || out[x.id]) continue;
    const text=JSON.stringify(x),mark=JSON.stringify(marks[x.id] ?? null),b=base && base[x.id];
    out[x.id]=b && b.text===text && b.mark===mark ? b : {text,mark,read:JSON.stringify(joinSetups([x],[],record)[0] ?? null)};
  }
  return out;
};`);
function reread(values,base){
  reader.context.qaValues=Object.fromEntries(values); reader.context.qaBase=base || null;
  return reader.run('qaRead(qaValues,qaBase)');
}
const later=()=>new Promise(r=>setTimeout(r,5));

test('[SET-LIMITS] storage that fills during a setup write never loses an untouched setup: a delete frees room, and a write that cannot finish keeps what was stored (review of PR 80, I-1)',async()=>{
  // Probe A: 25 trip setups, 20 an older page saved and 5 this page added, the 21st (t20, in the second list) a little larger; storage
  // within 200 characters of full. The rider deletes t3, in the first list, to make room.
  const storage=sharedStore(),a=tab(storage);
  olderPageSaved(a,`Array.from({length:20},(_,i)=>qaSetup('t'+i))`);
  await a.run(`SETUPS=[...Array.from({length:5},(_,i)=>qaSetup('t'+(20+i),i===0 ? {note:'x'.repeat(600)} : {})),...storedSetupsLocal()];store.set(SETUP_KEY,SETUPS)`);
  assert.deepEqual(JSON.parse(storage.values.get('loadcheck:setups-more:v1')).map(s=>s.id),['t20','t21','t22','t23','t24']);
  fill(a,200);
  await a.run(`deleteSetup('t3')`);
  const ids=Object.keys(reread(storage.values));
  assert.equal(ids.includes('t20'),true,'the larger setup the rider never touched is still there');
  assert.equal(ids.includes('t3'),false,'and the delete went through, freeing its room');
  assert.equal(ids.length,24);
  assert.equal(a.json('SETUPS_STORED'),true);
  // Probe B: 20 trip setups, the 20th (t19) larger; storage within 1,000 characters of full. A small new setup goes on top, as Plan
  // bags for this trip adds its setups without a picture (into the second list, which is not stored yet).
  const s2=sharedStore(),b=tab(s2);
  await b.run(`SETUPS=Array.from({length:20},(_,i)=>qaSetup('t'+i,i===19 ? {thumb:'<svg>'+'x'.repeat(5000)+'</svg>'} : {}));store.set(SETUP_KEY,SETUPS)`);
  const before=reread(s2.values);
  fill(b,1000);
  await b.run(`saveSetup('Small','')`);
  const after=reread(s2.values);
  assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort(),'what was stored before is all there, t19 with it, and nothing else');
  for(const id of Object.keys(before)) assert.equal(after[id].read,before[id].read,'unchanged: '+id);
  assert.equal(b.json('SETUPS_STORED'),false,'the page says the save did not reach storage');
  assert.match(b.json('storageNote()'),/did not reach storage/);
  assert.match(b.json('SAVE_MESSAGE'),/session only/);
});

test('[SET-LIMITS] whichever single write of a setup save fails, no setup the rider did not delete is lost or changed, what follows only takes out what the rider deleted, and the page says it did not reach storage exactly when the store does not hold what the tab holds (review of PR 80, I-1; fix round 2, m-A and m-B)',async()=>{
  // [what, the setups an older page saved (the list it reads), the setups this page added (the second list), the ids the writes use]
  const libraries=[
    ['fewer than 20, all saved by an older page',`Array.from({length:5},(_,i)=>qaSetup('t'+i))`,'[]',{first:'t1',trip:'t2'}],
    ['exactly 20: 17 an older page saved, 3 general ones this page added',`Array.from({length:17},(_,i)=>qaSetup('t'+i))`,
      `Array.from({length:3},(_,i)=>qaSetup('g'+i,{kind:'general'}))`,{first:'t3',second:'g2',trip:'t5',general:'g1'}],
    ['more than 20, general and trip setups mixed: 5 an older page saved, the library this page added',`Array.from({length:5},(_,i)=>qaSetup('o'+i))`,
      'qaLibrary()',{first:'o3',second:'t25',trip:'t25',general:'g1',firstTrip:'o2'}],
    ['5 trip setups an older page saved, 20 general ones this page added',`Array.from({length:5},(_,i)=>qaSetup('t'+i))`,
      `Array.from({length:20},(_,i)=>qaSetup('g'+i,{kind:'general'}))`,{first:'t3',second:'g2',general:'g1',trip:'t2'}],
    ['all 25 added by this page',`[]`,`Array.from({length:25},(_,i)=>qaSetup('t'+i,{forRoute:{hash:'${HASH}',name:'Ride '+i,departureDate:null}}))`,
      {second:'t4',trip:'t5'}],
  ];
  // [what, the write, the setup it deletes, the setup it changes, a write before it]
  const ops=ids=>[
    ['a new setup on top',`saveSetup('New one','')`],
    ids.first && ['a delete in the first list',`deleteSetup('${ids.first}')`,ids.first],
    ids.second && ['a delete in the second list',`deleteSetup('${ids.second}')`,ids.second],
    ids.trip && ['a mark as a general setup',`setSetupKind('${ids.trip}','general')`,null,ids.trip],
    ids.firstTrip && ['a mark of a setup in the first list',`setSetupKind('${ids.firstTrip}','general')`,null,ids.firstTrip],
    ids.general && ['a mark back to a trip setup',`setSetupKind('${ids.general}','trip')`,null,ids.general],
    ['a rename',`renameSetup('${ids.first || ids.second}','Renamed')`,null,ids.first || ids.second],
    ['a note in the second list',ids.second && `saveSetupNote('${ids.second}','A note')`,null,ids.second],
    ['a copy',`duplicateSetup('${ids.first || ids.second}')`],
    ['an undone delete',`undoDeleteSetup()`,ids.first || ids.second,null,`deleteSetup('${ids.first || ids.second}')`],
    ['an import',`importAll(JSON.stringify({setups:[qaSetup('imp1'),qaSetup('imp2',{saved:'2026-11-05'})]}))`],
  ].filter(x=>x && x[1]);
  // a write after the failure only takes setups out: each list and the marks keep only entries they held, byte for byte
  const onlyTakesOut=([key,before,after])=>{
    if(key === 'loadcheck:saved-at:v1') return true;
    const was=JSON.parse(before ?? 'null'),now=JSON.parse(after);
    if(Array.isArray(now)){
      const old=new Set((Array.isArray(was) ? was : []).map(x=>JSON.stringify(x)));
      return now.length<(Array.isArray(was) ? was.length : 0) && now.every(x=>old.has(JSON.stringify(x)));
    }
    return false;
  };
  let cases=0,stored=0;
  for(const [what,older,added,ids] of libraries){
    const base=tab(sharedStore());
    if(older !== `[]`) olderPageSaved(base,older);
    await base.run(`SETUPS=[...${added},...storedSetupsLocal()];store.set(SETUP_KEY,SETUPS)`);
    const before=reread(base.values),joined=base.run('JSON.stringify(storedSetupsLocal())');
    if(ids.first) assert.ok(JSON.parse(base.values.get('loadcheck:setups')).some(x=>x.id===ids.first),`${what}: ${ids.first} is in the first list`);
    if(ids.second) assert.ok(JSON.parse(base.values.get('loadcheck:setups-more:v1')).some(x=>x.id===ids.second),`${what}: ${ids.second} is in the second list`);
    // One tab for this library, opened afresh on it for each case: its storage put back, and everything the setup write keeps in memory
    // with it (a new VM per case would take most of the suite's time).
    const pool=tab(sharedStore()),put=pool.localStorage.setItem;
    pool.context.qaJoined=joined;
    for(const [op,code,deleted,changed,prep] of ops(ids)){
      // a tab that opened on this library: its setups as the page reads them
      const start=async()=>{
        const p=pool;
        p.localStorage.setItem=put;
        p.values.clear();
        for(const [k,v] of base.values) p.values.set(k,v);
        await p.run(`for(const k of Object.keys(MEM)) delete MEM[k];SETUPS_SEEN.clear();SETUPS_KNOWN=new Set(storedSetupIds());STORAGE_KIND='browser';
          SETUP_ACTION=null;SETUP_COMPARE=['',''];FEEDBACK=[];
          SETUPS=JSON.parse(qaJoined);SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));DELETED_SETUPS.length=0;SETUPS_STORED=true;SAVE_MESSAGE="";`);
        if(prep) await p.run(prep);
        return p;
      };
      const dry=await start(),count=failAt(dry,Infinity);
      await dry.run(code);
      for(let n=0;n<count.count;n++){
        const p=await start(),log=failAt(p,n);
        await p.run(code);
        const label=`${what}, ${op}, write ${n+1} of ${count.count} (${log.failed}) fails`;
        const now=reread(p.values,before);
        for(const id of Object.keys(before)){
          if(id === deleted) continue;
          assert.ok(now[id],`${label}: ${id} is lost`);
          if(id !== changed) assert.equal(now[id].read,before[id].read,`${label}: ${id} changed`);
        }
        for(const w of log.afterWrites) assert.ok(onlyTakesOut(w),`${label}: after the failure, ${w[0]} was written with more than a delete`);
        const held=tabHeld(p);
        assert.equal(p.json('SETUPS_STORED'),held,`${label}: the page says it is stored exactly when the store holds what the tab holds`);
        if(held) stored++;
        else assert.match(p.json('storageNote()'),/did not reach storage/,label);
        cases++;
      }
    }
  }
  assert.ok(cases>=60,'enough failing writes were tried: '+cases);
  assert.ok(stored>0,'and some of them had stored all there was to store: '+stored);
});

test('[SET-LIMITS] whichever single write of Also delete bag planner data fails, every setup saved after the request is still stored (review of PR 80, I-1)',async()=>{
  const base=tab(sharedStore());
  await base.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)');
  await later();
  base.values.set('copilot:delete-request:v1',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id:'d'.repeat(32),createdAt:new Date().toISOString()}));
  await later();
  await base.run(`(async()=>{await renameSetup('t25','After, in the second list');await renameSetup('g0','After, in the first list');})()`);
  const start=()=>{ const p=tab(sharedStore()); for(const [k,v] of base.values) p.values.set(k,v); return p; };
  const dry=start(),count=failAt(dry,Infinity);
  assert.equal(dry.run('applyDeleteRequest()'),true);
  assert.deepEqual(Object.keys(reread(dry.values)).sort(),['g0','t25']);
  for(let n=0;n<count.count;n++){
    const p=start();
    failAt(p,n);
    p.run('applyDeleteRequest()');
    const now=reread(p.values);
    assert.ok(now.g0 && now.t25,`write ${n+1} of ${count.count} fails: a setup saved after the request is lost`);
  }
});

test('[SET-LIMITS] Also delete bag planner data takes every setup saved before the request, whichever list holds it now: moving between the lists is not a change (review of PR 80, m-1)',async()=>{
  // The twin of the case above, in a tab that has not seen the request: a new setup on top, a delete, and two deletes, then a new
  // setup. (Before the owner's choice of 9 Nov 2026 these moved setups between the lists; now each stays where it is.)
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

test('[SET-LIMITS] a tab whose saved setups another tab removes names them, so a removal in another tab is never silent (review of PR 80, m-2)',async()=>{
  const storage=sharedStore(),a=tab(storage),b=tab(storage);
  olderPageSaved(a,`Array.from({length:5},(_,i)=>qaSetup('o'+i))`);
  await a.run('SETUPS=[...qaLibrary(),...storedSetupsLocal()];store.set(SETUP_KEY,SETUPS)');
  assert.equal(b.json('SETUPS.length'),38);
  // An older tab, following, deletes two of the setups it sees.
  const old=oldTab(storage);
  for(const name of ['Setup o1','Setup o2']) await old.run(`deleteSetup(SETUPS.find(s=>s.name===${JSON.stringify(name)}).id)`);
  assert.equal(b.json('SETUPS.length'),36);
  const text=String(b.nodes.get('tabText').textContent);
  assert.match(text,/^A saved setup was removed in another tab: Setup o2\. If that was not you, Import an export to bring it back\.$/);
  // several at once are named together
  const c=tab(sharedStore());
  for(const [k,v] of storage.values) c.values.set(k,v);
  await c.run('SETUPS=storedSetupsLocal();SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));SETUPS_KNOWN=new Set(storedSetupIds());');
  c.localStorage.setItem('loadcheck:setups-more:v1',JSON.stringify(JSON.parse(c.values.get('loadcheck:setups-more:v1')).filter(x=>!/^t([0-9]|1[01])$/.test(x.id))));
  c.fireStorage('loadcheck:setups-more:v1',null,null);
  assert.match(String(c.nodes.get('tabText').textContent),/^12 saved setups were removed in another tab: Setup t0, Setup t1, Setup t2, Setup t3, Setup t4 and 7 more\. If that was not you, Import an export to bring them back\.$/);
  // the tab's own delete names nothing there; a delete in another tab is named
  b.nodes.get('tabText').textContent='';
  await b.run(`deleteSetup('t12')`);
  assert.equal(String(b.nodes.get('tabText').textContent),'');
  await a.run(`SETUPS=storedSetupsLocal();deleteSetup('t13')`);
  assert.match(String(b.nodes.get('tabText').textContent),/^A saved setup was removed in another tab: Setup t13\./);
});

// An older page on the same storage: the frozen copy at / (releases/load-check-root.html), as an older Bag planner tab left open or a
// rollback runs it. It reads loadcheck:setups as its own start-up does, cuts it to 20 and drops the four new fields.
const path=require('node:path');
function oldTab(storage){
  const p=appVM({storage,page:path.join(__dirname,'..','releases','load-check-root.html'),bike:false});
  p.run('DRAFT_READY=true;buildThumb=()=>"";SETUPS=(JSON.parse(window.localStorage.getItem("loadcheck:setups")||"[]")).map(normaliseSetup).filter(Boolean);'+
    'if(typeof SETUPS_SEEN!=="undefined")SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));');
  p.json=code=>{const t=p.run(`JSON.stringify(${code})`);return t===undefined ? undefined : JSON.parse(t);};
  return p;
}
// Setups an older page saved, in the list it reads: as it writes them, without the four new fields.
function olderPageSaved(p,code){ p.localStorage.setItem('loadcheck:setups',JSON.stringify(p.json(code).map(strip))); }
const storedIds=values=>Object.keys(reread(values)).sort();
// Does the store hold what the tab holds: each setup as the page reads it, whatever the order?
const tabHeld=p=>p.json(`(()=>{const by=l=>JSON.stringify(l.map(s=>JSON.stringify(normaliseSetup(s))).sort());return by(SETUPS)===by(storedSetupsLocal());})()`);

test('[SET-LIMITS] a full library never loses a setup when an older page saved into room a delete left (fix round 2 of PR 80, I-A)',async()=>{
  const storage=sharedStore(),a=tab(storage);
  // 20 setups an older page saved; the rider marks five of them general here and adds 15 general and 25 trip setups: 20 + 40.
  olderPageSaved(a,`Array.from({length:20},(_,i)=>qaSetup('o'+i))`);
  await a.run('SETUPS=storedSetupsLocal();SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));SAVE_MESSAGE="";DELETED_SETUPS.length=0;');
  for(let i=0;i<5;i++) assert.equal(await a.run(`setSetupKind('o${i}','general')`),true);
  assert.equal(await a.run(`SETUPS.unshift(...Array.from({length:15},(_,i)=>qaSetup('g'+i,{kind:'general'})),...Array.from({length:25},(_,i)=>qaSetup('t'+i)));store.set(SETUP_KEY,SETUPS)`),true);
  assert.equal(a.json(`SETUPS.filter(s=>setupKind(s)==='general').length`),20);
  // The rider deletes the five general setups of the list an older page reads; an older tab, following, shows 15 and saves 5 there.
  for(let i=0;i<5;i++) await a.run(`deleteSetup('o${i}')`);
  const old=oldTab(storage);
  assert.equal(old.json('SETUPS.length'),15,'the older page shows the 15 left in the list it reads');
  for(let i=0;i<5;i++) assert.equal(await old.run(`saveSetup('Older page ${i}','')`),true);
  assert.equal(a.json('SETUPS.length'),60,'this tab follows: 60 in all');
  assert.equal(a.json(`SETUPS.filter(s=>setupKind(s)==='trip').length`),45,'45 of them trip setups');
  let all=storedIds(storage.values);
  assert.equal(all.length,60);
  // Each add from here keeps every stored setup, or is refused with a true message.
  const adds=[
    ['a copy of a general setup',`duplicateSetup('g0')`],
    ['an import of 3 general setups',`importAll(JSON.stringify({setups:Array.from({length:3},(_,i)=>qaSetup('imp'+i,{kind:'general'}))}))`],
    ['an undone delete of a general setup',`undoDeleteSetup()`],
    ['a save, a trip setup',`saveSetup('One more','')`],
  ];
  for(const [what,code] of adds){
    await a.run('SAVE_MESSAGE=""');
    const said=await a.run(code),now=storedIds(storage.values);
    for(const id of all) assert.ok(now.includes(id),`${what}: ${id} is lost`);
    const added=now.length-all.length,text=typeof said === 'string' ? said : a.json('SAVE_MESSAGE');
    if(typeof said === 'string') assert.equal(Number((/Added (\d+) setups/.exec(said) || [])[1]),added,`${what}: the message counts what was added`);
    if(!added){
      assert.doesNotMatch(text,/You have 40 trip|You have 20 general/,`${what}: no count that is not the count`);
      assert.match(text,/60 saved setups|45 trip setups|60 in all/,`${what}: refused, and the message says why: ${text}`);
    }
    assert.equal(a.json('SETUPS_STORED'),true,what);
    all=now;
  }
  assert.match(a.json(`setupKindFullMessage('trip')`),/^You have 45 trip setups\./,'the count is the count');
});

test('[SET-LIMITS] on a full storage, after a setup write that failed, a delete still reaches storage (fix round 2 of PR 80, m-A)',async()=>{
  // Story 1: 20 setups, storage within 26 characters of full: the save of a 21st fails. Story 2: 12 setups, storage within 100
  // characters of full: Use as a general setup fails at the new marks record. Each with the setups saved by this page, and in the list
  // an older page reads. A setup this page saved carries its mark in its own list too, so there storage within 10 characters of full
  // makes the mark fail.
  const stories=[
    ['20 setups, a 21st saved',20,{this:26,older:26},`saveSetup('One more','')`,'t3'],
    ['12 setups, one marked general',12,{this:10,older:100},`setSetupKind('t2','general')`,'t5'],
  ];
  for(const [what,n,rooms,first,doomed] of stories) for(const where of ['saved by this page','saved by an older page']){
    const label=`${what}, ${where}`,storage=sharedStore(),a=tab(storage),room=where === 'saved by this page' ? rooms.this : rooms.older;
    if(where === 'saved by this page') await a.run(`SETUPS=Array.from({length:${n}},(_,i)=>qaSetup('t'+i));store.set(SETUP_KEY,SETUPS)`);
    else { olderPageSaved(a,`Array.from({length:${n}},(_,i)=>qaSetup('t'+i))`); await a.run('SETUPS=storedSetupsLocal();SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));'); }
    const before=storedIds(storage.values);
    fill(a,room);
    await a.run(first);
    assert.equal(a.json('SETUPS_STORED'),false,`${label}: the first write did not reach storage`);
    await a.run(`deleteSetup('${doomed}')`);
    const now=storedIds(storage.values),held=a.json('SETUPS.map(s=>s.id)');
    assert.equal(now.includes(doomed),false,`${label}: the delete reached storage`);
    for(const id of before) if(id !== doomed) assert.ok(now.includes(id),`${label}: ${id} is lost`);
    for(const id of now) assert.ok(held.includes(id),`${label}: ${id} is stored, but the tab does not hold it`);
    assert.equal(a.json('SETUPS_STORED'),tabHeld(a),`${label}: the page says it is stored exactly when the store holds what the tab holds`);
  }
});

test('[SET-LIMITS] a reload keeps each group\'s order, and with it the general setup Plan bags for this trip starts from (fix round 2 of PR 80, m-C)',async()=>{
  const library=`qaLibrary().map(s=>{delete s.isDefault;return s;})`;
  for(const what of ['a library this page saved','an older page\'s 5 setups and this page\'s library']){
    const storage=sharedStore(),a=tab(storage);
    if(what === 'a library this page saved') await a.run(`SETUPS=${library};store.set(SETUP_KEY,SETUPS)`);
    else {
      olderPageSaved(a,`Array.from({length:5},(_,i)=>qaSetup('o'+i))`);
      await a.run(`SETUPS=[...${library},...storedSetupsLocal()];store.set(SETUP_KEY,SETUPS)`);
    }
    const fresh=async()=>{
      const b=tab(sharedStore());
      for(const [k,v] of storage.values) b.values.set(k,v);
      await b.run('(async()=>{SETUPS=await storedSetups();})()');
      return b;
    };
    // the review's probe: a setup of the second list marked general
    assert.equal(await a.run(`setSetupKind('t25','general')`),true);
    const general=a.json('setupGroups(SETUPS).general.map(s=>s.id)'),base=a.json('tripFoundation().id');
    assert.equal(general[0],'t25','in the tab, t25 comes first of the general setups');
    let b=await fresh();
    assert.deepEqual(b.json('setupGroups(SETUPS).general.map(s=>s.id)'),general,`${what}: the general group keeps its order`);
    assert.equal(b.json('tripFoundation().id'),base,`${what}: Plan bags for this trip starts from the same setup`);
    assert.deepEqual(b.json('SETUPS.map(s=>s.id)'),a.json('SETUPS.map(s=>s.id)'),`${what}: and the whole list its order`);
    // then a new setup on top
    assert.equal(await a.run(`saveSetup('Newest','')`),true);
    b=await fresh();
    assert.deepEqual(b.json('SETUPS.map(s=>s.id)'),a.json('SETUPS.map(s=>s.id)'),`${what}: after a new setup too, newest first`);
  }
});

test('[SET-LIMITS] Also delete bag planner data marks its request applied only when every removal reached storage, and the next start applies it again (fix round 2 of PR 80, m-E)',async()=>{
  const base=tab(sharedStore()),id='c'.repeat(32);
  olderPageSaved(base,`Array.from({length:5},(_,i)=>qaSetup('o'+i))`);
  await base.run('SETUPS=[...qaLibrary(),...storedSetupsLocal()];store.set(SETUP_KEY,SETUPS)');
  await later();
  base.values.set('copilot:delete-request:v1',JSON.stringify({app:'copilot',kind:'delete-request',v:1,id,createdAt:new Date().toISOString()}));
  await later();
  await base.run(`(async()=>{await renameSetup('t25','After');await renameSetup('o1','After too');})()`);
  const start=()=>{ const p=tab(sharedStore()); for(const [k,v] of base.values) p.values.set(k,v); return p; };
  const dry=start(),count=failAt(dry,Infinity);
  assert.equal(dry.run('applyDeleteRequest()'),true);
  assert.deepEqual(storedIds(dry.values),['o1','t25']);
  let partial=0;
  for(let n=0;n<count.count;n++){
    const p=start();
    failAt(p,n);
    p.run('applyDeleteRequest()');
    const left=storedIds(p.values),applied=JSON.parse(p.values.get('loadcheck:delete-applied') || 'null');
    if(left.some(x => !['o1','t25'].includes(x))){
      partial++;
      assert.notEqual(applied && applied.id,id,`write ${n+1} of ${count.count} fails: setups saved before the request stay, so it is not marked applied`);
      const again=tab(sharedStore());
      for(const [k,v] of p.values) again.values.set(k,v);
      assert.equal(again.run('applyDeleteRequest()'),true,'the next start applies it');
      assert.deepEqual(storedIds(again.values),['o1','t25'],'and then only what was saved after the request is left');
    }
  }
  assert.ok(partial>0,'a failing write left setups saved before the request: '+partial);
});

test('[SET-LIMITS] a stale older tab that saves a setup loses none of the setups the bag planner added (the frozen copy at /, in the VM; the owner\'s choice of 9 Nov 2026)',async()=>{
  const storage=sharedStore(),old=oldTab(storage);
  for(let i=0;i<18;i++) assert.equal(await old.run(`saveSetup('Old ${i}','')`),true);
  // Then the older tab hears nothing more, as a tab frozen in the background.
  storage.vms.delete(old);
  const b=tab(storage);
  await b.run('SETUPS=storedSetupsLocal();SETUPS.forEach(x=>SETUPS_SEEN.add(x.id));');
  assert.equal(b.json('SETUPS.length'),18);
  await b.run(`SETUPS.unshift(...Array.from({length:12},(_,i)=>qaSetup('n'+i,{forRoute:{hash:'${HASH}',name:'Ride '+i,departureDate:null}})),
    ...Array.from({length:3},(_,i)=>qaSetup('g'+i,{kind:'general'})));store.set(SETUP_KEY,SETUPS)`);
  await b.run(`renameSetup(SETUPS.find(s=>s.name==='Old 0').id,'Renamed here')`);
  const before=storedIds(storage.values);
  assert.equal(before.length,33);
  // The stale tab writes a note on one of its own setups, and saves one more, through its own write.
  assert.equal(await old.run(`(async()=>{SETUPS[1].note='A note from the stale tab';return store.set(SETUP_KEY,SETUPS);})()`),true);
  const savedMore=await old.run(`saveSetup('Old 18','')`);
  b.fireStorage(null,null,null);
  const now=b.json('storedSetupsLocal().map(s=>[s.id,s.name,setupKind(s),!!s.forRoute,s.note])');
  for(const id of before) assert.ok(now.some(x=>x[0]===id),`${id} is lost`);
  assert.equal(savedMore,true,'the stale tab, holding 19, saves one more');
  assert.equal(now.length,34,'every setup, and the stale tab\'s new one');
  assert.deepEqual(now.filter(x=>x[2]==='general').map(x=>x[0]).sort(),['g0','g1','g2'],'the general setups stay general');
  assert.equal(now.filter(x=>x[3]).length,12,'and every trip link stays');
  assert.ok(now.some(x=>x[4]==='A note from the stale tab'),'the stale tab\'s own note stays');
  // What it can still do: revert an edit to a setup in the list it reads (here the rename made in the bag planner).
  assert.equal(now.some(x=>x[1]==='Renamed here'),false,'known: the stale tab wrote its own copy of Old 0 back');
  assert.equal(String((b.nodes.get('tabText') || {}).textContent || '').includes('removed'),false,'nothing was removed, so nothing is named');
});

test('[SET-LIMITS] the page starts with storedSetups(), and the three stored values are read through the store in one place (review of PR 80, m-4)',()=>{
  const init=q.script.slice(q.script.indexOf('/* ==== 95-init.js ==== */'));
  assert.match(init,/SETUPS\s*=\s*await storedSetups\(\)/,'the start-up reads the setups with storedSetups()');
  assert.doesNotMatch(init,/joinSetups\(|SETUP_MORE_KEY|SETUP_MARKS_KEY/,'and nothing else of the start-up reads the three values');
  assert.equal((q.script.match(/store\.get\(SETUP_MORE_KEY\)/g) || []).length,1,'one place reads them through the store');
});

(async()=>{
  for(const [name,fn] of tests){
    try { await fn(); passed++; } catch(e){ console.error('FAIL '+name+'\n'+(e && e.stack || e)); process.exitCode=1; }
  }
  console.log(`setup-kinds: ${passed} of ${tests.length} passed`);
})();
