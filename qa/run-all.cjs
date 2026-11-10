// Runs every qa/*.cjs suite (except the helpers app-vm, plan-kit, paths) in its own process; one line per suite.
// The suites share nothing (no files written, no fixed ports), so up to QA_JOBS of them run side by side (default: the CPUs, at most 4).
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const SKIP=new Set(['app-vm.cjs','plan-kit.cjs','run-all.cjs','paths.cjs']);
const dir=__dirname;
const suites=fs.readdirSync(dir).filter(f=>f.endsWith('.cjs')&&!SKIP.has(f)).sort();
const jobs=Math.max(1,Math.min(Number(process.env.QA_JOBS)||Math.min(4,os.availableParallelism()),suites.length));
let failed=0;
let next=0;
function runOne(suite){
  return new Promise(resolve=>{
    const started=Date.now();
    const child=spawn(process.execPath,[path.join(dir,suite)],{cwd:path.join(dir,'..'),env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
    let out='';
    child.stdout.on('data',d=>{out+=d;});
    child.stderr.on('data',d=>{out+=d;});
    child.on('error',e=>{out+=String(e);});
    child.on('close',status=>{
      const ok=status===0;
      if(!ok)failed++;
      console.log((ok?'PASS ':'FAIL ')+suite+' ('+((Date.now()-started)/1000).toFixed(1)+' s)');
      if(!ok)console.log(out.split('\n').slice(-12).join('\n'));
      resolve();
    });
  });
}
async function worker(){
  while(next<suites.length)await runOne(suites[next++]);
}
Promise.all(Array.from({length:jobs},worker)).then(()=>{
  console.log(failed?failed+' of '+suites.length+' suites failed':'All '+suites.length+' suites passed');
  process.exit(failed?1:0);
});
