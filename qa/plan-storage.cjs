/* Run with VS Code's runtime (see the release routine). Design 8.5 (M9, two open tabs) and 15.3. */
const assert=require('node:assert/strict');
const {planKit}=require('./plan-kit.cjs');
const {sharedStore}=require('./app-vm.cjs');
const bag=(uid,pos,L,extra={})=>({uid,pos,L,...extra});
const PLAN={bags:[bag(1,'frame',6),bag(2,'seat',14),bag(3,'bar',12)],kit:['tent','quilt','pad','stove','tool','food','lock'],mode:'comfort',nights:6,sleep:'camp'};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const stored=kit=>{const raw=kit.vm.localStorage.getItem('loadcheck:draft');const d=raw===null?null:JSON.parse(raw);
  return d?{packed:Object.keys(d.packed||{}).sort(),pinned:d.pinned||{},kit:d.kit,updatedAt:d.updatedAt}:null;};
const tabs=async(count)=>{
  const storage=sharedStore(),all=Array.from({length:count},()=>planKit({storage}));
  all[0].setPlan(PLAN);all[0].vm.run('S.step=4;DRAFT_READY=true;DRAFT_READ_KIND="browser";DRAFT_SIGNATURE=null;initialiseDraftSaveStatus();flushDraft();');
  return all;
};
const shared=planKit();
let cases=0;
async function test(name,fn){await fn();cases++;process.stdout.write('PASS '+name+'\n');}

