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
  assert.equal(JSON.parse(q.values.get('loadcheck:setups')).find(s=>s.id==='t_a').kind,'general','stored at once');
  assert.match(json('SAVE_MESSAGE'),/general setup/);
  assert.equal(await run(`setSetupKind('t_a','trip')`),true);
  const stored=JSON.parse(q.values.get('loadcheck:setups')).find(s=>s.id==='t_a');
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

test('[SET-LIMITS] past 20 setups, the list older pages read holds 20, the general ones first; the rest and every setup\'s marks are kept where older pages never look; read together they are the one list (review of PR 80, I1)',async()=>{
  const storage=sharedStore(),a=tab(storage);
  assert.equal(await a.run('SETUPS=qaLibrary();store.set(SETUP_KEY,SETUPS)'),true);
  const main=JSON.parse(storage.values.get('loadcheck:setups')),more=JSON.parse(storage.values.get('loadcheck:setups-more:v1'));
  assert.equal(main.length,20,'an older page sees 20, so its own cut to 20 cuts nothing');
  assert.deepEqual(main.slice(0,3).map(s=>s.id),['g0','g1','g2'],'the general setups first, so a rollback keeps them in view');
  assert.deepEqual(main.slice(3).map(s=>s.id),Array.from({length:17},(_,i)=>'t'+i),'then the trip setups in the list\'s order');
  assert.deepEqual(more.map(s=>s.id),Array.from({length:13},(_,i)=>'t'+(17+i)));
  // An older page writes its 20 back through its own normaliseSetup: the new fields go; it renamed one and deleted another.
  const old=main.map(strip).filter(s=>s.id!=='t2').map(s=>s.id==='g2' ? {...s,name:'Renamed in an old tab'} : s);
  storage.values.set('loadcheck:setups',JSON.stringify(old));
  const b=tab(sharedStore());
  for(const [k,v] of storage.values) b.values.set(k,v);
  const read=await b.run('storedSetups()');
  const ids=b.json('storedSetupsLocal().map(s=>s.id)');
  assert.equal(ids.length,32,'nothing cut: 33 less the one the old tab deleted');
  assert.equal(ids.includes('t2'),false,'the old tab\'s delete stays');
  assert.equal(read.length,32);
  const back=b.json(`storedSetupsLocal().map(s=>[s.id,setupKind(s),!!s.forRoute,s.base||null,s.isDefault||false,s.name])`);
  assert.deepEqual(back.filter(x=>x[1]==='general').map(x=>x[0]),['g0','g1','g2'],'the general marks are back');
  assert.equal(back.filter(x=>x[0].startsWith('t') && x[2]).length,29,'and every trip link');
  assert.deepEqual(back.find(x=>x[0]==='t5').slice(3,4),['g1']);
  assert.equal(back.find(x=>x[0]==='g1')[4],true);
  assert.equal(back.find(x=>x[0]==='g2')[5],'Renamed in an old tab','the old tab\'s own change stays');
  // with 20 or fewer, everything stays in the one list in its own order, and plain setups need nothing else
  const c=tab(sharedStore());
  await c.run(`SETUPS=Array.from({length:5},(_,i)=>qaSetup('p'+i));store.set(SETUP_KEY,SETUPS)`);
  assert.deepEqual([...c.values.keys()].filter(k=>k.startsWith('loadcheck:setup')).sort(),['loadcheck:setups']);
  assert.deepEqual(JSON.parse(c.values.get('loadcheck:setups')).map(s=>s.id),['p0','p1','p2','p3','p4']);
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
  // deleting down to 20 or fewer brings them all back to the one list
  await a.run(`(async()=>{for(const s of SETUPS.slice(0,14)) await deleteSetup(s.id);})()`);
  assert.equal(a.json('SETUPS.length'),20);
  assert.equal(JSON.parse(storage.values.get('loadcheck:setups')).length,20);
  assert.deepEqual(JSON.parse(storage.values.get('loadcheck:setups-more:v1') || '[]'),[]);
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

(async()=>{
  for(const [name,fn] of tests){
    try { await fn(); passed++; } catch(e){ console.error('FAIL '+name+'\n'+(e && e.stack || e)); process.exitCode=1; }
  }
  console.log(`setup-kinds: ${passed} of ${tests.length} passed`);
})();
