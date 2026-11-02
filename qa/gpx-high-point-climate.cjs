'use strict';
// A GPX route's high point must keep counting after the month or departure date changes.
// Regression for the 29 Oct 2026 review (trip-1/routes-1): only the two route ends were
// re-requested, so a 2,500 m pass silently dropped out of the cold-night packing guide.
// Real loadGPX, tripClimate, weatherKit and the Month/Departure date handlers run here;
// only the network (fetchNormals), the browser-only GPX parser and map mounting are stubbed.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const {run,context,script}=appVM();
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const atPass=r=>Math.abs(r.lat-47)<0.01 && r.lon===11.2; // the fixture's pass, as the normals stub defines it
const settle=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setTimeout(resolve,20));};
function handler(start){ // 95-init wires these; the harness stops before it
  const a=script.indexOf(start);assert.ok(a>=0,`Missing handler: ${start}`);
  let depth=0,i=script.indexOf('{',a);
  for(;i<script.length;i++){if(script[i]==='{')depth++;else if(script[i]==='}' && !--depth)break;}
  return script.slice(a,i+2);
}
(async()=>{
  run(handler("$('month').onchange = e => {"));
  run(handler("$('departureDate').onchange = e => {"));
  run('mountRouteVisuals=()=>{};');
  context.requests=[];
  // Seasonal normals that get colder with height: only the pass (lat 47.0) is high.
  run(`fetchNormals=async(lat,lon,month)=>{
    requests.push({lat:+(+lat).toFixed(3),lon:+(+lon).toFixed(3),month});
    const elev=Math.abs(lat-47)<0.01?2500:600,night=Math.round(12-Math.abs(month-6)*2.5-elev*0.0065);
    return {nightMean:night+4,nightCold:night,dayMean:night+12,dayHot:night+16,rainDays:9,years:5,from:2021,to:2025,source:'measured'};};
  elevationsFor=async()=>{throw Error('The fixture has heights');};`);
  // Valley towns at 600 m with a 2,500 m pass halfway.
  const pts=[];for(let i=0;i<=400;i++){const f=i/400;pts.push({lat:46.8+f*0.4,lon:11.2,elev:Math.round(600+1900*Math.sin(f*Math.PI))});}
  context.fixture={name:'Alpine pass',pts,segments:1,hasElev:true};
  run('parseGPX=()=>JSON.parse(JSON.stringify(fixture));S.sleep="camp";S.nights=4;');
  const loaded=await run(`loadGPX('<gpx/>','alps.gpx')`);
  await settle();
  assert.ok(loaded.ok && run('S.gpx.high.elev')===2500,'fixture: the GPX loads with its pass as the high point');

  // June -> September in the Month select. September at 2,500 m: round(12-5-16.25) = -9 °C.
  context.requests.length=0;
  run(`$('month').onchange({target:{value:'8'}})`);
  await settle();
  check(context.requests.some(r=>atPass(r) && r.month===8),'September normals are requested for the pass');
  check(run('tripClimate().nightCold')===-9,'the cold-night guide follows the pass after a month change');
  check(run('weatherKit(tripClimate()).some(x=>x[0]==="a warmer sleep system")'),'camping kit asks for a warmer sleep system');

  // A departure date in October. October at 2,500 m: round(12-7.5-16.25) = -12 °C.
  context.requests.length=0;
  run(`$('departureDate').onchange({target:{value:'2027-10-10'}})`);
  await settle();
  check(context.requests.some(r=>atPass(r) && r.month===9),'October normals are requested for the pass');
  check(run('tripClimate().nightCold')===-12,'the cold-night guide follows the pass after a date change');
  console.log(JSON.stringify({suite:'gpx-high-point-climate',checks}));
})().catch(error=>{console.error(error);process.exitCode=1;});