(async()=>{
  await test('[LC-STORE-01] M9 reproduction: a tab shown and hidden does not wipe the ticks and the hand placement',async()=>{
    const [A,B,C]=await tabs(3);
    assert.equal(await B.open(),true,'B opens the saved plan');
    ['tent','quilt','pad'].forEach(id=>A.vm.run(`setPackedItem(${JSON.stringify(id)},true)`));
    A.vm.run("S.pinned.lock='2-0';flushDraft();");
    A.hide();B.show();B.hide();
    const d=stored(A);
    assert.deepEqual(d.packed,['pad','quilt','tent'],'the three ticks survive');
    assert.equal(d.pinned.lock,'2-0','the hand placement survives');
    assert.equal(await C.open(),true);
    assert.deepEqual(JSON.parse(C.vm.run('JSON.stringify(Object.keys(S.packed).sort())')),['pad','quilt','tent'],'a new tab opens with the ticks');
    assert.equal(C.vm.run('S.pinned.lock'),'2-0');
    assert.deepEqual(JSON.parse(B.vm.run('JSON.stringify(Object.keys(S.packed).sort())')),['pad','quilt','tent'],'B adopted A\'s draft');
  });
  await test('[LC-STORE-02] a change in B while A saves: B shows the bar and never writes',async()=>{
    const [A,B]=await tabs(2);
    await B.open();
    B.vm.run('S.kit.stove=false;queueDraftSave();');       // B's unsaved change, inside its 300 ms
    A.vm.run('setPackedItem("tent",true)');                 // A ticks the tent and saves
    assert(/changed in another tab/.test(B.vm.nodes.get('tabText').textContent),'B shows the bar');
    const before=JSON.stringify(stored(A));
    B.vm.run('flushDraft()');B.hide();await sleep(400);     // the 300 ms timer fires too
    assert.equal(JSON.stringify(stored(A)),before,'B never wrote');
    assert.deepEqual(stored(A).packed,['tent']);assert.equal(stored(A).kit.stove,true,'the stove is still selected');
    B.vm.run('S.kit.quilt=false;flushDraft();');
    assert.equal(JSON.stringify(stored(A)),before,'later changes in B are still not written');
    await B.vm.nodes.get('tabLoad').onclick();
    assert.deepEqual(JSON.parse(B.vm.run('JSON.stringify(Object.keys(S.packed))')),['tent'],'Load the newer plan shows A\'s draft in B');
    assert.equal(B.vm.run('S.kit.stove'),true);
  });
  await test('[LC-STORE-03] a new plan in A (draft null): B discards its plan and never writes it back',async()=>{
    const [A,B]=await tabs(2);
    await B.open();
    await A.vm.run('store.set(DRAFT_KEY,null)');
    assert(/cleared in another tab|started in another tab/.test(B.vm.nodes.get('tabText').textContent),'B says so');
    assert.equal(B.vm.run('S.bags.length'),0,'the plan in B is discarded');
    B.vm.run('flushDraft()');B.hide();(B.vm.listeners.pagehide||[]).forEach(cb=>cb());
    assert.equal(stored(A),null,'nothing was written back');
    // a Contract 3 delete removes the key itself
    const [C,D]=await tabs(2);await D.open();
    C.vm.localStorage.removeItem('loadcheck:draft');
    assert.equal(D.vm.run('S.bags.length'),0);D.hide();(D.vm.listeners.pagehide||[]).forEach(cb=>cb());
    assert.equal(stored(C),null);
  });
  await test('[LC-STORE-09] a frozen tab compares versions when shown again and adopts before any write',async()=>{
    const [A,B]=await tabs(2);
    await B.open();
    B.freeze();
    A.vm.run('setPackedItem("tent",true)');A.vm.run('setPackedItem("pad",true)');
    const before=JSON.stringify(stored(A));
    B.thaw();B.show();
    assert.equal(JSON.stringify(stored(A)),before,'B wrote nothing');
    assert.deepEqual(JSON.parse(B.vm.run('JSON.stringify(Object.keys(S.packed).sort())')),['pad','tent'],'B adopted A\'s draft');
    assert(/Updated from another tab/.test(B.vm.nodes.get('tabText').textContent));
    // pageshow from the back-forward cache does the same
    B.freeze();A.vm.run('setPackedItem("quilt",true)');B.thaw();
    (B.vm.listeners.pageshow||[]).forEach(cb=>cb({persisted:true}));
    assert.deepEqual(JSON.parse(B.vm.run('JSON.stringify(Object.keys(S.packed).sort())')),['pad','quilt','tent']);
  });
  await test('every write is strictly newer than the version it replaces, even when the clock has not moved',async()=>{
    const [A]=await tabs(1);
    A.vm.run('Date.now=()=>Date.parse("2031-05-05T10:00:00.000Z")');
    const versions=[];
    for(const id of ['tent','quilt','pad']){A.vm.run(`setPackedItem(${JSON.stringify(id)},true)`);versions.push(Date.parse(stored(A).updatedAt));}
    assert(versions[0]<versions[1]&&versions[1]<versions[2],'strictly increasing: '+versions.join(','));
  });
  // ---- Design 8.1 to 8.4, 8.6: placements in storage ----
  const SIX=['quilt','pad','tent','rain','puffy','base1','bibs','socks','camp','cap','underwear','shades','stove','pot','spork','food','snacks','tool','tubes','pump','levers','link','chaintl','hanger','patch','boot','lock','bank','phone','cables','headlamp','firstaid','wash','towel','teeth','wipes','docs','cash'];
  const PANNIER=[bag(1,'frame',6),bag(2,'rack',15,{pair:true})];
  const SAVE='S.step=4;DRAFT_READY=true;DRAFT_READ_KIND="browser";DRAFT_SIGNATURE=null;initialiseDraftSaveStatus();flushDraft();';
  const J=(kit,code)=>JSON.parse(kit.vm.run('JSON.stringify('+code+')')??'null');
  const placements=kit=>kit.vm.run('(currentPlan(),JSON.stringify(S.placements))');
  const rawDraft=kit=>kit.vm.localStorage.getItem('loadcheck:draft');
  // A saved plan, opened by a new tab.
  const reopen=async(input,edit)=>{
    const storage=sharedStore(),A=planKit({storage}).setPlan(input);
    A.vm.run('currentPlan();');if(edit)A.vm.run(edit+';currentPlan();');
    A.vm.run(SAVE);
    const B=planKit({storage});assert.equal(await B.open(),true);
    return {A,B,storage};
  };
  // The page before sub-project 1 saved no placements and no carried.
  const oldDraft=async(input,edit)=>{
    const storage=sharedStore(),A=planKit({storage}).setPlan(input);
    A.vm.run('currentPlan();');if(edit)A.vm.run(edit+';currentPlan();');
    A.vm.run(SAVE);
    const d=JSON.parse(A.vm.localStorage.getItem('loadcheck:draft'));delete d.placements;delete d.carried;
    A.vm.localStorage.setItem('loadcheck:draft',JSON.stringify(d));
    return {A,d,storage};
  };
  const MIG={bags:[bag(1,'frame',6),bag(2,'seat',14),bag(3,'pack',20),bag(4,'rack',15,{pair:true})],kit:SIX,mode:'light',nights:6,sleep:'camp'};

  await test('[LC-KEEP-09] reload after a kept change: byte-identical placements; a fresh plan would move 11 items',async()=>{
    const {A,B}=await reopen({bags:PANNIER,kit:SIX,mode:'comfort',nights:6,sleep:'camp'},'S.kit.liner=true');
    assert.equal(placements(B),placements(A));
    assert.equal(J(B,'currentPlan().notes.replan'),null);
    assert.equal(J(B,'planDiff(currentPlan(),planWith({placements:null})).moved.length'),11);
  });
  await test('[LC-STORE-04] migration: a draft opens afresh, the lock stays, the note shows, nothing written; a second load is identical; the first change writes placements',async()=>{
    const {A,d,storage}=await oldDraft(MIG,"S.pinned.lock='2-0'");
    const before=A.vm.localStorage.getItem('loadcheck:draft');
    const B=planKit({storage});assert.equal(await B.open(),true);
    assert.deepEqual(J(B,'currentPlan().items.lock').map(e=>e[0]),['2-0'],'the lock stays in the seat pack');
    assert.equal(J(B,'currentPlan().notes.replan').reason,'migrated');
    B.hide();
    assert.equal(B.vm.localStorage.getItem('loadcheck:draft'),before,'nothing is written at load');
    const C=planKit({storage});await C.open();
    assert.equal(placements(C),placements(B),'a second load is identical');
    C.vm.run('S.kit.warmers=true;flushDraft();');
    const after=JSON.parse(C.vm.localStorage.getItem('loadcheck:draft'));
    assert.equal(after.placements.v,1,'the first change writes placements');
    assert.equal(J(C,'currentPlan().notes.replan'),null,'the note goes with the first save');
    assert(d&&!d.placements);
  });
  await test('[LC-STORE-04] migration: a saved setup and an export open the same way',async()=>{
    const {A,d}=await oldDraft(MIG,"S.pinned.lock='2-0'");
    const setup={...JSON.parse(JSON.stringify(d))};
    const B=planKit();
    B.vm.run('renderBikeProfiles=()=>{};renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};syncGPXControl=()=>{};');
    assert.equal(B.vm.run('restorePlan('+JSON.stringify(setup)+',false)'),true);
    assert.deepEqual(J(B,'currentPlan().items.lock').map(e=>e[0]),['2-0']);
    assert.equal(J(B,'currentPlan().notes.replan').reason,'migrated');
    assert.deepEqual(J(B,'currentPlan().items'),J(A,'planWith({placements:null}).items'),'a fresh plan, with the hand placement honoured');
  });
  await test('[LC-STORE-05] validation: a bad entry drops only its item; a wrong v places afresh; unknown fields drop',async()=>{
    const input={bags:PANNIER,kit:SIX,mode:'comfort',nights:6,sleep:'camp'};
    const {A}=await reopen(input,'S.kit.liner=true');
    const good=JSON.parse(placements(A));
    const load=async mutate=>{
      const p=JSON.parse(JSON.stringify(good));mutate(p);
      const d=JSON.parse(rawDraft(A));d.placements=p;
      const n=A.vm.run('JSON.stringify(normalisePlan('+JSON.stringify(d)+').placements)');
      return n===undefined?null:JSON.parse(n);
    };
    let n=await load(p=>{p.items.wash=[['9-0',1,.7]];});
    assert.equal(n.items.wash,undefined,'a unit not in inUse');assert.deepEqual(n.items.tent,good.items.tent);
    n=await load(p=>{p.items.wash=[[p.inUse[0],12,.7]];});assert.equal(n.items.wash,undefined,'12 pieces');assert(n.items.tent);
    n=await load(p=>{p.items.wash=[[p.inUse[0],1,300]];});assert.equal(n.items.wash,undefined,'300 L');assert(n.items.tent);
    n=await load(p=>{p.items.nosuchitem=[[p.inUse[0],1,1]];});assert.equal(n.items.nosuchitem,undefined,'an unknown item');assert(n.items.tent);
    n=await load(p=>{p.v=2;});assert.equal(n,null,'a wrong v');
    n=await load(p=>{p.basis.mode='nope';});assert.equal(n,null,'a bad basis voids the field');
    n=await load(p=>{p.basis.units[0][3]=900;});assert.equal(n,null,'litres out of range void the field');
    n=await load(p=>{p.basis.units=Array(65).fill(p.basis.units[0]);});assert.equal(n,null,'too many units');
    n=await load(p=>{p.inUse=[...p.inUse,'9-0'];});assert.equal(n,null,'an inUse key that does not exist');
    n=await load(p=>{p.extra=1;p.basis.extra=1;});assert.equal(n.extra,undefined);assert.equal(n.basis.extra,undefined);
    assert.equal(JSON.stringify(n),JSON.stringify(good),'canonical bytes survive');
    // the bad item is then placed afresh, the others stay
    const d=JSON.parse(rawDraft(A));d.placements=JSON.parse(JSON.stringify(good));d.placements.items.wash=[['9-0',1,.7]];
    const B=planKit();B.vm.run('renderBikeProfiles=()=>{};renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};syncGPXControl=()=>{};');
    B.vm.run('restorePlan('+JSON.stringify(d)+',false)');
    const after=J(B,'currentPlan().items');assert(after.wash&&after.wash.length);
    Object.keys(good.items).filter(id=>id!=='wash').forEach(id=>assert.deepEqual(after[id],good.items[id],id));
  });
  await test('[LC-STORE-06] canonical bytes: tick and untick the long gloves; draftBrowserMatches holds',async()=>{
    const {A}=await reopen({bags:PANNIER,kit:SIX,mode:'comfort',nights:6,sleep:'camp'});
    const first=placements(A);
    A.vm.run('S.kit.gloves=true;currentPlan();S.kit.gloves=false;currentPlan();');
    assert.equal(placements(A),first);
    A.vm.run('flushDraft();');
    assert.equal(A.vm.run('draftBrowserMatches(JSON.stringify(captureDraft()))'),true);
  });
  await test('[LC-STORE-07] a setup saved at factor 0.88, reopened at 0.85: placed afresh, with the note',async()=>{
    const A=planKit().setPlan({bags:PANNIER,kit:SIX,mode:'comfort',nights:6,sleep:'camp'});
    A.vm.run('renderBikeProfiles=()=>{};renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};syncGPXControl=()=>{};buildThumb=()=>"";currentPlan();');
    const setup=A.vm.run('JSON.stringify(snapshotSetup("QA",""))');
    assert(JSON.parse(setup).placements,'a setup stores its placements');
    A.vm.run('S.packEff=.85;restorePlan('+setup+',false);');
    assert.equal(J(A,'S.packEff'),.85,'the factor stays a device setting');
    assert.equal(J(A,'currentPlan().notes.replan').reason,'bags');
    // the same factor restores the kept plan
    const B=planKit().setPlan({bags:PANNIER,kit:SIX,mode:'comfort',nights:6,sleep:'camp'});
    B.vm.run('renderBikeProfiles=()=>{};renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};syncGPXControl=()=>{};restorePlan('+setup+',false);');
    assert.equal(J(B,'currentPlan().notes.replan'),null);assert.equal(placements(B),JSON.stringify(JSON.parse(setup).placements));
  });
  await test('[LC-STORE-08] an older page drops placements and carried: placed afresh once, keeping hand placements and ticks, and it says why',async()=>{
    const [A,B]=await tabs(2);
    A.vm.run("S.pinned.lock='2-0';S.packed.tent=true;flushDraft();");
    await B.open();
    assert.equal(J(B,'currentPlan().notes.replan'),null);
    const d=JSON.parse(rawDraft(A));delete d.placements;delete d.carried;d.packed.pad=true;d.updatedAt=new Date(Date.parse(d.updatedAt)+5).toISOString();
    A.vm.localStorage.setItem('loadcheck:draft',JSON.stringify(d));   // the older page's save reaches B as a storage event
    assert.equal(J(B,'currentPlan().notes.replan').reason,'migrated');
    assert.deepEqual(J(B,'currentPlan().items.lock').map(e=>e[0]),['2-0']);
    assert.deepEqual(J(B,'Object.keys(S.packed).sort()'),['pad','tent']);
  });
  await test('[LC-STORE-10] a placement entry for a deleted custom item drops only itself',async()=>{
    const A=planKit().setPlan({bags:PANNIER,kit:SIX,mode:'comfort',nights:6,sleep:'camp'});
    A.vm.run("renderBikeProfiles=()=>{};renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};syncGPXControl=()=>{};KIT.push({id:'x_cam',name:'Camera',cat:KIT[0].cat,L:1,kg:.5,rigid:0,pref:['bar'],qtyable:true,added:true,on:false});S.kit.x_cam=true;currentPlan();");
    const saved=JSON.parse(A.vm.run('JSON.stringify(capturePlan())'));
    assert(saved.placements.items.x_cam,'the custom item was placed');
    const d=JSON.parse(JSON.stringify(saved));d.addedKit=[];delete d.kit.x_cam;
    const n=JSON.parse(A.vm.run('JSON.stringify(normalisePlan('+JSON.stringify(d)+').placements)'));
    assert.equal(n.items.x_cam,undefined);
    Object.keys(saved.placements.items).filter(id=>id!=='x_cam').forEach(id=>assert.deepEqual(n.items[id],saved.placements.items[id],id));
  });
  await test('[LC-STORE-11] a quota error on a draft with placements: the plan in memory stays, and the page does not claim it saved',async()=>{
    const A=planKit().setPlan({bags:PANNIER,kit:SIX,mode:'comfort',nights:6,sleep:'camp'});
    A.vm.run('currentPlan();DRAFT_READY=true;DRAFT_READ_KIND="browser";DRAFT_SIGNATURE=null;initialiseDraftSaveStatus();');
    const before=placements(A);
    A.vm.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
    A.vm.run('S.kit.earplugs=true;flushDraft();');
    assert.equal(J(A,'S.placements.items.tent')!==null,true);
    assert.equal(J(A,'!!S.placements.items.earplugs'),true,'the change is in the plan in memory');
    assert.deepEqual(JSON.parse(before).inUse,J(A,'S.placements.inUse'));
    const note=A.vm.run('draftSaveNote()');
    assert(!/are saved/.test(note),'does not claim it saved: '+note);assert(/This session only/.test(note));
  });
  await test('[LC-STORE-12] no bags: placements null, and a round trip stays null',async()=>{
    const {A,B}=await reopen({bags:[],kit:SIX,mode:'comfort',nights:6,sleep:'camp'});
    assert.equal(placements(A),'null');assert.equal(JSON.parse(rawDraft(A)).placements,null);
    assert.equal(placements(B),'null');assert.equal(J(B,'currentPlan().notes.replan'),null,'nothing to say about a plan without bags');
  });
  await test('[carried] Lightweight never leaves an always-carried item at home; only kit ids set to true survive a load',async()=>{
    const A=planKit().setPlan({bags:PANNIER,kit:['towel','tool'],mode:'light',nights:1,sleep:'indoor'});
    assert.equal(J(A,'!!currentPlan().items.towel'),false,'left at home');
    A.vm.run('S.carried={towel:true};');
    assert.equal(J(A,'!!currentPlan().items.towel'),true,'honoured');
    const saved=JSON.parse(A.vm.run('JSON.stringify(capturePlan())'));
    assert.deepEqual(saved.carried,{towel:true});
    saved.carried={towel:true,tool:'yes',nosuch:true};
    assert.deepEqual(JSON.parse(A.vm.run('JSON.stringify(normalisePlan('+JSON.stringify(saved)+').carried)')),{towel:true});
  });
  await test('[15.5] order and reload: shuffling bags changes nothing, and a round trip through storage changes nothing',async()=>{
    let seed=31337;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const pick=a=>a[Math.floor(rand()*a.length)];
    const POS=['top','frame','fork','bar','seat','rack','pack'];
    for(let i=0;i<300;i++){
      const bags=[];let uid=1;
      POS.forEach(pos=>{if(rand()<(pos==='frame'?.9:.5)){const b=bag(uid++,pos,{top:1,frame:pick([3,4.5,6]),fork:pick([2,3,4]),bar:pick([8,12,15]),seat:pick([8,10,14]),rack:pick([12,15,20]),pack:pick([10,20])}[pos]);
        if(pos==='fork'||pos==='rack')b.pair=rand()<.8;if(pos==='top')b.slot='front';bags.push(b);}});
      const input={bags,mode:pick(['comfort','light']),nights:pick([0,1,3,6]),sleep:pick(['camp','mixed','indoor']),kit:SIX.filter(()=>rand()<.7)};
      const A=shared.setPlan(input),a=placements(A);
      const B=shared.setPlan({...input,bags:bags.slice().reverse()});
      assert.equal(placements(B),a,'order, plan '+i);
      const saved=JSON.parse(A.vm.run('JSON.stringify(capturePlan())'));
      const n=A.vm.run('JSON.stringify(normalisePlan('+JSON.stringify(saved)+').placements)')??'null';
      assert.equal(n,a,'round trip, plan '+i);
      if(i%3===0){A.vm.run('S.placements='+n+';S.kit.earplugs=true;currentPlan();S.kit.earplugs=false;currentPlan();');}
    }
  });
  console.log(JSON.stringify({status:'passed',cases}));
})().catch(error=>{console.error(error);process.exitCode=1;});
