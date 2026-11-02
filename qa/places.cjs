'use strict';
// Source-level place-search checks. Optional --live uses only public sample names.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('./paths.cjs').page,'utf8');
const start=html.indexOf("const PHOTON_URL ="),end=html.indexOf('/* ---- what that month is normally like there ---- */',start);
assert(start>=0 && end>start,'Missing geographic search fallback');
const source="const GEO_URL='https://geocoding-api.open-meteo.com/v1/search';\n"+html.slice(start,end);
function searchVM(reply){
  const requests=[];
  const context=vm.createContext({URL,Date,DOMException,console,fetchJson:async(url,timeout,signal)=>{
    const u=new URL(url);requests.push(u);assert.equal(timeout,8000);return reply(u,signal);
  }});
  vm.runInContext(source,context);
  return {context,requests,run:code=>vm.runInContext(code,context),search:(q,signal)=>context.geoSearch(q,signal)};
}
const lake={type:'Feature',properties:{name:'Lake Garda',osm_key:'water',osm_value:'lake',osm_type:'R',osm_id:8569,state:'Lombardy',country:'Italy',countrycode:'IT'},geometry:{type:'Point',coordinates:[10.6861569,45.6624314]}};
const town={id:2907911,name:'Heidelberg',latitude:49.40768,longitude:8.69079,elevation:116,feature_code:'PPLA3',admin1:'Baden-Wurttemberg',country:'Germany',country_code:'DE'};
let checks=0;
function check(fn){fn();checks++;}
async function audit(){
  let app=searchVM(()=>({features:[lake]}));
  for(const q of ['Lake Garda','Lago di Garda','Gardasee']){
    const hits=await app.search(q);check(()=>{assert.equal(hits[0].name,'Lake Garda');assert.equal(hits[0].country,'IT');assert.equal(hits[0].lat,45.6624314);assert.equal(hits[0].elev,null);assert.match(hits[0].where,/Lake.*Italy.*general area/);});
  }
  check(()=>{assert.equal(app.requests.length,3);assert.ok(app.requests.every(u=>u.hostname==='photon.komoot.io'));assert.deepEqual(app.requests[0].searchParams.getAll('osm_tag'),['place','natural','water','waterway','mountain_pass','boundary:administrative']);assert.equal(app.requests[0].searchParams.get('limit'),'8');});
  const cached=await app.search(' lake garda ');cached[0].name='Edited result';
  const restored=await app.search('LAKE GARDA');check(()=>{assert.equal(app.requests.length,3);assert.equal(restored[0].name,'Lake Garda');});
  app=searchVM(()=>({results:[town]}));
  const towns=await app.search('Heidelberg');check(()=>{assert.equal(app.requests.length,1);assert.equal(app.requests[0].hostname,'geocoding-api.open-meteo.com');assert.equal(towns[0].elev,116);});
  app=searchVM(u=>u.hostname==='geocoding-api.open-meteo.com' ? {results:[]} : {features:[lake]});
  const region=await app.search('Dolomites');check(()=>{assert.equal(app.requests.length,2);assert.equal(region[0].name,'Lake Garda');});
  app=searchVM(u=>u.hostname==='geocoding-api.open-meteo.com' ? {results:[{...town,name:'Dolomites Dam',feature_code:'DAM'}]} : {features:[lake]});
  const broader=await app.search('Dolomites');check(()=>{assert.equal(app.requests.length,2);assert.equal(broader[0].searchSource,'photon');assert.equal(broader.length,2);});
  app=searchVM(u=>{if(u.hostname==='photon.komoot.io')throw Error('Feature service unavailable');return {results:[town]};});
  const fallback=await app.search('Lake fallback');check(()=>{assert.equal(app.requests.length,2);assert.equal(fallback[0].name,'Heidelberg');});
  app=searchVM(u=>{if(u.hostname==='geocoding-api.open-meteo.com')throw Error('Weather geocoder unavailable');return {features:[lake]};});
  check(()=>assert.equal(app.run("normaliseGeoHits([{name:'Missing height',latitude:0,longitude:0}])[0].elev"),null));
  const serviceFallback=await app.search('Unknown destination');check(()=>{assert.equal(serviceFallback[0].name,'Lake Garda');assert.equal(app.requests.length,2);});
  app=searchVM(()=>{throw Error('Service unavailable');});
  await assert.rejects(app.search('Nothing answers'),/Service unavailable/);checks++;
  app=searchVM(()=>({results:[],features:[]}));
  check(()=>assert.equal(app.run("geoQueryIsFeature('Col du Tourmalet')"),true));
  check(()=>assert.equal(app.run("geoQueryIsFeature('Rhine valley')"),true));
  check(()=>assert.equal(app.run("geoQueryIsFeature('Berlin')"),false));
  for(const q of [null,'','a','x'.repeat(201)]){const hits=await app.search(q);check(()=>assert.equal(hits.length,0));}
  check(()=>assert.equal(app.requests.length,0));
  const noHits=await app.search('Unfindable');check(()=>{assert.equal(noHits.length,0);assert.equal(app.requests.length,2);});
  const ctrl=new AbortController();ctrl.abort();await assert.rejects(app.search('Cancelled',ctrl.signal),e=>e.name==='AbortError');checks++;
  app=searchVM((u,signal)=>{ctrl2.abort();throw new DOMException('Cancelled','AbortError');});
  const ctrl2=new AbortController();await assert.rejects(app.search('Pending cancellation',ctrl2.signal),e=>e.name==='AbortError');checks++;
  check(()=>assert.equal(app.requests.length,1));
  app=searchVM(()=>({features:[lake]}));
  for(let i=0;i<85;i++)await app.search('Lake sample '+i);
  check(()=>assert.equal(app.run('GEO_CACHE.size'),80));
  const bad=[null,{...lake,geometry:{type:'Point',coordinates:[181,45]}},{...lake,geometry:{type:'Point',coordinates:['10',45]}},{...lake,geometry:{type:'Polygon',coordinates:[]}},{...lake,properties:{...lake.properties,osm_key:'amenity'}},{...lake,properties:{...lake.properties,name:''}}];
  app.context.features=[...bad,lake,lake];
  check(()=>assert.equal(app.run('normalisePhotonHits(features).length'),2));
  check(()=>assert.equal(app.run('uniqueGeoHits(normalisePhotonHits(features)).length'),1));
  app.context.results=[null,{...town,latitude:Infinity},{...town,longitude:181},{...town,name:''},{...town,elevation:99999},town];
  check(()=>{const normal=app.run('normaliseGeoHits(results)');assert.equal(normal.length,2);assert.equal(normal[0].elev,null);assert.equal(normal[1].elev,116);});
  const {appVM}=require('./app-vm.cjs'),whole=appVM();whole.context.samplePlaceJSON=JSON.stringify(restored[0]);whole.run('samplePlace=JSON.parse(samplePlaceJSON)');
  check(()=>{const saved=whole.run('normalisePlace(samplePlace)');assert.equal(saved.elev,null);assert.match(saved.where,/general area/);assert.equal(saved.country,'IT');});
  check(()=>{assert.match(html,/Number\.isFinite\(p\.elev\) \? p\.elev\+' m' : 'height unavailable'/);assert.match(html,/Choose a nearby town for a precise road-route start or finish/);assert.match(html,/© OpenStreetMap contributors/);});
  if(process.argv.includes('--live')){
    const live=searchVM(async(u,signal)=>{const r=await fetch(u,{signal:signal || AbortSignal.timeout(10000)});assert.equal(r.status,200);return r.json();});
    for(const q of ['Lake Garda','Lago di Garda','Gardasee']){
      const hits=await live.search(q);check(()=>assert.ok(hits.some(p=>p.name==='Lake Garda' && p.country==='IT' && p.lat>45 && p.lat<46)));
      console.log(`${q}: ${hits[0].name}, ${hits[0].where}`);
    }
    const liveTown=await live.search('Heidelberg, Germany');check(()=>assert.ok(liveTown.some(p=>p.country==='DE' && p.name==='Heidelberg')));
    console.log(`Public sample searches: ${live.requests.length} requests.`);
  }
  console.log(`Place-search audit passed: ${checks} checks.`);
}
audit().catch(e=>{console.error(e);process.exitCode=1;});
