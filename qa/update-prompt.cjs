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

(async()=>{
  for(const [name,fn] of tests){
    await fn();
    passed++;
    console.log('ok '+name.slice(0,60));
  }
  console.log(JSON.stringify({suite:'update-prompt',passed}));
})().catch(error=>{console.error(error);process.exitCode=1;});
