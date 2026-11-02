'use strict';
// Actual markup-producing functions; no browser rendering or external requests.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
let checks=0;
const check=fn=>{fn();checks++;};
const visible=html=>html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g,'');
const explanations=html=>[...html.matchAll(/<template\b[^>]*>([\s\S]*?)<\/template>/g)].map(match=>match[1]).join('\n');
const points=[{lat:49,lon:8,elev:100,km:0},{lat:49.1,lon:8.2,elev:1100,km:120}];
const mapApp=appVM();mapApp.context.testProfile={via:'GPX',km:120,distanceKm:120,ascent:1000,elevationSource:'file',pts:points};
const mapHtml=mapApp.run('renderRouteMapHtml(testProfile)');
check(()=>{assert.match(visible(mapHtml),/OpenStreetMap contributors/);assert.match(visible(mapHtml),/share the displayed map area/);assert.match(visible(mapHtml),/mouse wheel/);});
check(()=>{assert.match(explanations(mapHtml),/blue dot marks the point/);assert.doesNotMatch(visible(mapHtml),/blue dot marks the point/);});
const elevationHtml=mapApp.run('renderElevationProfileHtml(testProfile)');
check(()=>{assert.match(visible(elevationHtml),/id="elevationSvg"/);assert.match(visible(elevationHtml),/Inspect a point along the route/);assert.match(visible(elevationHtml),/not turn-by-turn navigation/);});
check(()=>{assert.match(explanations(elevationHtml),/original heights after smoothing/);assert.doesNotMatch(visible(elevationHtml),/original heights after smoothing/);});
mapApp.run('testProfile.elevationSource="unavailable";testProfile.ascent=null;testProfile.pts.forEach(point=>point.elev=null)');
check(()=>assert.match(visible(mapApp.run('renderElevationProfileHtml(testProfile)')),/heights are unavailable/));

const routeApp=appVM();
routeApp.context.testRoute={via:'GPX',km:120,distanceKm:120,ascent:1000,flat:25,loaded:22,climbKm:20,suggestedNights:2,ridingDays:3,kmDay:40,hoursDay:3,
  pace:{note:'Sporting pace',hours:5,label:'Sporting'},matchesPace:true,stageBasis:'effort',pts:points};
routeApp.run('S.place={lat:49,lon:8,name:"Start"};S.place2={lat:49.1,lon:8.2,name:"End"};S.nights=2;routePending=()=>false;planRoute=()=>testRoute;routeProfile=()=>testRoute;mountRouteVisuals=()=>{};nightStops=()=>[{first:true,n:0,name:"Start",km:0,elev:100},{last:true,n:1,name:"End",km:120,dayKm:120,dayUpExact:1000,dayHours:3,elev:1100}];renderRoutePlan()');
const routeHtml=()=>routeApp.nodes.get('routePlan').innerHTML;
check(()=>{assert.match(visible(routeHtml()),/120 km/);assert.match(visible(routeHtml()),/1000 m/);assert.match(visible(routeHtml()),/40 km/);assert.match(visible(routeHtml()),/3 riding hours/);});
check(()=>{assert.match(explanations(routeHtml()),/25 kph on the flat becomes/);assert.match(explanations(routeHtml()),/20 km worth of effort/);assert.doesNotMatch(visible(routeHtml()),/worth of effort|balanced by estimated riding effort/);});
check(()=>{const hint=routeApp.nodes.get('nightsSuggestionHint').innerHTML;assert.match(visible(hint),/chosen number stays unchanged/);assert.match(explanations(hint),/Based on 25 kph/);assert.doesNotMatch(visible(hint),/Based on/);});
check(()=>{assert.match(visible(routeHtml()),/Times cover riding only/);assert.match(visible(routeHtml()),/Check accommodation/);});
for(const [via,warning] of [['OSRM',/Driving-route fallback/],['OSM paths',/Walking-route fallback/],['estimate',/not a verified cycling route/]]){
  check(()=>{routeApp.context.testRoute.via=via;routeApp.run('renderRoutePlan()');assert.match(visible(routeHtml()),warning);assert.match(visible(routeHtml()),/Retry cycling route/);});
}

const climateApp=appVM();climateApp.context.testClimate={source:'measured',both:true,nightCold:-2,nightMean:4,dayMean:16,dayHot:22,rainDays:12,wetChance:40,
  placeA:{name:'Start',lat:49,lon:8,elev:100},placeB:{name:'End',lat:49.1,lon:8.2,elev:1000},highCold:-4};
climateApp.run('S.place=testClimate.placeA;S.place2=testClimate.placeB;tripClimate=()=>testClimate;ensureClimate=()=>{};ensureRoute=()=>{};renderChosen=()=>{};renderRoutePlan=()=>{};renderForecast=()=>{};routeHigh=()=>({lat:49.1,lon:8.1,elev:1100});failedClimatePlaces=()=>[];renderClimate()');
const climateHtml=()=>climateApp.nodes.get('climateNote').innerHTML;
check(()=>{assert.match(visible(climateHtml()),/-2°C/);assert.match(visible(climateHtml()),/16°C/);assert.match(visible(climateHtml()),/12 rain days/);assert.match(visible(climateHtml()),/1100 m/);assert.match(visible(climateHtml()),/-4°C/);});
check(()=>{assert.match(explanations(climateHtml()),/coldest tenth of nights/);assert.match(explanations(climateHtml()),/harsher conditions/);assert.match(explanations(climateHtml()),/more than the mild-weather baseline/);assert.doesNotMatch(visible(climateHtml()),/coldest tenth|harsher conditions|more than the mild-weather baseline/);assert.equal((climateHtml().match(/class="info-button"/g)||[]).length,1);});
check(()=>{climateApp.run('testClimate.source="modelled-failed";failedClimatePlaces=()=>[S.place];renderClimate()');assert.match(visible(climateHtml()),/provisional/);assert.match(visible(climateHtml()),/Measured weather is unavailable/);assert.match(visible(climateHtml()),/Retry weather/);});

const forecastApp=appVM();forecastApp.context.testForecast={status:'ready',start:'2026-10-11',end:'2026-10-12',fetchedAt:'2026-10-11T09:00:00Z',partial:false,days:2,completeDays:1,
  places:[{name:'Start',lat:49,lon:8},{name:'End',lat:49.1,lon:8.2}],rows:[{date:'2026-10-11',low:3,high:15,probability:60,rain:2,wind:10,gust:30,points:2}]};
forecastApp.run('S.place=testForecast.places[0];S.departureDate="2026-10-11";ensureForecast=()=>{};forecastSummary=()=>testForecast;forecastWarnings=()=>["Rain warning: keep your sleep kit dry."];renderForecast()');
const forecastHtml=forecastApp.nodes.get('forecastNote').innerHTML;
check(()=>{assert.match(visible(forecastHtml),/Rain warning/);assert.match(visible(forecastHtml),/3°C/);assert.match(visible(forecastHtml),/Refresh forecast/);assert.match(visible(forecastHtml),/Open-Meteo forecast source/);});
check(()=>{assert.match(explanations(forecastHtml),/lowest temperature and greatest rain/);assert.match(explanations(forecastHtml),/cached for 30 minutes/);assert.doesNotMatch(visible(forecastHtml),/lowest temperature and greatest rain|cached for 30 minutes/);assert.equal((forecastHtml.match(/class="info-button"/g)||[]).length,1);});
console.log(`Trip explanation checks passed: ${checks} cases (actual markup; no browser rendering).`);
