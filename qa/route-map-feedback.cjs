'use strict';
// Geometry/markup/Leaflet configuration checks; no browser or network is used.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM();let checks=0;
function test(callback){callback();checks++;}
function profile(points){return {via:'GPX',pts:points};}
function drawing(points){app.context.mapTest=profile(points);return app.run('routeMapHeightDrawing(routeMapGeometry(mapTest))');}
const p=(lat,lon,elev,extra={})=>({lat,lon,elev,...extra});
const ascent=[p(49,8,100),p(49.1,8.2,1100)];
test(()=>{
  const d=drawing(ascent);assert.equal(d.low,100);assert.equal(d.high,1100);assert.equal(d.knownEdges,1);assert.equal(d.unknownEdges,0);
  assert.equal(d.groups.length,24);assert.equal(new Set(d.groups.map(g=>g.color)).size,24);
  for(const group of d.groups)for(const segment of group.segments)for(const point of segment)assert.ok(Number.isFinite(point.lat) && Number.isFinite(point.lon));
});
test(()=>{
  const d=drawing(ascent.map(pt=>({...pt,elev:100})));assert.equal(d.groups.length,1);assert.equal(d.low,d.high);
  app.context.mapDrawing=d;assert.match(app.run('routeMapHeightLegendHtml(mapDrawing)'),/100 m \(level\)/);
});
test(()=>{
  const d=drawing([p(49,8,100),p(49.05,8.1,null),p(49.1,8.2,1100)]);
  assert.equal(d.knownEdges,0);assert.equal(d.unknownEdges,2);assert.equal(d.groups.length,1);assert.equal(d.groups[0].unknown,true);
  const html=app.run('routeMapOutlineHtml(mapTest)');assert.match(html,/height-unknown/);assert.doesNotMatch(html,/class="route-outline-line height-colored"/);
});
test(()=>{
  const d=drawing([p(49,8,100),p(49.05,8.1,500),p(49.1,8.2,null)]);assert.equal(d.knownEdges,1);assert.equal(d.unknownEdges,1);
  app.context.mapDrawing=d;const legend=app.run('routeMapHeightLegendHtml(mapDrawing)');assert.match(legend,/100 m/);assert.match(legend,/500 m/);assert.match(legend,/Height unavailable/);
});
test(()=>{
  const d=drawing([p(49,8,100),p(49.1,8.1,100),p(50,9,100,{break:true}),p(50.1,9.1,100)]);
  assert.equal(d.knownEdges,2);assert.equal(d.groups[0].segments.length,2);
  assert.equal(d.groups[0].segments[0].length,2);assert.equal(d.groups[0].segments[1].length,2);
});
test(()=>{
  drawing([p(49,8,100),p(49.1,8.1,100),p(NaN,9,100),p(50,9,100),p(50.1,9.1,100)]);
  const separated=app.run('routeMapGeometry(mapTest)');assert.equal(separated.segments.length,2);
  app.context.mapTest.pts.splice(2,1);assert.notEqual(app.run('routeMapGeometry(mapTest).key'),separated.key);
});
test(()=>{
  const d=drawing([p(10,179.9,100),p(10,-179.9,1100)]),geometry=app.run('routeMapGeometry(mapTest)');
  assert.ok(geometry.bounds.maxX-geometry.bounds.minX<1);
  for(const group of d.groups)for(const segment of group.segments)for(const point of segment){
    assert.ok(point.lon>=179.9 && point.lon<=180.1);app.context.mapPoint=point.point;
    const xy=app.run('routeMapGeometry(mapTest).xy(mapPoint)');assert.ok(xy.x>=27 && xy.x<=653 && Number.isFinite(xy.y));
  }
});
test(()=>{
  drawing(ascent);const key=app.run('routeMapGeometry(mapTest).key');app.context.mapTest.pts[0].elev=200;
  assert.notEqual(app.run('routeMapGeometry(mapTest).key'),key);
});
test(()=>{
  const points=Array.from({length:5000},(_,i)=>p(49+i*.00001,8+i*.00001,i%31===0?null:100+Math.sin(i/50)*100));
  const d=drawing(points);assert.ok(d.groups.length<=25);assert.ok(d.knownEdges>4500 && d.unknownEdges>0);
  const html=app.run('routeMapOutlineHtml(mapTest)');assert.ok(!/NaN|Infinity/.test(html));
  assert.ok((html.match(/class="route-outline-line /g)||[]).length<=25);
});
test(()=>{
  drawing(ascent);const html=app.run('renderRouteMapHtml(mapTest)');assert.match(html,/mouse wheel/);assert.match(html,/Move the slider to match a climb/);assert.match(html,/Point selected on elevation chart/);
  assert.match(html,/Relative height:/);assert.match(html,/low → high on this route/);
  assert.match(app.html,/\.profile-distance:focus\{outline:none\}/);assert.match(app.html,/\.profile-distance:focus-visible::-webkit-slider-thumb/);assert.match(app.html,/\.profile-distance:focus-visible::-moz-range-thumb/);
});
async function leafletCheck(){
  const lines=[],handlers={};let options;
  const layer=()=>({addTo(){return this;},bindPopup(){return this;},setLatLng(){return this;}});
  const map={invalidateSize(){},fitBounds(){},remove(){},removeLayer(){}};
  app.context.window.location.protocol='https:';
  app.context.document.createElement=()=>({textContent:''});
  app.context.window.L={map(host,opts){options=opts;return map;},polyline(coords,opts){lines.push({coords,opts});return layer();},circleMarker(){return layer();},
    tileLayer(){return {on(type,callback){handlers[type]=callback;return this;},addTo(){return this;}};}};
  const host=app.nodes.get('routeMapHost')||app.context.document.getElementById('routeMapHost');host.isConnected=true;
  app.context.mapHost=host;app.context.mapTest=profile([p(49,8,100),p(49.1,8.1,1100),p(49.2,8.2,null)]);
  app.run('loadRouteMapLeaflet=async()=>window.L;ROUTE_MAP_STATE.host=mapHost;ROUTE_MAP_STATE.geometry=routeMapGeometry(mapTest);');
  assert.equal(await app.run('openRouteMap()'),true);assert.equal(options.scrollWheelZoom,true);
  const expected=app.run('routeMapHeightDrawing(ROUTE_MAP_STATE.geometry)');assert.equal(lines.length,expected.groups.length+1);
  for(const group of expected.groups)assert.ok(lines.some(line=>line.opts.color===(group.color||'#64716d') && !!line.opts.dashArray===group.unknown));
  handlers.load();assert.match(app.nodes.get('routeMapStatus').textContent,/mouse wheel/);checks++;
}
leafletCheck().then(()=>console.log(`Route map feedback checks passed: ${checks} cases (including 5,000-point geometry and mocked Leaflet).`)).catch(error=>{console.error(error);process.exitCode=1;});
