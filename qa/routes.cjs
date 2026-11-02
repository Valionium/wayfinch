'use strict';
// Read-only regression checks for route, GPX, stage and import calculations.
// Run with: node load-check/qa/routes.cjs
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(require('./paths.cjs').page,'utf8');
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/\bsrc\s*=/.test(match[1]))new vm.Script(match[2]);
}
function section(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a);
  assert(a>=0 && b>a,`Missing source section: ${start}`);return html.slice(a,b);
}
const context=vm.createContext({assert,console,setTimeout,clearTimeout,AbortController,DOMException});
vm.runInContext(`
const S={place:null,place2:null,gpx:null,month:5,nights:6,flatKph:25,pace:'sporting'};
const REGIONS=[];
const climateAt=()=>null,placeLabel=p=>p?.name||'',placeCountry=()=>'';
const ensureClimate=()=>{},renderClimate=()=>{},renderResult=()=>{},drawRig=()=>{};
const presetPlace=()=>null;
${section('function normaliseDepartureDate(', 'function syncDepartureDate(')}
${section("const ELEV_URL =", '/* ---- local knowledge,')}
${section('const ASCENT_THRESHOLD =', '// Names for the two ends,')}
${section('function dataObject(', 'function normalisePlan(')}
`,context);

async function audit(){
  let cases=0;
  const check=(fn)=>{fn();cases++;};
  const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
  const point=(lat,lon,elev,extra={})=>({lat,lon,elev,...extra});
  const start=point(49,8,100),close=point(49.0001,8.0001,100),end=point(50,9,200);
  check(()=>assert.notEqual(routeKey(start,end),routeKey(close,end)));
  check(()=>assert.notEqual(routeKey(end,start),routeKey(start,end)));
  check(()=>near(haversine(point(0,0,0),point(0,180,0)),Math.PI*6371));
  const short=buildProfile([point(0,0,0),point(.001,0,0)],0,{via:'OSM cycle',routed:true});
  const zero=buildProfile([point(0,0,0),point(0,0,0)],0,{via:'OSM cycle',routed:true});
  check(()=>{assert.ok(short.km>0 && short.km<1);near(short.distanceKm,haversine(short.pts[0],short.pts[1]));});
  check(()=>{assert.equal(zero.km,0);assert.equal(zero.distanceKm,0);assert.ok(zero.pts.every(p=>p.t===0 && p.km===0));});
  check(()=>assert.equal(buildProfile([],0,{}),null));
  check(()=>assert.equal(buildProfile([point(0,0,0),point(100,0,0)],0,{}),null));
  const from=point(0,0,0),to=point(.1,0,100);
  const calculated=buildProfile([from,to],15.234,{via:'OSM cycle',routed:true});
  check(()=>{near(calculated.pts[1].km,15.234);near(calculated.distanceKm,15.234);});
  const snapshot={...calculated,from,to};
  check(()=>{const restored=normaliseRouteSnapshot(snapshot,from,to);assert.ok(restored);near(restored.distanceKm,15.234);});
  check(()=>assert.equal(normaliseRouteSnapshot(snapshot,point(.0001,0,0),to),null));
  check(()=>assert.equal(normaliseRouteSnapshot({...snapshot,distanceKm:1},from,to),null));
  S.gpx=null;S.place=start;S.place2=end;ROUTE={};ROUTE_PENDING={};
  const pending=[];resolveRoute=async(a,b)=>new Promise(resolve=>pending.push({a,b,resolve}));
  ensureRoute(start,end,5);ensureRoute(close,end,5);
  check(()=>assert.equal(pending.length,2));
  pending[0].resolve(short);pending[1].resolve(calculated);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  check(()=>{assert.equal(routeProfile(),short);S.place=close;assert.equal(routeProfile(),calculated);});
  ROUTE={};ROUTE_PENDING={};ensureRoute(start,end,5);
  delete ROUTE_PENDING[routeKey(start,end)];ROUTE[routeKey(start,end)]=calculated;
  pending[2].resolve(short);await Promise.resolve();await Promise.resolve();await Promise.resolve();
  check(()=>assert.equal(ROUTE[routeKey(start,end)],calculated));
  check(()=>{
    const legacy={...snapshot,km:15};delete legacy.distanceKm;
    legacy.pts=legacy.pts.map(p=>({...p,km:p.t*11.12}));
    const restored=normaliseRouteSnapshot(legacy,from,to);assert.ok(restored);near(restored.pts[1].km,15);
  });
  const profile=async(points,name)=>gpxProfileFrom({pts:points,name});
  elevationsFor=async()=>null;
  const sparseClimb=await profile([point(49,8,100),point(49.1,8,1100)],'Sparse climb');
  const sparsePass=await profile([point(49,8,100),point(49.1,8,1100),point(49.2,8,100)],'Sparse pass');
  check(()=>assert.equal(sparseClimb.ascent,1000));
  check(()=>assert.equal(sparsePass.ascent,1000));
  check(()=>assert.ok(sparsePass.high && sparsePass.high.elev===1100));
  const flat=await profile(Array.from({length:101},(_,i)=>point(49+i*.001,8,100)),'Flat');
  const denseClimb=await profile(Array.from({length:1001},(_,i)=>point(49+i*.0001,8,100+i)),'Dense climb');
  const hilly=await profile(Array.from({length:801},(_,i)=>point(49+i*.0001,8,100+400*(1-Math.cos(i*Math.PI/200)))),'Rolling hills');
  const noise=await profile(Array.from({length:2001},(_,i)=>point(49+i*.00001,8,100+(i%2?2:-2))),'Recording noise');
  const loop=await profile([point(49,8,100),point(49.05,8,400),point(49.05,8.05,300),point(49,8,100)],'Loop');
  const disconnected=await profile([point(49,8,100),point(49.1,8,200),point(52,13,900,{break:true}),point(52.1,13,1000)],'Disconnected');
  const missing=await profile([point(49,8,null),point(49.05,8,null),point(49.1,8,null)],'Missing heights');
  const partial=await profile([point(49,8,100),point(49.05,8,null),point(49.1,8,300)],'Partial heights');
  const dateline=await profile([point(0,179.9,100),point(0,-179.9,200)],'Date line');
  check(()=>assert.equal(flat.ascent,0));
  check(()=>assert.equal(denseClimb.ascent,1000));
  check(()=>assert.ok(hilly.ascent>1550 && hilly.ascent<=1600));
  check(()=>assert.ok(noise.ascent<20));
  check(()=>{assert.equal(disconnected.segments,2);assert.equal(disconnected.ascent,200);assert.ok(disconnected.distanceKm<23);});
  check(()=>{assert.equal(missing.ascent,null);assert.equal(missing.elevationSource,'unavailable');});
  check(()=>{assert.equal(partial.ascent,200);assert.equal(partial.elevationSource,'interpolated');});
  check(()=>{assert.ok(dateline.distanceKm>22 && dateline.distanceKm<23);assert.equal(Math.abs(interpolateStagePoint(dateline.pts[0],dateline.pts[1],.5).lon),180);});
  const fixtures=[flat,denseClimb,hilly,loop,disconnected,missing,partial,dateline,short,zero];
  for(const p of fixtures)for(const nights of [0,1,6,30])for(const pace of ['steady','sporting','hard'])for(const speed of [10,25,45]){
    S.gpx=p;S.place={...p.pts[0],name:'Start'};S.place2={...p.pts[p.pts.length-1],name:'End'};
    S.nights=nights;S.pace=pace;S.flatKph=speed;
    check(()=>{
      const plan=planRoute(),stops=nightStops();
      assert.equal(S.nights,nights);assert.equal(plan.ridingDays,nights+1);assert.equal(stops.length,nights+2);
      near(stops.reduce((sum,s)=>sum+s.dayKmExact,0),p.distanceKm);
      if(p.ascent!==null)near(stops.reduce((sum,s)=>sum+s.dayUpExact,0),p.ascent);
      assert.ok(stops.every(s=>Number.isFinite(s.lat) && Number.isFinite(s.lon) && s.dayKmExact>=0 && s.dayHoursExact>=0));
      assert.ok(stops.every((s,i)=>!i || s.kmExact>=stops[i-1].kmExact));
      if(p.distanceKm>0)near(stops[stops.length-1].kmExact,p.distanceKm);
      const efforts=stops.slice(1).map(s=>s.dayHoursExact);
      near(Math.max(...efforts),Math.min(...efforts),1e-6);
    });
  }
  for(const p of [sparseClimb,sparsePass,flat,denseClimb,hilly,loop,disconnected,missing,partial,dateline])check(()=>{
    const restored=normaliseGPX(p);assert.ok(restored,`Restore failed: ${p.name}`);near(restored.distanceKm,p.distanceKm);assert.equal(restored.ascent,p.ascent);
  });
  check(()=>assert.equal(normaliseGPX({...sparsePass,km:1}),null));
  check(()=>assert.equal(normaliseGPX({...sparsePass,distanceKm:300}),null));
  check(()=>assert.equal(normaliseGPX({...sparsePass,pts:sparsePass.pts.map((p,i)=>({...p,km:i===0?1:p.km}))}),null));
  check(()=>assert.equal(normaliseGPX({...sparsePass,pts:sparsePass.pts.map((p,i)=>({...p,t:i===1?.99:p.t}))}),null));
  check(()=>assert.equal(normaliseGPX({...sparsePass,mapPts:sparsePass.mapPts.map((p,i)=>({...p,lon:i===0?p.lon+.01:p.lon}))}),null));
  check(()=>assert.equal(normaliseGPX({...sparsePass,high:{...sparsePass.high,elev:9000}}),null));
  check(()=>{const legacy={...sparsePass};delete legacy.distanceKm;assert.ok(normaliseGPX(legacy));});
  let probes=[];elevationsFor=async(points)=>{probes=points;return points.map(()=>100);};
  const corridor=await viaCorridor(point(0,179.9,100),point(0,-179.9,100));
  check(()=>{assert.ok(corridor.distanceKm<30);assert.ok(corridor.pts.every(p=>Math.abs(p.lon)>=179.9-1e-6));assert.ok(probes.every(p=>Math.abs(p.lat)<=90 && Math.abs(p.lon)<=180));});
  await viaCorridor(point(89.999,179.9,100),point(89.999,-179.9,100));
  check(()=>assert.ok(probes.every(p=>Number.isFinite(p.lon) && Math.abs(p.lat)<=90 && Math.abs(p.lon)<=180)));
  for(const [date,expected] of [['2024-02-29','2024-02-29'],['2026-02-29',null],['2026-13-01',null],['2026-10-03','2026-10-03']])check(()=>assert.equal(normaliseDepartureDate(date),expected));
  check(()=>assert.equal(shiftCalendarDate('2026-03-28',2),'2026-03-30'));
  check(()=>assert.equal(shiftCalendarDate('2026-10-24',2),'2026-10-26'));
  check(()=>assert.equal(shiftCalendarDate('2026-12-31',1),'2027-01-01'));
  console.log(JSON.stringify({status:'passed',cases,stageScenarios:fixtures.length*4*3*3,syntax:'all inline scripts'}));
}
vm.runInContext(`(${audit.toString()})()`,context).catch(error=>{console.error(error);process.exitCode=1;});
