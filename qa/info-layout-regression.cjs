'use strict';
// Targeted source/markup checks of the compact info layouts. No local browser rendering.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),{run,nodes}=app;
const markup=app.html.slice(0,app.html.indexOf('<script>'));
const css=markup.match(/<style>([\s\S]*?)<\/style>/)[1];
const visible=html=>html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/g,'');
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;}
function rule(selector){return css.match(new RegExp('(?:^|[}\\n])\\s*'+selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'))?.[1]||'';}

const host=rule('.info-help'),button=rule('button.info-button');
check(/position:relative/.test(host)&&/width:28px;height:28px/.test(host)&&/flex:0 0 28px/.test(host),'info wrapper reserves a compact fixed inline footprint');
check(/position:absolute;left:50%;top:50%;transform:translate\(-50%,-50%\)/.test(button)&&/width:44px;height:44px;min-width:44px;min-height:44px/.test(button),'actual info button retains a centered 44-pixel touch target');
check(/margin-top:8px/.test(rule('.bike-profile-field>input'))&&/margin-top:8px/.test(rule('.bagmeasure .bag-help-line'))&&/margin-top:8px/.test(rule('.baglength-field')),'field controls clear the info button eight-pixel vertical overhang');
check(/margin-top:8px/.test(rule('#departureDateHint,#nightsSuggestionHint'))&&/margin-top:8px/.test(rule('.bagmeasure .bagreset')),'trip hints and bottle reset controls clear adjacent info hit areas');
check(/gap:8px/.test(rule('.baglength-caption')),'inside-length help does not cover the right edge of the clickable field label');
check(/pointer-events:none/.test(rule('button.info-button svg'))&&/outline:2px solid var\(--blaze\)/.test(rule('button.info-button:focus-visible')),'icon clicks reach the button and keyboard focus remains visible');
check(/max-height:min\(560px,calc\(100vh - 32px\)\)/.test(rule('.info-card'))&&/max-height:min\(560px,calc\(100dvh - 32px\)\)/.test(rule('.info-card')),'desktop popup height is capped while respecting the viewport');
check(/\.info-card\{max-height:min\(560px,calc\(100vh - 16px\)\);max-height:min\(560px,calc\(100dvh - 16px\)\)\}/.test(css),'phone popup keeps a bounded height with smaller outer margins');
check(/overflow:auto;overscroll-behavior:contain;min-height:0/.test(rule('.info-copy'))&&/flex-shrink:0/.test(rule('.info-head')),'long explanations scroll inside the popup while its heading and close control stay available');
check(/display:block/.test(rule('.info-copy .confidencegrid>div'))&&/margin-bottom:14px/.test(rule('.info-copy .confidencegrid>div')),'How checked entries stack rather than squeezing headings into narrow columns');
check(/display:grid;grid-template-columns:minmax\(0,1fr\) auto 20px/.test(rule('.packing-disclosure>summary')),'desktop checklist title, count and disclosure marker occupy stable grid columns');
check(/\.packing-disclosure>summary em\{grid-column:1;grid-row:2;text-align:left\}/.test(css)&&/\.packing-disclosure>summary:after\{grid-column:2;grid-row:1 \/ span 2\}/.test(css),'phone progress occupies its own row beside a stationary disclosure marker');
check(/display:block/.test(rule('.firstfixes li>span'))&&/display:block;width:fit-content;margin:5px 0 0/.test(rule('.firstfixes li .linky')),'first-fix descriptions and actions remain separate blocks');
const fixes=run('firstFixes({weatherReady:false,miss:[{t:"Missing <kit>"}],over:false,fix:null,routeFailed:true,spill:[],stranded:[]})');
check([...fixes.matchAll(/<li>([\s\S]*?)<\/li>/g)].every(match=>/^<span>[\s\S]*<\/span><button\b/.test(match[1]))&&fixes.includes('Missing &lt;kit&gt;')&&fixes.includes('data-result-jump="missing"'),'real first-fix markup preserves readable blocks, escaped content and navigation');
const kitGroup=markup.match(/<div class="kit-size-controls">([\s\S]*?)<\/div>/)?.[1]||'';
check(/<button[^>]*id="advBtn"/.test(kitGroup)&&/<\/button><span data-info="How kit sizes are counted"/.test(kitGroup),'sizing control and its help stay in one group as separate elements');
check(/display:inline-flex;align-items:center;gap:8px;min-width:0/.test(rule('.kit-size-controls'))&&/flex-wrap:wrap;gap:10px/.test(rule('.advbar')),'group spacing accommodates the eight-pixel help hit-area overhang without covering adjacent controls');
check(![...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].some(match=>/data-info=|class="info-button"/.test(match[1])),'static help controls are outside input labels');

run('S.departureDate="";syncDepartureDate()');
let hint=nodes.get('departureDateHint').innerHTML;
check(visible(hint).startsWith('Leave blank to plan by month.')&&/class="info-button"/.test(hint)&&/<template data-info-content>/.test(hint),'blank-date runtime update preserves the short prompt and info control');
check(!/Forecasts cover|Seasonal conditions still/.test(visible(hint))&&/Forecasts cover up to 16 days/.test(hint),'runtime date updates keep forecast methodology in the popup template');
run('S.departureDate="2026-12-05";syncDepartureDate()');
hint=nodes.get('departureDateHint').innerHTML;
check(run('S.month')===11&&nodes.get('departureDate').value==='2026-12-05'&&visible(hint).startsWith('Seasonal month: December.'),'dated update still synchronizes the seasonal month and shows only its compact status');
run('syncDepartureDate();syncDepartureDate()');
check((nodes.get('departureDateHint').innerHTML.match(/class="info-button"/g)||[]).length===1,'repeated date synchronization does not duplicate the info control');
check(/for="departureDate"/.test(markup)&&/id="departureDate" aria-describedby="departureDateHint"/.test(markup),'date label and short description retain their input associations');
run('S.departureDate="invalid";syncDepartureDate()');
check(run('S.departureDate')===null&&visible(nodes.get('departureDateHint').innerHTML).startsWith('Leave blank to plan by month.'),'invalid restored date uses the concise blank-date prompt and retains help');
console.log(JSON.stringify({suite:'info-layout-regression',checks,scope:'source/markup checks; no local browser rendering'}));
