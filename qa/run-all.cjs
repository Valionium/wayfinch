// Runs every qa/*.cjs suite (except the helpers app-vm, plan-kit, paths) in its own process; one line per suite.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const SKIP=new Set(['app-vm.cjs','plan-kit.cjs','run-all.cjs','paths.cjs']);
const dir=__dirname;
const suites=fs.readdirSync(dir).filter(f=>f.endsWith('.cjs')&&!SKIP.has(f)).sort();
let failed=0;
for(const suite of suites){
  const started=Date.now();
  const run=spawnSync(process.execPath,[path.join(dir,suite)],{cwd:path.join(dir,'..'),env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},encoding:'utf8'});
  const ok=run.status===0;
  if(!ok)failed++;
  console.log((ok?'PASS ':'FAIL ')+suite+' ('+((Date.now()-started)/1000).toFixed(1)+' s)');
  if(!ok)console.log(((run.stdout||'')+(run.stderr||'')).split('\n').slice(-12).join('\n'));
}
console.log(failed?failed+' of '+suites.length+' suites failed':'All '+suites.length+' suites passed');
process.exit(failed?1:0);
