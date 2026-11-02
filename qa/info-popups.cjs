'use strict';
// Source-level DOM/event checks. This suite never opens or renders the app in a browser.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),{run,context,nodes,events}=app;
let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const markup=app.html.slice(0,app.html.indexOf('<script>'));
const originalGet=context.document.getElementById;
function node(id){
  const el=originalGet(id);if(el.infoMock)return el;el.infoMock=true;
  const tag=markup.match(new RegExp('<([a-z]+)\\b([^>]*\\bid="'+id+'"[^>]*)>','i'));
  el.tagName=tag?.[1].toUpperCase()||'DIV';el.isConnected=true;el.inert=false;
  const classes=new Set(tag?.[2].match(/class="([^"]*)"/)?.[1].split(/\s+/)||[]),attrs=new Map([['id',id]]);
  el.classList={add(...values){values.forEach(value=>classes.add(value));},remove(...values){values.forEach(value=>classes.delete(value));},contains:value=>classes.has(value),
    toggle(value,force){const on=force??!classes.has(value);on?classes.add(value):classes.delete(value);return on;}};
  el.setAttribute=(key,value)=>{attrs.set(key,String(value));el.attributes=[...attrs].map(([name,value])=>({name,value}));};
  el.getAttribute=key=>attrs.get(key)??null;el.hasAttribute=key=>attrs.has(key);
  el.removeAttribute=key=>{attrs.delete(key);el.attributes=[...attrs].map(([name,value])=>({name,value}));};
  el.contains=other=>{for(let current=other;current;current=current.parentElement)if(current===el)return true;return false;};
  el.closest=selector=>{
    for(let current=el;current;current=current.parentElement){
      if(selector==='.hidden,[hidden],[inert]' && (current.classList?.contains('hidden')||current.inert))return current;
      if(selector==='details:not([open])' && current.tagName==='DETAILS'&&!current.open)return current;
      if(selector==='summary'&&current.tagName==='SUMMARY')return current;
      if(selector==='.info-help'&&current.classList?.contains('info-help'))return current;
      if(selector==='[data-info-title]'&&current.dataset?.infoTitle)return current;
      if(selector==='#calculationInfoClose'&&current.id==='calculationInfoClose')return current;
      if(selector==='#calculationInfoCopy [data-result-jump]'&&current.dataset?.resultJump&&node('calculationInfoCopy').contains(current))return current;
    }
    return null;
  };
  el.focus=()=>{if(!el.closest('.hidden,[hidden],[inert]'))context.document.activeElement=el;};
  el.querySelectorAll=selector=>selector.includes('button')?[...nodes.values()].filter(other=>other!==el&&el.contains(other)&&['BUTTON','INPUT','SELECT','TEXTAREA','A'].includes(other.tagName)):[];
  return el;
}
context.document.getElementById=node;
context.document.body.classList={add(){},remove(){},toggle(){},contains(){return false;}};
context.document.body.style.overflow='auto';
context.document.removeEventListener=(type,handler)=>{if(events.get(type)===handler)events.delete(type);};
const background=node('qaInfoBackground'),pressure=node('pressureToolBox'),info=node('calculationInfoBox');
for(const root of [background,pressure,info])root.parentElement=context.document.body;
context.document.body.children=[background,pressure,info];
const heading=node('calculationInfoTitle'),copy=node('calculationInfoCopy'),close=node('calculationInfoClose');
for(const el of [heading,copy,close])el.parentElement=info;
const pressureButton=node('qaPressureOpener');pressureButton.tagName='BUTTON';pressureButton.parentElement=background;
const pressureClose=node('pressureToolClose');pressureClose.parentElement=pressure;
const parentHeading=node('pressureToolTitle');parentHeading.parentElement=pressure;
function help(id,title,content,parent=background){
  const host=node(id+'Host');host.classList.add('info-help');host.parentElement=parent;
  const button=node(id);button.tagName='BUTTON';button.parentElement=host;button.dataset.infoTitle=title;
  const template={innerHTML:content};host.querySelector=selector=>selector==='template[data-info-content]'?template:null;
  return button;
}
const mainHelp=help('qaMainInfo','Why bags use less space','<p>Current allowance: <b>85%</b>.</p>');
const nestedHelp=help('qaNestedInfo','Loaded weight breakdown','<p>Selected kit: <b>6.3 kg</b>.</p>',pressure);
context.qaMainInfo=mainHelp;context.qaNestedInfo=nestedHelp;context.qaPressureOpener=pressureButton;
const click=target=>{let prevented=false;events.get('click')({target,preventDefault(){prevented=true;}});return prevented;};
const key=(value,shiftKey=false)=>{let prevented=false,stopped=false;events.get('keydown')({key:value,shiftKey,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});return {prevented,stopped};};

