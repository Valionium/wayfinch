/* Test fixture: the offline worker as released before the 29 Oct 2026 hotfix
 (SHA-256 EFBAF73E...965E, 3,827 bytes). qa/offline-redirect.cjs runs it next to the
 current worker to check the update window, when both share one cache. */
/* Load Check: cache only the public app document. Plans and packed ticks stay
   in the page's browser storage. No external services or report requests are
   intercepted, cached or sent by this worker. */
'use strict';
const OFFLINE_CACHE_PREFIX='loadcheck-offline-';
const OFFLINE_CACHE_NAME=OFFLINE_CACHE_PREFIX+'v1';
const OFFLINE_BASE=new URL('./',self.location.href);
const OFFLINE_APP=new URL('index.html',OFFLINE_BASE).href;
const OFFLINE_PATHS=new Set([OFFLINE_BASE.pathname,new URL(OFFLINE_APP).pathname]);
const OFFLINE_MARKER='<meta name="loadcheck-offline-shell" content="1">';

async function checkedAppResponse(response){
  if(!response || !response.ok || response.type==='opaque' ||
     !(response.headers.get('content-type') || '').toLowerCase().includes('text/html'))
    throw new Error('The app document was not available.');
  if(response.url){const url=new URL(response.url);if(url.origin!==OFFLINE_BASE.origin || !OFFLINE_PATHS.has(url.pathname))throw new Error('Unexpected app response.');}
  const text=await response.clone().text();
  if(!text.includes(OFFLINE_MARKER))throw new Error('This is not the offline-enabled app.');
  return response;
}
async function fetchApp(request=OFFLINE_APP,timeoutMs=8000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await checkedAppResponse(await fetch(request,{cache:'no-cache',credentials:'same-origin',signal:controller.signal}));}
  finally{clearTimeout(timer);}
}
async function saveApp(){
  const response=await fetchApp(),cache=await caches.open(OFFLINE_CACHE_NAME);
  await cache.put(OFFLINE_APP,response.clone());
  return {cached:true,version:1};
}
async function offlineInfo(){
  const cache=await caches.open(OFFLINE_CACHE_NAME),response=await cache.match(OFFLINE_APP);
  return {cached:!!response,version:1};
}
self.addEventListener('install',event=>event.waitUntil(saveApp()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(OFFLINE_CACHE_PREFIX) && key!==OFFLINE_CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET' || request.mode!=='navigate' || url.origin!==OFFLINE_BASE.origin || !OFFLINE_PATHS.has(url.pathname))return;
  event.respondWith((async()=>{
    try{
      const response=await fetchApp(request,4000);
      // A failed cache write must not prevent an online visit.
      try{await (await caches.open(OFFLINE_CACHE_NAME)).put(OFFLINE_APP,response.clone());}catch(error){}
      return response;
    }catch(error){
      try{
        const cache=await caches.open(OFFLINE_CACHE_NAME),saved=await cache.match(OFFLINE_APP);
        if(saved)return saved;
      }catch(cacheError){}
      return new Response('Load Check is not saved on this device yet. Connect to the internet, open the app and choose Make available offline in the packing checklist.',
        {status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
self.addEventListener('message',event=>{
  if(!event.source?.url)return;
  const source=new URL(event.source.url);
  if(source.origin!==OFFLINE_BASE.origin || !OFFLINE_PATHS.has(source.pathname))return;
  const type=event.data?.type,port=event.ports?.[0];
  if(type==='LOADCHECK_ACTIVATE'){event.waitUntil(self.skipWaiting());return;}
  if(!port || !['LOADCHECK_OFFLINE_INFO','LOADCHECK_SAVE_APP'].includes(type))return;
  event.waitUntil((async()=>{
    try{const info=await(type==='LOADCHECK_SAVE_APP'?saveApp():offlineInfo());port.postMessage({ok:true,...info});}
    catch(error){port.postMessage({ok:false,cached:false});}
  })());
});
