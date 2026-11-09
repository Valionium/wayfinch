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

(async()=>{
  for(const [name,fn] of tests){
    try { await fn(); passed++; } catch(e){ console.error('FAIL '+name+'\n'+(e && e.stack || e)); process.exitCode=1; }
  }
  console.log(`setup-kinds: ${passed} of ${tests.length} passed`);
})();