context.qaInfoTitle='Bag <size> "quoted" & apostrophe\'s';
const escaped=run(`infoHelp(qaInfoTitle, '<p>Prepared <b>trusted HTML</b>.</p>')`);
check(escaped.includes('data-info-title="Bag &lt;size&gt; &quot;quoted&quot; &amp; apostrophe&#39;s"'),'helper escapes dynamic title in attributes');
check(escaped.includes('aria-label="Bag &lt;size&gt; &quot;quoted&quot; &amp; apostrophe&#39;s"'),'helper supplies escaped accessible name');
check(/type="button"/.test(escaped)&&/aria-haspopup="dialog"/.test(escaped)&&/aria-controls="calculationInfoBox"/.test(escaped)&&/aria-expanded="false"/.test(escaped),'helper provides dialog semantics without submitting a form');
check(/<svg[^>]*aria-hidden="true"/.test(escaped)&&/<circle cx="12" cy="12" r="9"/.test(escaped),'conventional circled info icon is decorative beside the accessible button');
check(/<template data-info-content><p>Prepared <b>trusted HTML<\/b>\.<\/p><\/template>/.test(escaped),'explanation stays in an inert template until opened');
check(/id="calculationInfoTitle" tabindex="-1"/.test(markup)&&/id="calculationInfoClose" aria-label="Close explanation"/.test(markup),'shared pop-up includes focusable heading and named close button');
check(Number(app.html.match(/\.info-box\{[^}]*z-index:(\d+)/)?.[1])>1200&&/button\.info-button\{[^}]*min-width:44px;min-height:44px/.test(app.html),'help has touch-sized controls above existing dialogs');

context.document.activeElement=mainHelp;
check(click(mainHelp),'delegated info click prevents default');
check(!info.classList.contains('hidden')&&info.getAttribute('role')==='dialog'&&info.getAttribute('aria-modal')==='true','main-step help opens a modal');
check(heading.textContent==='Why bags use less space'&&copy.innerHTML.includes('85%'),'popup reads the selected explanation only');
check(mainHelp.getAttribute('aria-expanded')==='true'&&context.document.activeElement===heading,'opening marks expanded state and focuses title');
check(background.inert&&pressure.inert&&!info.inert&&context.document.body.style.overflow==='hidden','modal isolates background while keeping its own controls live');
close.focus();
check(key('Tab').prevented&&context.document.activeElement===close,'Tab on final popup control cycles within the popup');
check(key('Tab',true).prevented&&context.document.activeElement===close,'Shift Tab cycles within the popup');
check(key('Escape').prevented,'Escape closes info dialog');
check(info.classList.contains('hidden')&&copy.innerHTML===''&&mainHelp.getAttribute('aria-expanded')==='false','close clears popup content and expanded state');
check(!background.inert&&!pressure.inert&&context.document.body.style.overflow==='auto'&&context.document.activeElement===mainHelp,'close restores original background, scroll and opener focus');

run('beginDialog(document.getElementById("pressureToolBox"),true,()=>endDialog(document.getElementById("pressureToolBox")),qaPressureOpener)');
pressure.classList.remove('hidden');
check(info.inert&&background.inert&&!pressure.inert,'parent pressure modal initially isolates hidden info sibling');
context.document.activeElement=nestedHelp;click(nestedHelp);
check(run('DIALOGS.length')===2&&background.inert&&pressure.inert&&!info.inert,'nested help temporarily activates its root and isolates pressure controls');
check(context.document.activeElement===heading&&copy.innerHTML.includes('6.3 kg'),'nested help remains focusable with the correct explanation');
check(key('Escape').prevented&&run('DIALOGS.length')===1,'Escape closes only the top nested explanation');
check(!pressure.inert&&info.inert&&background.inert&&context.document.body.style.overflow==='hidden','closing nested help restores parent modal isolation');
check(context.document.activeElement===nestedHelp,'nested close restores focus to its pressure-tool info button');
click(nestedHelp);click(info);
check(run('DIALOGS.length')===1&&info.classList.contains('hidden')&&context.document.activeElement===nestedHelp,'clicking info backdrop closes only info and restores parent focus');
click(nestedHelp);click(close);
check(run('DIALOGS.length')===1&&context.document.activeElement===nestedHelp,'named close control works inside another modal');
run('endDialog(document.getElementById("pressureToolBox"))');pressure.classList.add('hidden');
check(run('DIALOGS.length')===0&&!info.inert&&!background.inert&&context.document.body.style.overflow==='auto'&&context.document.activeElement===pressureButton,'closing parent restores original page interaction and opener focus');

