'use strict';
// Task 17-19: the remaining findings of the 29 October review. Each case is labelled [LC-FIX-<finding>].
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const fresh=()=>appVM();
// Start-up code (95-init) is not loaded by the test page; pull out the functions a case needs, by name.
const html0=require('node:fs').readFileSync(require('./paths.cjs').page,'utf8');
const pullFunction=name=>{const at=html0.indexOf('function '+name+'(');assert.ok(at>=0,'function '+name);let depth=0,i=html0.indexOf('{',at);const start=at;
 for(;i<html0.length;i++){const c=html0[i];if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)break;}}
 return html0.slice(start,i+1);};
const J=(app,code)=>JSON.parse(app.run(`JSON.stringify(${code})`)??'null');

// [LC-FIX-M6] Alternatives chosen in Kit search count for the missing-item check, and the overflow fix keeps the only shelter.
{const app=fresh();
 const only=()=>app.run(`KIT.forEach(k=>{if(!k.added)chooseKitItem(k.id,k.id==='quilt');})`);
 app.run(`S.nights=3;S.sleep='camp';`);only();
 const missing=()=>J(app,`audit().miss.map(m=>m.t)`);
 check(missing().includes('Shelter'),'M6 base: no shelter is reported');
 app.run(`addKitItem('Tarp','Sleep',1.5,0.5,0,0)`);only();
 check(!missing().includes('Shelter'),'M6 a Tarp added from Kit search counts as shelter');
 check(J(app,`isEssentialNow(KIT.find(k=>k.name==='Tarp').id)`)===true,'M6 the only shelter is essential, so the overflow fix keeps it');
 app.run(`addKitItem('Cable lock','Repair',0.4,0.4,20,0)`);
 check(!J(app,`audit().miss.map(m=>m.t)`).includes('Bike lock'),'M6 a Cable lock counts as a lock');
 app.run(`addKitItem('Winter gloves','Wear',0.5,0.15,0,0)`);
 check(!J(app,`audit().miss.map(m=>m.t)`).includes('Long gloves'),'M6 Winter gloves count as gloves');
 app.run(`addKitItem('Sunscreen stick','Person',0.08,0.05,0,0)`);
 app.run(`S.month=5`);
 check(!J(app,`audit().miss.map(m=>m.t)`).includes('Sunscreen'),'M6 a Sunscreen stick counts as sunscreen');
 app.run(`addKitItem('CO2 inflator','Repair',0.05,0.04,0,0)`);
 check(!J(app,`audit().miss.map(m=>m.t)`).includes('Pump'),'M6 a CO2 inflator counts as a pump');
}
// [LC-FIX-M8] Ids from long or non-Latin custom names always pass the loader's id test, even when names collide.
{const app=fresh();
 const ok=id=>/^x_[a-z0-9_]{0,80}$/.test(id);
 const long='a'.repeat(95);
 const ids=[app.run(`addKitItem(${JSON.stringify(long+' one')},'Person',1,1,0,0)`),app.run(`addKitItem(${JSON.stringify(long+' two')},'Person',1,1,0,0)`),app.run(`addKitItem(${JSON.stringify(long+' three')},'Person',1,1,0,0)`)];
 check(ids.every(i=>typeof i==='string'&&ok(i)),'M8 long names: '+ids.join(','));
 check(new Set(ids).size===3,'M8 ids stay distinct');
 const cjk='水'.repeat(40);
 const c=[app.run(`addKitItem(${JSON.stringify(cjk+'一')},'Person',1,1,0,0)`),app.run(`addKitItem(${JSON.stringify(cjk+'二')},'Person',1,1,0,0)`)];
 check(c.every(i=>typeof i==='string'&&ok(i))&&c[0]!==c[1],'M8 non-Latin names: '+c.join(','));
}
// [LC-FIX-M7] The "nights changed" explanation uses the kit each night count would really have, not today's kit for both.
{const app=fresh();
 app.run(`S.sleep='camp';S.nights=2;applyTripKitDefaults();`);
 const whenTwo=J(app,`snapshotAt(2)`);
 app.run(`S.nights=6;applyTripKitDefaults();`);
 const fromSix=J(app,`snapshotAt(2)`);
 check(JSON.stringify(whenTwo)===JSON.stringify(fromSix),'M7 the earlier trip is described with its own kit: '+whenTwo.kit+' vs '+fromSix.kit);
 check(!/changes nothing about what fits/.test(app.run(`nightsNote(2,6)`))||J(app,`snapshotAt(2).kit`)===J(app,`snapshotAt(6).kit`),'M7 a different kit is not reported as no change');
}
// [LC-FIX-kit-3] The weather kit promised on the Trip step (rain trousers, a warmer sleep system) is checked too.
{const app=fresh();
 app.run(`S.nights=4;S.sleep='camp';tripClimate=()=>({nightCold:-3,nightMean:0,dayMean:8,dayHot:12,rainDays:20,wetChance:67,source:'test'});`);
 app.run(`KIT.forEach(k=>{if(!k.added)chooseKitItem(k.id,['quilt','tent','pad'].includes(k.id));})`);
 let miss=J(app,`audit().miss`);
 check(miss.some(m=>m.t==='Rain trousers'&&m.ids.includes('rainpants')),'kit-3 rain trousers are asked for in a wet place');
 check(miss.some(m=>m.t==='A warmer sleep system'&&m.ids.includes('liner')),'kit-3 a warmer sleep system is asked for below 2 °C');
 app.run(`chooseKitItem('rainpants',true);chooseKitItem('liner',true)`);
 miss=J(app,`audit().miss.map(m=>m.t)`);
 check(!miss.includes('Rain trousers')&&!miss.includes('A warmer sleep system'),'kit-3 selecting them clears both');
}
// [LC-FIX-kit-6] Camping-only items that this trip does not count get no leave-behind advice.
{const app=fresh();
 app.run(`S.nights=2;S.sleep='indoor';['camp','pillow','tent','bivy','stove'].forEach(id=>chooseKitItem(id,true));`);
 const cut=J(app,`audit().cut.map(c=>c.t)`);
 check(!cut.includes('Camp clothes')&&!cut.includes('Inflatable pillow')&&!cut.includes('One of your two shelters')&&!cut.includes('Stove and pot'),'kit-6 no advice about camping kit on an accommodation trip: '+cut.join('|'));
 app.run(`S.sleep='camp'`);
 check(J(app,`audit().cut.map(c=>c.t)`).includes('Camp clothes'),'kit-6 the same advice returns when camping');
}
// [LC-FIX-kit-7] Audit messages quote the real figures: riding days from nights, and the litres of the item as chosen.
{const app=fresh();
 app.run(`S.nights=3;S.sleep='camp';tripClimate=()=>({nightCold:8,nightMean:10,dayMean:15,dayHot:20,rainDays:12,wetChance:40,source:'test'});`);
 app.run(`chooseKitItem('rain',false);chooseKitItem('towel',true);chooseKitItem('nice',true);S.custom.towel={L:0.8,kg:0.2,rigid:0};S.qty.base2=2;chooseKitItem('base2',true);`);
 const au=J(app,`audit()`);
 const rain=au.miss.find(m=>m.t==='Rain jacket');
 check(rain&&/Over 4 days/.test(rain.d),'kit-7 3 nights are 4 days: '+(rain&&rain.d));
 const towel=au.cut.find(m=>m.t==='Travel towel'),nice=au.cut.find(m=>m.t==='The decent outfit'),base2=au.cut.find(m=>m.t==='Second spare base layer');
 check(towel&&/0\.8 L back/.test(towel.d),'kit-7 the towel saves its own size: '+(towel&&towel.d));
 check(nice&&new RegExp(app.run(`itemL(kitById('nice')).toFixed(1)`)+' L').test(nice.d),'kit-7 the outfit quotes its own litres: '+(nice&&nice.d));
 check(base2&&new RegExp('Saves '+app.run(`itemL(kitById('base2')).toFixed(1)`)+' L').test(base2.d),'kit-7 two spare layers save the real litres: '+(base2&&base2.d));
 app.run(`S.nights=7`);
 check(/8 days/.test(J(app,`audit().miss.find(m=>m.t==='Travel detergent')?.d||''`)),'kit-7 detergent counts days not nights');
}
// [LC-FIX-kit-8] The hanger and medication findings can be cleared when they do not apply, so 'Ready to pack' is reachable.
{const app=fresh();
 app.run(`S.nights=8;S.sleep='indoor';S.kitTouched={};S.kit.hanger=false;`);
 const names=()=>J(app,`audit().miss.map(m=>m.t)`);
 check(names().includes('Spare derailleur hanger')&&names().includes('Your own medication'),'kit-8 both are reported at first');
 check(J(app,`audit().miss.filter(m=>m.t==='Spare derailleur hanger'||m.t==='Your own medication').every(m=>m.na)`),'kit-8 both offer "does not apply"');
 app.run(`chooseKitItem('hanger',false);chooseKitItem('meds',false);`);
 check(!names().includes('Spare derailleur hanger')&&!names().includes('Your own medication'),'kit-8 a deliberate "does not apply" clears them: '+names().join('|'));
 app.run(`chooseKitItem('hanger',true)`);
 check(!names().includes('Spare derailleur hanger'),'kit-8 ticking it also clears it');
 check(/data-act="na"/.test(app.html)&&/btn\.dataset\.act === 'add'/.test(app.html),'kit-8 the page has the button and the handler');
 const others=names().filter(t=>!['Your own medication'].includes(t));
 check(others.every(t=>t!=='Spare derailleur hanger'),'kit-8 other findings are unaffected');
}
// [LC-FIX-M11] [LC-FIX-trip-3] [LC-FIX-trip-4] Reading a one-line trip description.
{const app=fresh();const P=t=>J(app,`parseTrip(${JSON.stringify(t)})`);
 let r=P('Cycling to Prague in June');
 check(r.from==='Prague'&&!r.to,'M11 "Cycling to Prague" is one place, not only a route end: '+JSON.stringify(r));
 r=P('Überlingen to Konstanz over four nights');
 check(r.from==='Überlingen'&&r.to==='Konstanz','M11 a start with an umlaut is kept: '+JSON.stringify(r));
 r=P('Österreich to Wien in six days');
 check(r.from==='Österreich'&&r.to==='Wien','M11 umlaut start, second case: '+JSON.stringify(r));
 r=P("In summer I'm cycling around Bergen");
 check(r.from==='Bergen','trip-3 a season and a verb phrase are not the place: '+JSON.stringify(r));
 r=P('A week in Bergen');
 check(r.from==='Bergen','trip-3 a duration is not the place: '+JSON.stringify(r));
 r=P('Two weeks riding to Verona');
 check(r.from==='Verona','trip-3 a verb phrase is not the place: '+JSON.stringify(r));
 r=P('Hotel trip to Lyon with both panniers');
 check(r.sleep==='indoor','trip-4 "both panniers" does not change where you sleep: '+JSON.stringify(r));
 r=P('We may go to Lyon in June');
 check(r.month===5,'trip-4 "may" the verb is not May: '+JSON.stringify(r));
 r=P('We may cycle to Lyon');
 check(r.month===undefined,'trip-4 "may" alone sets no month: '+JSON.stringify(r));
 r=P('Lyon in May');
 check(r.month===4,'trip-4 "in May" still is May');
 r=P('Twenty-one days to Verona');
 check(r.nights===20,'trip-4 twenty-one days is a long trip: '+JSON.stringify(r));
 r=P('Camping and hotels to Verona');
 check(r.sleep==='mixed','trip-4 camping and hotels is mixed: '+JSON.stringify(r));
}
// [LC-FIX-trip-6] The climate note never prints 'null' when only the route's high point has figures.
{const app=fresh();
 const line=app.run(`climateFigures({dayMean:null,dayHot:null,nightMean:3,nightCold:-1,rainDays:9})`);
 check(!/null|undefined|NaN/.test(line)&&/cold-night packing guide <b>-1°C/.test(line),'trip-6 no null in the climate line: '+line);
 const full=app.run(`climateFigures({dayMean:18,dayHot:24,nightMean:9,nightCold:5,rainDays:9})`);
 check(/Days around <b>18°C<\/b> · warm days to 24°C · average night <b>9°C<\/b>/.test(full),'trip-6 full figures unchanged: '+full);
}
// [LC-FIX-trip-5] Sunscreen and sunglasses reminders follow the sun of the hemisphere the trip is in.
{const app=fresh();
 app.run(`S.nights=3;S.sleep='indoor';S.month=0;KIT.forEach(k=>{if(!k.added)chooseKitItem(k.id,false);});`);
 const miss=()=>J(app,`audit().miss.map(m=>m.t)`);
 app.run(`S.place={name:'Hobart',lat:-42.9,lon:147.3}`);
 check(miss().includes('Sunscreen')&&miss().includes('Sunglasses'),'trip-5 January in Tasmania is summer');
 app.run(`S.place={name:'Bergen',lat:60.4,lon:5.3}`);
 check(!miss().includes('Sunscreen')&&!miss().includes('Sunglasses'),'trip-5 January in Norway is not');
 app.run(`S.month=6;S.place={name:'Hobart',lat:-42.9,lon:147.3}`);
 check(!miss().includes('Sunscreen'),'trip-5 July in Tasmania is winter');
}
// [LC-FIX-trip-7] A failed weather lookup is not kept for the next visit.
{const app=fresh();
 const kept=J(app,`savedClimate({'50.00,8.00,5':{source:'failed'},'51.00,9.00,5':{source:'measured',nightCold:4}})`);
 check(!kept['50.00,8.00,5']&&kept['51.00,9.00,5'],'trip-7 failed entries are dropped, measured ones stay');
 check(JSON.stringify(J(app,`savedClimate(null)`))==='{}'&&JSON.stringify(J(app,`savedClimate('x')`))==='{}','trip-7 junk in the store gives an empty set');
 check(!/store\.set\(CLIMATE_KEY, CLIMATE\)/.test(app.html),'trip-7 nothing saves the raw set');
}
// [LC-FIX-trip-8] The "check again from" date names the year.
{const app=fresh();
 check(/2027/.test(app.run(`forecastDateLabel('2027-03-05',true)`))&&!/2027/.test(app.run(`forecastDateLabel('2027-03-05')`)),'trip-8 the year can be shown');
 app.run(`forecastSummary=()=>({status:'too-early',start:'2027-03-20'})`);
 check(/Check again from [^.]*2027/.test(app.run(`forecastStatusText()`)),'trip-8 the message carries the year: '+app.run(`forecastStatusText()`));
}
// [LC-FIX-routes-4] Choosing a place while a GPX is processing says so and resets the GPX button.
{const app=fresh();
 app.run(`renderClimate=()=>{};drawRig=()=>{};ensureClimate=()=>{};rememberPlace=()=>{};GPX_LOAD_PENDING=true;$('gpxPick').textContent='Cancel GPX loading';$('gpxMsg').textContent='Processing …';`);
 app.run(`setPlace(1,{name:'Ulm',lat:48.4,lon:9.99})`);
 check(app.nodes.get('gpxPick').textContent==='Upload a GPX instead','routes-4 the button no longer says Cancel: '+app.nodes.get('gpxPick').textContent);
 check(/cancel/i.test(app.nodes.get('gpxMsg').textContent)&&!/Processing/.test(app.nodes.get('gpxMsg').textContent),'routes-4 the message says loading was cancelled: '+app.nodes.get('gpxMsg').textContent);
}
// [LC-FIX-routes-5] The track name is the track's or route's own name, not a waypoint's or the author's.
{const app=fresh();
 const mk=(localName,children=[],textContent='')=>({localName,children,textContent});
 const nm=t=>mk('name',[],t);
 const wpt=mk('wpt',[nm('Cafe stop')]),author=mk('author',[nm('Sam Author')]),meta=mk('metadata',[author,nm('Export file')]),trk=mk('trk',[nm('Alps tour')]);
 const all=[wpt,meta,trk];
 app.context.__doc={all};app.context.__tags=(root,name)=>root.all.filter(e=>e.localName===name);
 check(app.run(`gpxNameFrom(__doc,__tags)`)==='Alps tour','routes-5 track name wins over waypoint and author');
 app.context.__doc={all:[wpt,meta]};
 check(app.run(`gpxNameFrom(__doc,__tags)`)==='Export file','routes-5 without a track name, the file title');
 app.context.__doc={all:[wpt,mk('metadata',[author])]};
 check(app.run(`gpxNameFrom(__doc,__tags)`)==='','routes-5 a waypoint or author is never the name');
}
// [LC-FIX-routes-6] The Start / End / Highest point buttons move the elevation chart's reading too.
{const app=fresh();
 const range={value:'0',setAttribute(){},oninput:null,onchange:null},readout={textContent:''};
 const panel={querySelector:sel=>sel==='#profileDistance'?range:sel==='#profileReadout'?readout:null};
 app.context.__panel=panel;
 app.nodes.set('routeVisuals',panel);app.run(`setRouteMapPoint=()=>{};ROUTE_VISUALS={profile:null,element:__panel};`);
 const pts=[];for(let i=0;i<=10;i++)pts.push({lat:50+i*0.01,lon:8,elev:100+(i===7?400:i*10),km:i});
 app.context.__profile={via:'GPX',pts,mapPts:pts,distanceKm:10,km:10};
 app.run(`bindElevationProfile(__profile)`);
 check(typeof panel.profileSelectKm==='function','routes-6 the chart offers a way to jump to a distance');
 panel.profileSelectKm(7);
 check(range.value==='700'&&/7\.00 km/.test(readout.textContent)&&/500 m/.test(readout.textContent),'routes-6 slider and readout follow: '+range.value+' / '+readout.textContent);
 check(/profileSelectKm\?\.\(point\.km\)/.test(app.html),'routes-6 the map buttons call it');
}
// [LC-FIX-M14] [LC-FIX-ui-inspector-2] "Look inside" brings the bike diagram into view and focus comes back to that button.
{const app=fresh();
 app.run(`S.bags=[{uid:1,pos:'seat',L:10}];S.kit={tent:true};`);
 const key=app.run(`currentPlan().slots[0].key`);
 const btn={tagName:'BUTTON',attributes:[],id:'',isConnected:true,closest:()=>null,contains:()=>false,hasAttribute:()=>false,getAttribute:()=>null};
 const rig=app.nodes.get('rigBox')||(app.run(`$('rigBox')`),app.nodes.get('rigBox'));let scrolled=0;
 rig.clientWidth=300;rig.scrollIntoView=()=>{scrolled++;};
 const result=app.run(`$('resultBox')`);result.contains=el=>el===btn;
 app.context.__btn=btn;
 app.run(`INSPECT[${JSON.stringify(key)}]={label:'Seat pack',box:{x:0,y:0,w:10,h:10},geom:{}};segmentArt=()=>'';focusControls=()=>[__btn];beginDialog=(root,modal,onClose,rf)=>{globalThis.__rf=rf;};`);
 app.run(`openBagPop(${JSON.stringify(key)},__btn)`);
 check(scrolled===1,'M14 the diagram is scrolled into view when opened from the list');
 const rf=app.context.__rf;
 check(rf&&rf.saved&&rf.saved.element===btn&&rf.root===result,'ui-inspector-2 focus returns to the Look inside button');
 scrolled=0;
 app.run(`openBagPop(${JSON.stringify(key)})`);
 check(scrolled===0,'M14 opened from the diagram nothing is scrolled');
}
// [LC-FIX-packing-7] A small overflow is not rounded to "0.0 L" in the Leave it behind advice.
{const app=fresh();
 check(app.run(`litresText(0.03)`)==='0.03'&&app.run(`litresText(0.09)`)==='0.09'&&app.run(`litresText(4.26)`)==='4.3'&&app.run(`litresText(12)`)==='12.0','packing-7 two decimals only when one would show 0.0');
 check(!/fix\.(started|remaining)\.toFixed\(1\)/.test(app.html),'packing-7 the advice uses it');
}
// [LC-FIX-packing-8] The food note does not claim food is carried when Food is unticked, and uses the food volume you set.
{const app=fresh();
 app.run(`S.nights=5;S.foodMode=2;chooseKitItem('food',true);S.custom.food={L:2,kg:0.7,rigid:0};`);
 let t=app.run(`foodSavingSentence()`);
 check(/saves 8\.0 L/.test(t)&&/2 days/.test(t),'packing-8 uses the food volume you set: '+t);
 app.run(`chooseKitItem('food',false)`);
 t=app.run(`foodSavingSentence()`);
 check(!/saves|carries food/.test(t)&&/not ticked/i.test(t),'packing-8 no claim when Food is unticked: '+t);
}
// [LC-FIX-ui-sections-reopen-1] A result section the rider closed stays closed after a recalculation.
{const app=fresh();
 const mk=(title,open)=>({querySelector:()=>({textContent:title}),hasAttribute:()=>open,setAttribute(){this.o=true;open=true;},removeAttribute(){this.o=false;open=false;},get isOpen(){return open;}});
 const before=[mk('Missing',false),mk('Where it goes',true)];      // the rider closed Missing (open by default) and left the other open
 const after=[mk('Missing',true),mk('Where it goes',false)];       // a fresh paint has the defaults
 app.context.__before=before;app.context.__after=after;
 app.context.__user=new Map([['Missing',false]]);
 app.run(`applySectionState(sectionStateOf(__before),__after,__user)`);
 check(after[0].isOpen===false&&after[1].isOpen===true,'ui-sections-reopen-1 the section the rider closed stays closed, an open one stays open');
 const extra=[mk('Missing',true),mk('Brand new',true)];app.context.__extra=extra;
 app.run(`applySectionState(sectionStateOf(__before),__extra,__user)`);
 check(extra[1].isOpen===true,'ui-sections-reopen-1 a section with no history keeps its default');
}
// [LC-FIX-ui-kitfind-1] Enter in a cleared kit search adds nothing from an earlier search.
{const app=fresh();
 let clicked=0;
 const out=app.run(`$('kitFindOut')`);out.querySelector=()=>({click(){clicked++;}});
 app.run(`$('kitFind').value=''`);
 check(app.run(`activateFirstKitFind()`)===false&&clicked===0,'ui-kitfind-1 an empty search ignores Enter');
 app.run(`$('kitFind').value='x'`);
 check(app.run(`activateFirstKitFind()`)===false&&clicked===0,'ui-kitfind-1 one letter is not a search either');
 app.run(`$('kitFind').value='tarp'`);
 check(app.run(`activateFirstKitFind()`)===true&&clicked===1,'ui-kitfind-1 a real search still takes Enter');
}
// [LC-FIX-ui-wording-1] Counts in the result text agree with their nouns.
{const app=fresh();
 check(app.run(`bagCount(1)`)==='1 bag'&&app.run(`bagCount(3)`)==='3 bags'&&app.run(`bagCount(0)`)==='0 bags','ui-wording-1 bag count');
 check(!/\$\{holding\} bags/.test(app.html),'ui-wording-1 the verdict does not print "1 bags"');
 app.run(`S.nights=1;S.sleep='camp';chooseKitItem('chamois',true);`);
 const chamois=J(app,`audit().cut.find(c=>c.t==='Chamois cream')`);
 check(chamois&&!/Two days/.test(chamois.d),'ui-wording-1 one night is not "two days": '+(chamois&&chamois.d));
}
// [LC-FIX-platform-4] The Nights field shows the number the app actually uses.
{const app=fresh();
 const n=v=>app.run(`nightsFromText(${JSON.stringify(v)})`);
 check(n('45')===30&&n('2.5')===2&&n('-3')===0&&n('')===0&&n('abc')===0&&n('7')===7&&n('30')===30,'platform-4 the number used for typed text');
 check(app.html.includes("$('nights').onchange = e => { e.target.value = String(S.nights);"),'platform-4 the field is rewritten when the entry is committed');
}
// [LC-FIX-platform-5] Moving between steps clears a "Sent" notice and keeps an unsent feedback draft.
{const app=fresh();
 const slot={dataset:{fb:'2'},innerHTML:'',querySelectorAll:()=>[]};
 app.context.document.querySelectorAll=sel=>sel==='.fbslot'?[slot]:[];
 app.run("let FB_DRAFT={step:null,text:''};"+pullFunction('renderFeedback')+';'+pullFunction('go')+';drawRig=()=>{};S.fbSent=2;S.fbOpen=null;renderFeedback()');
 check(/Sent/.test(slot.innerHTML),'platform-5 the notice shows right after sending');
 app.run(`go(1)`);
 check(!/Sent/.test(slot.innerHTML),'platform-5 leaving the step clears it: '+slot.innerHTML.slice(0,60));
 app.run(`S.fbOpen=2;renderFeedback()`);
 const box=app.nodes.get('fbtext');box.value='half a thought';
 app.run(`go(1)`);
 check(!/fbtext/.test(slot.innerHTML),'platform-5 the open box closes when you leave');
 box.value='';
 app.run(`S.fbOpen=2;renderFeedback()`);
 check(app.nodes.get('fbtext').value==='half a thought','platform-5 the unsent draft is back when you open it again: '+app.nodes.get('fbtext').value);
}
// [LC-FIX-platform-6] The privacy notice also says other routing services are asked when the first one answers without usable heights.
{const app=fresh();
 const at=app.html.indexOf('<b>BRouter, Valhalla, OSRM</b>');
 const note=app.html.slice(at,at+500);
 check(at>0&&/nicht\s+antwortet oder/.test(note)&&/H(ö|oe)hen/.test(note),'platform-6 the fallback sentence covers a missing height lookup: '+note.slice(0,200));
}
// [LC-FIX-platform-7] The browser's own controls (date picker button) follow the theme.
{const app=fresh();
 check(/:root\{\s*color-scheme:dark;/.test(app.html),'platform-7 dark theme declares color-scheme dark');
 check(/:root\[data-theme="light"\]\{\s*color-scheme:light;/.test(app.html),'platform-7 light theme declares color-scheme light');
}
check(html0.includes("back.hasAttribute('data-inspect-bag') && back.scrollIntoView"),'ui-inspector-2 closing the inspector brings the Look inside button back into view');
const pending=[];
//ASYNC
// [LC-FIX-M13] Retrying the cycling route while offline keeps the route that already works.
{const app=fresh();
 app.run(`S.place={name:'A',lat:50.1,lon:8.6};S.place2={name:'B',lat:50.9,lon:9.1};const k=routeKey(S.place,S.place2);ROUTE[k]={via:'estimate',km:120,ascent:800,pts:[{lat:50.1,lon:8.6,km:0,ele:100},{lat:50.9,lon:9.1,km:120,ele:150}],high:null};`);
 app.run(`renderClimate=()=>{};renderRoutePlan=()=>{};drawRig=()=>{};retryRoute()`);
 pending.push((async()=>{await new Promise(r=>setTimeout(r,300));
   check(app.run(`ROUTE[routeKey(S.place,S.place2)] && !ROUTE[routeKey(S.place,S.place2)].failed`),'M13 the working route is still there after a failed retry');
   check(app.run(`routeProfile()!==null`),'M13 the plan still has its route');
})());
}
// [LC-FIX-M12] A GPX without heights and with a short middle segment still gets its climbing.
pending.push((async()=>{const app=fresh();
 app.run(`elevationsFor=async pts=>pts.map(p=>200+Math.round((p.lat-50)*20000));`);
 const pts=[];
 for(let i=0;i<1000;i++){const mid=i>=600&&i<=602;pts.push({lat:50+i*0.0005,lon:8+(mid?0.5:0)+i*0.0003,elev:null,break:i===600||i===603});}
 app.context.__pts=pts;
 const out=await app.run(`gpxProfileFrom({pts:__pts.map(p=>({...p})),name:'t'})`);
 check(out&&out.segments===3,'M12 three segments: '+(out&&out.segments));
 check(out&&out.ascent!==null&&out.unavailableCount===0,'M12 climbing is available: ascent '+(out&&out.ascent)+', unavailable '+(out&&out.unavailableCount));
})());
// [LC-FIX-obs-bags] [LC-FIX-obs-june] [LC-FIX-obs-stop] The three walkthrough observations.
pending.push((async()=>{const app=fresh();
 app.context.__sig=new AbortController().signal;
 app.run(`S.bags=[]`);
 let pv=await app.run(`buildTripPreview({bags:[{pos:'frame',n:1}]},__sig)`);
 check(pv.bagMode==='replace','obs-bags with no bags chosen, the described bags are used');
 app.run(`S.bags=[{uid:1,pos:'seat',L:10}]`);
 pv=await app.run(`buildTripPreview({bags:[{pos:'frame',n:1}]},__sig)`);
 check(pv.bagMode==='keep','obs-bags with bags chosen, they are kept by default');
 check(/checked' : ''\}><span>Keep my current bags/.test(app.html)||/preview\.bagMode === 'keep' \? ' checked'/.test(app.html),'obs-bags the radio follows the default');
 check(/S\.month = new Date\(\)\.getMonth\(\);/.test(app.html),'obs-june a new plan starts in the current month');
 check(/st\.first \? 'start' : st\.last \? 'arriving' : 'suggested stop'/.test(app.html),'obs-stop the first row is the start');
})());
// [LC-FIX-M10] When storage is full, the saved-setups area does not claim "Saved in this browser".
pending.push((async()=>{const app=fresh();
 const ls=app.context.window.localStorage,real=ls.setItem.bind(ls);
 ls.setItem=()=>{throw new Error('QuotaExceededError');};
 const ok=await app.run(`store.set(SETUP_KEY,[{id:'a'}])`);
 check(ok===false,'M10 the write failed');
 await app.run(`store.get('loadcheck:something')`);   // a later read that works must not turn the note back
 check(/session only/i.test(app.run(`storageNote()`)),'M10 note after a failed setup write: '+app.run(`storageNote()`));
 ls.setItem=real;
 await app.run(`store.set(SETUP_KEY,[{id:'a'}])`);
 check(/Saved in this browser/.test(app.run(`storageNote()`)),'M10 and it says saved again after a write works');
})());
// [LC-FIX-storage-4] Importing the same export again does not add another "· imported" copy.
pending.push((async()=>{const app=fresh();
 app.run(`renderRecall=()=>{};renderBikeProfiles=()=>{};buildThumb=()=>'';S.bags=[{uid:1,pos:'seat',L:10}];S.kit={tent:true};SETUPS=[snapshotSetup('Alps','orig')];`);
 app.context.__exp=JSON.stringify({app:'load-check',setups:JSON.parse(app.run(`JSON.stringify(SETUPS)`)),feedback:[]});
 app.run(`SETUPS[0].note='changed here'`);
 await app.run(`importAll(__exp)`);
 check(app.run(`SETUPS.length`)===2,'storage-4 the first import of a changed setup adds one copy: '+app.run(`SETUPS.length`));
 const again=await app.run(`importAll(__exp)`);
 check(app.run(`SETUPS.length`)===2,'storage-4 the second import adds nothing: '+app.run(`SETUPS.length`)+' / '+again);
 await app.run(`importAll(__exp)`);
 check(app.run(`SETUPS.length`)===2&&app.run(`SETUPS.filter(s=>/imported/.test(s.name)).length`)===1,'storage-4 and the third neither');
})());
// [LC-FIX-platform-2] [LC-FIX-platform-3] The system theme is not part of a plan until the rider chooses one.
pending.push((async()=>{const app=fresh();
 const same=()=>app.run(`JSON.stringify(captureDraft())===DRAFT_BASELINE`);
 check(same(),'platform-2 a fresh page equals its baseline');
 app.run(`S.theme='light'`);   // what applyTheme does when a light-mode system opens the page for the first time
 check(same(),'platform-2 following the system theme does not make the plan "changed"');
 check(!('theme' in app.run(`draftSettings()`))&&app.run(`captureSettings().theme`)==='light','platform-3 the working plan records no theme until one is chosen (exports still do)');
 app.run(`THEME_CHOSEN=true`);
 check(app.run(`draftSettings().theme`)==='light'&&!same(),'platform-3 a chosen theme is recorded and counts as a change');
 check(app.html.includes('function setTheme(t){ THEME_CHOSEN = true;')&&app.html.includes("THEME_CHOSEN=t!=='auto';")&&app.html.includes('{ THEME_CHOSEN=true; S.theme=settings.theme;'),'platform-3 choosing, loading or importing a theme counts as a choice');
 check(app.html.includes('let DRAFT_BASELINE')&&app.html.includes('S.month = new Date().getMonth();')&&app.html.includes('DRAFT_BASELINE = JSON.stringify(captureDraft());'),'platform-2 the baseline is refreshed once the start month is set');
})());
Promise.all(pending).then(()=>console.log(JSON.stringify({status:'passed',checks})));
