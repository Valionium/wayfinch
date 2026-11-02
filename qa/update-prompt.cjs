'use strict';
// The update prompt's rules and the top-tube wording, on the page's own code. Spec 9.1 and 7.1 item 6.
// No browser here; tests/e2e/update-prompt.spec.ts runs the prompt in a real one.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

function wording(mounts){
  const {run,context}=appVM();
  context.qaMounts=mounts;
  run(`fitQuickState=()=>({style:'road',size:'M'});
    readFitFields=()=>({fit:{}});
    bikeFit=()=>({frameBag:{shapes:[{L:5,source:'estimate'}]},cages:{},topMounts:qaMounts});`);
  return run('fitQuickResultText()');
}

test('[LC-WORDING-TOPTUBE] the estimate line with mounts reads as an estimate of room; without mounts it is unchanged; the old words are gone',()=>{
  for(const mounts of [{front:true,rear:false},{front:false,rear:true}]){
    const text=wording(mounts);
    assert.ok(text.includes('Room for a top-tube bag (estimate)'),'with mounts');
    assert.ok(!text.includes('Top-tube bag: probably no room'),'no contradiction');
  }
  assert.ok(wording({front:false,rear:false}).includes('Top-tube bag: probably no room (estimate)'),'without mounts unchanged');
  assert.ok(!appVM().html.toLowerCase().includes('room for one'),'no string "room for one" in the page');
});

// The page's code with a fake browser around it, and a clock the test moves.
function promptPage({save=true}={}){
  const q=appVM(),{run,context}=q;
  const log=[];
  let controllerListener=null,now=Date.UTC(2026,10,10,8);
  const waiting={postMessage(message){log.push('post:'+message.type);},addEventListener(){}};
  const registration={waiting:null,installing:null,addEventListener(){},update(){log.push('update');return Promise.resolve(registration);}};
  context.window.isSecureContext=true;
  context.window.location.reload=()=>log.push('reload');
  context.qaNow=()=>now;
  context.qaWorkers={
    ready:Promise.resolve(registration),
    getRegistration:async()=>registration,
    addEventListener(type,fn){if(type==='controllerchange')controllerListener=fn;},
    removeEventListener(){controllerListener=null;},
  };
  run('navigator.serviceWorker=qaWorkers;Date.now=qaNow;');
  run('DRAFT_READY=true;DRAFT_SIGNATURE=JSON.stringify(captureDraft());DRAFT_READ_KIND="browser";initialiseDraftSaveStatus();');
  if(!save)q.localStorage.setItem=()=>{throw new Error('full');};
  else{const set=q.localStorage.setItem;q.localStorage.setItem=(key,value)=>{if(key==='loadcheck:draft')log.push('saved');set(key,value);};}
  const visible=()=>q.listeners.visibilitychange.at(-1)();
  const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
  return {q,run,log,registration,waiting,visible,settle,moveClock(ms){now+=ms;},fireController(){controllerListener?.();}};
}

test('[LC-UPDATE-HOURLY] looks at load, not at 59 minutes, again at 60',async()=>{
  const p=promptPage();
  p.run('initialiseUpdatePrompt()');await p.settle();
  const count=()=>p.log.filter(x=>x==='update').length;
  assert.equal(count(),1,'at load');
  p.moveClock(59*60000);p.visible();await p.settle();
  assert.equal(count(),1,'at 59 minutes');
  p.moveClock(60000);p.visible();await p.settle();
  assert.equal(count(),2,'at 60 minutes');
  p.moveClock(60000);p.visible();await p.settle();
  assert.equal(count(),2,'and the hour starts again');
});

test('[LC-UPDATE-HOURLY] a hidden tab does not look',async()=>{
  const p=promptPage();
  p.run('initialiseUpdatePrompt()');await p.settle();
  p.moveClock(61*60000);p.q.context.document.hidden=true;p.visible();await p.settle();
  assert.equal(p.log.filter(x=>x==='update').length,1);
});

test('[LC-UPDATE-FLUSH] the pending draft is written first, then the worker told, and the page reloads only on controllerchange',async()=>{
  const p=promptPage();
  p.registration.waiting=p.waiting;
  p.run('initialiseUpdatePrompt()');await p.settle();
  p.log.length=0;
  p.run('S.nights=9;queueDraftSave()');
  await p.run('applyUpdate()');await p.settle();
  assert.deepEqual(p.log,['saved','post:LOADCHECK_ACTIVATE'],'written at once, then sent, and no reload yet');
  p.fireController();
  assert.deepEqual(p.log,['saved','post:LOADCHECK_ACTIVATE','reload']);
  assert.equal(p.run('DRAFT_TIMER'),null,'the 300 ms timer is spent');
});

test('[LC-UPDATE-FLUSH] a failed save says so, sends nothing, and leaves the prompt',async()=>{
  const p=promptPage({save:false});
  p.registration.waiting=p.waiting;
  p.run('initialiseUpdatePrompt()');await p.settle();
  p.run('S.nights=9;queueDraftSave()');
  await p.run('applyUpdate()');await p.settle();
  assert.ok(!p.log.some(x=>x.startsWith('post:')||x==='reload'),'nothing sent');
  assert.ok(/could not be saved/.test(p.run('$("updateNote").textContent')),'says so');
});

test('[LC-UPDATE-FLUSH] a controller change without a tap never reloads',async()=>{
  const p=promptPage();
  p.registration.waiting=p.waiting;
  p.run('initialiseUpdatePrompt()');await p.settle();
  p.fireController();
  assert.ok(!p.log.includes('reload'));
});

test('[LC-UPDATE-PROMPT] the prompt has its one exact wording in the page',()=>{
  const {html}=appVM();
  assert.equal(html.split('Update ready — apply now').length-1,1);
  assert.ok(/id="updateApply"[^>]*>Update ready — apply now<\/button>/.test(html));
});

(async()=>{
  for(const [name,fn] of tests){
    await fn();
    passed++;
    console.log('ok '+name.slice(0,60));
  }
  console.log(JSON.stringify({suite:'update-prompt',passed}));
})().catch(error=>{console.error(error);process.exitCode=1;});
