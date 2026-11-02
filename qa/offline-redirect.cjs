'use strict';
// Offline copies on hosts that redirect /index.html to / (Cloudflare answers 307 -> /).
// Browsers turn a redirected response to a page load into a network error, so an
// offline reopen must never be answered with one. Regression for the 29 Oct 2026
// review (platform-1). Uses a loopback server; no request leaves this computer.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),vm=require('node:vm');
const marker='<meta name="loadcheck-offline-shell" content="1">';
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};

function redirectingHost(){
  const server=http.createServer((req,res)=>{
    const pathname=req.url.split('?')[0];
    if(pathname==='/index.html'){res.writeHead(307,{Location:'/'});return res.end();}
    if(pathname==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(`<!doctype html>${marker}<title>Load Check</title>`);}
    res.writeHead(404);res.end();
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}
function sharedCaches(){
  const cacheData=new Map();
  return {async open(name){if(!cacheData.has(name))cacheData.set(name,new Map());const data=cacheData.get(name);return {
    async put(key,response){data.set(String(key),response.clone());},
    async match(key){return data.get(String(key))?.clone();}};},async keys(){return [...cacheData.keys()];},async delete(key){return cacheData.delete(key);}};
}
function workerVM(origin,{file=require('./paths.cjs').worker,caches=sharedCaches()}={}){
  const handlers={};
  let offline=false;
  const context=vm.createContext({URL,Response,AbortController,setTimeout,clearTimeout,caches,
    self:{location:{href:`${origin}/offline-worker.js`},addEventListener:(type,fn)=>handlers[type]=fn,clients:{async claim(){}},async skipWaiting(){}},
    async fetch(request,options){if(offline)throw new TypeError('Failed to fetch');return fetch(typeof request==='string'?request:request.url,options);}});
  vm.runInContext(fs.readFileSync(file,'utf8'),context);
  const dispatch=async(type,event={})=>{let work;handlers[type]({...event,waitUntil:p=>work=p,respondWith:p=>work=p});return work===undefined?undefined:await work;};
  return {dispatch,caches,setOffline:v=>offline=v};
}
const navigation=url=>({request:{url,method:'GET',mode:'navigate'}});

(async()=>{
  const server=await redirectingHost(),origin=`http://127.0.0.1:${server.address().port}`;
  try{
    // A rider prepares the app offline, then reopens it in airplane mode.
    const prepared=workerVM(origin);
    await prepared.dispatch('install');
    prepared.setOffline(true);
    let response=await prepared.dispatch('fetch',navigation(`${origin}/`));
    check(response.status===200 && (await response.clone().text()).includes(marker),'offline reopen returns the saved app');
    check(response.redirected===false,'offline reopen is not answered with a redirected response');

    // A phone still holds a redirected copy saved by the previous worker version.
    const updated=workerVM(origin),oldCopy=await fetch(`${origin}/index.html`);
    assert.equal(oldCopy.redirected,true,'fixture host must redirect /index.html');
    await (await updated.caches.open('loadcheck-offline-v1')).put(`${origin}/index.html`,oldCopy);
    updated.setOffline(true);
    response=await updated.dispatch('fetch',navigation(`${origin}/`));
    check(response.status===200 && (await response.clone().text()).includes(marker),'an existing saved copy still opens offline');
    check(response.redirected===false,'an existing redirected copy is served as a plain page');

    // Update window: the new worker installs while the previous release is still
    // active, and both use one cache. The previous worker serves entries as stored.
    const cache=sharedCaches();
    const previous=workerVM(origin,{file:path.join(__dirname,'fixtures','offline-worker-previous.js'),caches:cache});
    await previous.dispatch('fetch',navigation(`${origin}/`)); // online visit saves a plain copy
    await workerVM(origin,{caches:cache}).dispatch('install');
    previous.setOffline(true);
    response=await previous.dispatch('fetch',navigation(`${origin}/`));
    check(response.status===200 && (await response.clone().text()).includes(marker),'the previous worker still opens the app offline during an update');
    check(response.redirected===false,'an update never stores a redirected copy for the previous worker to serve');
  }finally{server.close();}
  console.log(JSON.stringify({suite:'offline-redirect',checks,network:'loopback only'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