click(mainHelp);mainHelp.isConnected=false;run('closeCalculationInfo()');
check(context.document.activeElement===node('stepTitle'+run('S.step')),'rerendered opener returns focus to the active step heading');mainHelp.isConnected=true;
const inertHost=node('qaStaticInfo');inertHost.innerHTML='<p>Explanation <b>with emphasis</b>.</p>';inertHost.setAttribute('data-info','How a size is checked');
context.document.querySelectorAll=selector=>selector==='[data-info]'?[inertHost]:[];run('initialiseCalculationInfo()');
check(!inertHost.hasAttribute('data-info')&&inertHost.innerHTML.includes('<template data-info-content><p>Explanation <b>with emphasis</b>.</p>'),'static explanatory text converts once without losing content');

run('DRAFT_READY=true;S.tyrePressure=normaliseTyrePressure({method:"weighed",riderKg:75,loadedBikeKg:25});');
const before=run('JSON.stringify(S)'),weights=run('JSON.stringify(loadedSystemWeight())');
run('renderPressureHelper();bagCapacityHelp({pos:"seat",L:10});');
check(run('JSON.stringify(S)')===before&&run('JSON.stringify(loadedSystemWeight())')===weights,'rendering explanation templates never changes packing or weight calculations');
check(node('pressureWeightHint').innerHTML.includes('<template data-info-content>')&&node('pressureWeightSummary').innerHTML.includes('Total loaded system: <strong>100 kg</strong>'),'pressure methodology is hidden while actual loaded-weight result remains visible');
const dynamicBag=run('bagCapacityHelp({pos:"seat",L:10})');
const dynamicHelp=help('qaBagInfo','How usable bag space is counted',dynamicBag.match(/<template data-info-content>([\s\S]*)<\/template>/)[1]);
click(dynamicHelp);
check(copy.innerHTML.includes(Math.round(run('packEff()')*100)+'%'),'opening calculated bag-space help displays the current packing allowance');
run('closeCalculationInfo()');
check(run('JSON.stringify(S)')===before&&run('JSON.stringify(loadedSystemWeight())')===weights,'opening and closing calculated help never changes the plan or weight result');
run('ensureForecast=()=>{};');
const confidence=run('resultConfidence(tripClimate())');
check(/<h3 id="confidenceTitle">How this was checked<\/h3>/.test(confidence)&&confidence.includes('<template data-info-content><dl class="confidencegrid">'),'minimized final-step check retains detailed methodology in the info popup');

const checklist=node('packingChecklist');let disclosure=null,checkInputs=[];
let checklistHTML='';Object.defineProperty(checklist,'innerHTML',{configurable:true,get(){return checklistHTML;},set(value){
  checklistHTML=value;disclosure=/<details class="packing-disclosure"([^>]*)>/.test(value)?{open:/\bopen\b/.test(value.match(/<details class="packing-disclosure"([^>]*)>/)[1])}:null;
  checkInputs=[...value.matchAll(/<input type="checkbox" data-checklist-item="([^"]+)"[^>]*>/g)].map(match=>({dataset:{checklistItem:match[1]},checked:/ checked/.test(match[0]),focus(){context.document.activeElement=this;}}));
}});
checklist.querySelector=selector=>selector==='.packing-disclosure'?disclosure:null;
checklist.querySelectorAll=selector=>selector==='[data-checklist-item]'?checkInputs:[];
run('renderPackingChecklist()');
check(disclosure!==null&&!disclosure.open,'packing checklist is collapsed by default');
check(checklistHTML.includes('of '+run('getChecklistModel().totals.items')+' packed')&&/class="packing-progress"/.test(checklistHTML),'collapsed summary retains packed count and expanded content retains full progress');
const printBefore=node('printChecklist').innerHTML;
check(printBefore.includes('class="print-item"')&&!printBefore.includes('<details')&&!printBefore.includes('<template'),'print output contains the full selected list independent of screen collapse');
disclosure.open=true;run('renderPackingChecklist()');
check(disclosure.open&&checklistHTML.includes('<details class="packing-disclosure" open>'),'checklist stays expanded during rerender');
check(node('printChecklist').innerHTML===printBefore,'expanding screen checklist leaves printed output unchanged');
disclosure.open=false;run('renderPackingChecklist()');
check(!disclosure.open,'checklist also preserves user-selected collapsed state');
disclosure.open=true;node('packingUnpackedOnly').onchange({target:{checked:true}});
check(disclosure.open&&run('CHECKLIST_UNPACKED_ONLY'),'changing checklist filter preserves expanded state');
check(node('printChecklist').innerHTML===printBefore,'screen filter leaves the complete printable list unchanged');
console.log(JSON.stringify({suite:'info-popups',checks,scope:'source-level DOM and event simulation; no local browser rendering'}));
