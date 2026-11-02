const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {appVM}=require('./app-vm.cjs');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const marker='<meta name="loadcheck-offline-shell" content="1">';
function workerVM(){
  const handlers={},cacheData=new Map(),calls=[];
  let failNetwork=false,failCache=false,mime='text/html',body=marker,claim=0,skip=0;
  const caches={async open(name){if(!cacheData.has(name))cacheData.set(name,new Map());const data=cacheData.get(name);return {
    async put(key,response){if(failCache)throw Error('Cache quota');data.set(key,response.clone());},
    async match(key){return data.get(key)?.clone();}};},async keys(){return [...cacheData.keys()];},async delete(key){return cacheData.delete(key);}};
  const context=vm.createContext({URL,Response,AbortController,setTimeout,clearTimeout,caches,
    self:{location:{href:'https://example.test/offline-worker.js'},addEventListener:(key,fn)=>handlers[key]=fn,clients:{async claim(){claim++;}},async skipWaiting(){skip++;}},
    async fetch(request,options){calls.push({url:typeof request==='string'?request:request.url,options});if(failNetwork)throw Error('Offline');return new Response(body,{headers:{'content-type':mime}});}});
  vm.runInContext(fs.readFileSync(require('./paths.cjs').worker,'utf8'),context);
  const dispatch=async(type,event={})=>{let work;handlers[type]({...event,waitUntil:p=>work=p,respondWith:p=>work=p});return work===undefined?undefined:await work;};
  return {dispatch,cacheData,calls,caches,setNetwork:v=>failNetwork=v,setCache:v=>failCache=v,setResponse:(b,m='text/html')=>{body=b;mime=m;},claim:()=>claim,skip:()=>skip};
}
(async()=>{
  const w=workerVM();await w.dispatch('install');
  check(w.cacheData.get('loadcheck-offline-v1').has('https://example.test/index.html'),'install caches the validated canonical app');
  check(w.calls[0].options.cache==='no-cache','offline preparation fetches a current document');
  await w.caches.open('loadcheck-offline-old');await w.caches.open('unrelated-app');
  await w.dispatch('activate');
  check(!w.cacheData.has('loadcheck-offline-old') && w.cacheData.has('unrelated-app') && w.claim()===1,'activation only removes its own old caches');
  const nav=(url='https://example.test/',method='GET',mode='navigate')=>({request:{url,method,mode}});
  w.setNetwork(true);
  let response=await w.dispatch('fetch',nav());
  check(response.status===200 && (await response.text()).includes(marker),'offline root navigation opens cached app');
  response=await w.dispatch('fetch',nav('https://example.test/index.html?bookmark=1'));
  check(response.status===200,'offline index navigation supports harmless URL parameters');
  for(const event of [nav('https://other.test/'),nav('https://example.test/report','POST'),nav('https://example.test/','POST'),nav('https://example.test/tile.png'),nav('https://example.test/','GET','cors')]){
    const before=w.calls.length;check(await w.dispatch('fetch',event)===undefined && w.calls.length===before,'worker ignores other origins, POSTs and non-app requests');
  }
  const empty=workerVM();empty.setNetwork(true);response=await empty.dispatch('fetch',nav());
  check(response.status===503 && (await response.text()).includes('not saved'),'uncached offline visit explains how to prepare');
  const invalid=workerVM();invalid.setResponse('<html>A different website</html>');
  await assert.rejects(invalid.dispatch('install'));checks++;
  invalid.setResponse(marker,'application/json');await assert.rejects(invalid.dispatch('install'));checks++;
  w.setNetwork(false);w.setCache(true);response=await w.dispatch('fetch',nav());
  check(response.status===200,'cache quota cannot block an online visit');
  let answer;await w.dispatch('message',{source:{url:'https://example.test/'},data:{type:'LOADCHECK_SAVE_APP'},ports:[{postMessage:value=>answer=value}]});
  check(answer.ok===false && answer.cached===false,'cache save errors do not claim offline readiness');
  w.setCache(false);answer=null;
  await w.dispatch('message',{source:{url:'https://example.test/'},data:{type:'LOADCHECK_OFFLINE_INFO'},ports:[{postMessage:value=>answer=value}]});
  check(answer.ok===true && answer.cached===true,'existing saved shell is reported');
  const calls=w.calls.length;answer=null;
  await w.dispatch('message',{source:{url:'https://hostile.test/'},data:{type:'LOADCHECK_SAVE_APP'},ports:[{postMessage:value=>answer=value}]});
  check(answer===null && w.calls.length===calls,'cross-origin messages cannot trigger requests');
  await w.dispatch('message',{source:{url:'https://example.test/'},data:{type:'LOADCHECK_ACTIVATE'}});
  check(w.skip()===1,'explicit activation completes waiting installation');
  check(w.calls.every(c=>c.options.credentials==='same-origin' && !c.options.method),'worker never sends reports or external POSTs');
  const q=appVM(),{run}=q;
  run('DRAFT_READY=true;DRAFT_SIGNATURE=JSON.stringify(captureDraft());DRAFT_READ_KIND="browser";initialiseDraftSaveStatus();');
  check(run('offlineCurrentPlanSaved()'),'offline readiness accepts a matching durable browser draft');
  run('S.nights=10');check(!run('offlineCurrentPlanSaved()'),'changed unsaved plan cannot be called ready');
  await run('flushDraft()');check(run('offlineCurrentPlanSaved()'),'flushing the current plan restores readiness');
  run('DRAFT_SAVE_STATUS.kind="host"');check(!run('offlineCurrentPlanSaved()'),'account-only storage does not promise phone offline recovery');
  run('DRAFT_SAVE_STATUS.kind="browser";DRAFT_SAVE_STATUS.state="failed"');check(!run('offlineCurrentPlanSaved()'),'failed storage cannot claim offline readiness');
  console.log(JSON.stringify({suite:'offline',checks,liveNetworkRequests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
