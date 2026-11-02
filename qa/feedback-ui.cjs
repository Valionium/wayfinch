'use strict';
// Real application functions with simulated layout/event delivery. No browser.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),{run,context,nodes,events}=app;let checks=0;
const check=fn=>{fn();checks++;};
function classes(...initial){const set=new Set(initial);return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),toggle(x,on){if(on===undefined)on=!set.has(x);on?set.add(x):set.delete(x);return on;}};}
context.document.body.classList=classes();
context.document.removeEventListener=(type,callback)=>{if(events.get(type)===callback)events.delete(type);};
context.document.documentElement.scrollHeight=3000;context.window.innerHeight=720;
context.window.scrollY=500;context.window.scrollX=0;
context.window.scrollTo=({top})=>{context.window.scrollY=Math.max(0,Math.min(top,3000));};
const frames=[];context.queueMicrotask=fn=>fn();context.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};
const root={id:'s1',isConnected:true,controls:[],contains(el){return this.controls.includes(el);},querySelectorAll(){return this.controls;}};
function control({id='',attrs={},top=700,tag='BUTTON'}={}){
  const el={id,tagName:tag,isConnected:true,disabled:false,docTop:top,attributes:Object.entries(attrs).map(([name,value])=>({name,value})),
    getAttribute:name=>attrs[name]??null,hasAttribute:name=>Object.hasOwn(attrs,name),
    closest(selector){if(selector==='#s1,#s2,#s3,#s4,#rigBox')return root;return null;},
    getBoundingClientRect(){return {top:this.docTop-context.window.scrollY};},focus(){context.document.activeElement=this;}};
  root.controls.push(el);return el;
}
context.root=root;const nights=control({id:'nights',tag:'INPUT'});context.nightsControl=nights;
run('S.step=1;rememberViewportControl(nightsControl)');
check(()=>{nights.docTop+=180;run('restoreViewportAnchor()');assert.equal(nights.getBoundingClientRect().top,200);assert.equal(context.window.scrollY,680);});
check(()=>{const before=context.window.scrollY;run('restoreViewportAnchor()');assert.equal(context.window.scrollY,before);});
check(()=>{nights.docTop-=300;run('restoreViewportAnchor()');assert.equal(nights.getBoundingClientRect().top,200);assert.equal(context.window.scrollY,380);});
const speed=control({attrs:{'data-kph':'28'},top:850});context.speed=speed;
run('rememberViewportControl(speed)');const speedTop=speed.getBoundingClientRect().top;
speed.isConnected=false;root.controls=root.controls.filter(x=>x!==speed);
const replacement=control({attrs:{'data-kph':'28'},top:1050});
check(()=>{run('restoreViewportAnchor()');assert.equal(replacement.getBoundingClientRect().top,speedTop);});
check(()=>{replacement.isConnected=false;root.controls=root.controls.filter(x=>x!==replacement);const other=control({attrs:{'data-kph':'25'},top:900});const before=context.window.scrollY;run('restoreViewportAnchor()');assert.equal(run('VIEWPORT_ANCHOR'),null);assert.equal(context.window.scrollY,before);assert.notEqual(context.document.activeElement,other);});
check(()=>{run('rememberViewportControl(nightsControl);S.step=2;restoreViewportAnchor()');assert.equal(run('VIEWPORT_ANCHOR'),null);run('S.step=1');});
check(()=>{context.window.scrollY=30;nights.docTop=200;run('rememberViewportControl(nightsControl)');nights.docTop=20;run('restoreViewportAnchor()');assert.equal(context.window.scrollY,0);assert.equal(run('VIEWPORT_ANCHOR.top'),20);});
context.document.querySelector=()=>null;
run('initialiseStableViewport();rememberViewportControl(nightsControl)');
check(()=>{events.get('wheel')();assert.equal(run('VIEWPORT_ANCHOR'),null);});
check(()=>{assert.equal(context.document.body.style.minHeight,'');run('rememberViewportControl(nightsControl)');assert.equal(context.document.body.style.minHeight,'3000px');run('releaseViewportAnchor()');assert.equal(context.document.body.style.minHeight,'');});
check(()=>{run('rememberViewportControl(nightsControl)');context.window.scrollY+=30;events.get('scroll')();assert.equal(run('VIEWPORT_ANCHOR'),null);});
check(()=>{run('rememberViewportControl(nightsControl)');events.get('keydown')({key:'PageDown',target:nights});assert.equal(run('VIEWPORT_ANCHOR'),null);});
check(()=>{events.get('input')({type:'input',target:{closest:()=>nights}});const before=nights.getBoundingClientRect().top;nights.docTop+=130;events.get('toggle')();while(frames.length)frames.shift()();assert.equal(nights.getBoundingClientRect().top,before);});
let mutationCallback,resizeCallback;
context.document.querySelector=()=>root;
context.MutationObserver=class {constructor(callback){mutationCallback=callback;}observe(){}};
context.ResizeObserver=class {constructor(callback){resizeCallback=callback;}observe(){}};
run('initialiseStableViewport()');
check(()=>{run('rememberViewportControl(nightsControl)');const before=nights.getBoundingClientRect().top;nights.docTop+=110;mutationCallback();while(frames.length)frames.shift()();assert.equal(nights.getBoundingClientRect().top,before);nights.docTop-=70;resizeCallback();while(frames.length)frames.shift()();assert.equal(nights.getBoundingClientRect().top,before);});
check(()=>{context.window.scrollY=2100;nights.docTop=2500;run('rememberViewportControl(nightsControl)');const shrunkHeight=2600,pinnedHeight=parseFloat(context.document.body.style.minHeight);context.window.scrollY=Math.min(context.window.scrollY,Math.max(shrunkHeight,pinnedHeight)-720);mutationCallback();while(frames.length)frames.shift()();assert.equal(context.window.scrollY,2100);assert.equal(nights.getBoundingClientRect().top,400);});
check(()=>{events.get('click')({type:'click',target:{closest:()=>({closest:()=>true})}});assert.equal(run('VIEWPORT_ANCHOR'),null);});
check(()=>{run('rememberViewportControl(nightsControl);beginDialog(document.getElementById("mockDialog"),true,()=>{},null)');assert.equal(run('VIEWPORT_ANCHOR'),null);assert.equal(context.document.body.style.overflow,'hidden');assert.ok(context.document.body.classList.contains('modal-open'));run('endDialog(document.getElementById("mockDialog"))');assert.ok(!context.document.body.classList.contains('modal-open'));});
// Reuse actual trip rendering, but avoid large bike/result markup irrelevant here.
run('drawRig=()=>{};S.gpx={name:"Loop",km:180,distanceKm:180};S.place={lat:49,lon:8,name:"Track start"};S.place2={lat:49,lon:8,name:"Track end"};S.departureDate="2026-10-05";');
['forecastNote','climateNote','nightsSuggestion','nightsSuggestionHint','checkNightsSuggestion'].forEach(id=>context.document.getElementById(id).classList=classes());
const token=run('GPX_LOAD_ID');
check(()=>{run('clearGPX()');assert.equal(run('S.gpx'),null);assert.equal(run('S.place'),null);assert.equal(run('S.place2'),null);assert.equal(run('routeProfile()'),null);assert.ok(run('GPX_LOAD_ID')>token);});
check(()=>{assert.equal(nodes.get('routePlan').innerHTML,'');assert.equal(nodes.get('climateNote').innerHTML,'');assert.equal(nodes.get('forecastNote').innerHTML,'');for(const id of ['forecastNote','climateNote','nightsSuggestion','nightsSuggestionHint','checkNightsSuggestion'])assert.ok(nodes.get(id).classList.contains('hidden'),id);});
check(()=>{run('renderForecast()');assert.ok(nodes.get('forecastNote').classList.contains('hidden'));assert.equal(nodes.get('forecastNote').innerHTML,'');});
check(()=>{run('S.place={lat:49,lon:8,name:"Start"};S.place2={lat:49,lon:8,name:"End"};S.gpx={via:"GPX",km:0,distanceKm:0,ascent:0,pts:[{lat:49,lon:8,elev:100,km:0},{lat:49,lon:8,elev:100,km:0}]};renderRoutePlan()');assert.match(nodes.get('routePlan').innerHTML,/no riding distance/);assert.doesNotMatch(nodes.get('routePlan').innerHTML,/class="timeline"|suggested stop/);assert.ok(nodes.get('nightsSuggestion').classList.contains('hidden'));});
check(()=>{context.document.getElementById('walkthroughBox').classList=classes('hidden');context.document.getElementById('legalBox').classList=classes('hidden');run('renderWalkthrough=()=>{};beginDialog=()=>{};S.step=3;openWalkthrough()');assert.equal(run('WALKTHROUGH_INDEX'),2);});
check(()=>{context.geom={kind:'rect',x:0,y:0,w:20,h:40,rx:2};context.slot={cap:4,left:1};assert.match(run('segmentArt(geom,slot)'),/opacity="0\.85"/);});
check(()=>{run('S.nights=1;S.sleep="camp";tripClimate=()=>({nightCold:-10,wetChance:60,both:false,place:{elev:null}})');assert.doesNotMatch(run('climateConsequence()'),/null m|0 m|NaN/);run('tripClimate=()=>({nightCold:-10,wetChance:60,both:true,placeA:{elev:null},placeB:{elev:1000}})');assert.match(run('climateConsequence()'),/1000 m/);assert.doesNotMatch(run('climateConsequence()'),/0–1000|null/);});
check(()=>{const css=app.html.slice(app.html.indexOf('<style>'),app.html.indexOf('</style>'));assert.match(css,/\.legalbox\.hidden\{display:none\}/);assert.match(css,/\.legalbox\{[^}]*align-items:center;justify-content:center/);assert.doesNotMatch(css.match(/\.lgl-card\{[^}]*}/)[0],/translateX|pollreveal/);assert.match(css,/scrollbar-gutter:stable/);assert.match(css,/#rigSvg \[role=button\]:focus\{outline:none\}/);assert.match(css,/animation-duration:0s!important;animation-delay:0s!important/);});
console.log(`Feedback UI checks passed: ${checks} cases (layout/event simulation; no local browser rendering).`);
