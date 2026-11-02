// Source-level CSS regression check. No local HTML or browser is loaded.
// This resolves the specific global-input/confirmation-checkbox cascade that
// caused the full-width checkbox to squeeze the confirmation into single letters.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('./paths.cjs').page,'utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g,'');
const rules=[];
for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const declarations={};
  for(const declaration of match[2].split(';')){
    const colon=declaration.indexOf(':');if(colon<0)continue;
    declarations[declaration.slice(0,colon).trim()]=declaration.slice(colon+1).trim();
  }
  for(const selector of match[1].trim().split(','))rules.push({selector:selector.trim(),declarations});
}
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const rule=selector=>Object.assign({},...rules.filter(r=>r.selector===selector).map(r=>r.declarations));
const specificity=selector=>[(selector.match(/#[\w-]+/g)||[]).length,
  (selector.match(/\.[\w-]+|\[[^\]]+\]/g)||[]).length,
  selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g,'').trim().split(/\s+/).filter(Boolean).length];
const checkboxSelectors=new Set(['input','input[type=checkbox]','.pressure-check input','.pressure-check input[type=checkbox]']);
function checkboxCascade(property){
  const candidates=rules.map((r,order)=>({...r,order})).filter(r=>checkboxSelectors.has(r.selector)&&r.declarations[property]);
  candidates.sort((a,b)=>{
    const x=specificity(a.selector),y=specificity(b.selector);
    return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]||a.order-b.order;
  });
  return candidates.at(-1)?.declarations[property];
}
check(rule('input').width==='100%','regression fixture still includes the global full-width input rule');
check(checkboxCascade('width')==='20px','checkbox overrides the actual global 100% width');
check(checkboxCascade('height')==='20px'&&checkboxCascade('min-width')==='20px','checkbox keeps its own bounded dimensions');
check(checkboxCascade('padding')==='0','checkbox does not inherit text-input padding');
check(rule('.pressure-check').display==='grid','confirmation text has its own grid track');
check(rule('.pressure-check')['grid-template-columns']==='20px minmax(0,1fr)','text receives all remaining width rather than competing with a full-width checkbox');
check(rule('.pressure-check span')['min-width']==='0'&&rule('.pressure-check span')['white-space']==='normal','confirmation span can wrap inside the remaining track');
check(rule('.pressure-check span')['word-break']==='normal'&&rule('.pressure-check span')['overflow-wrap']==='break-word','normal words stay together instead of breaking every character');
for(const selector of ['.route-map-outline-note a','.route-map-outline-note a:visited','.findnote a','.findnote a:visited']){
  check(rule(selector).color==='var(--sage)','external attribution link has theme-aware contrast: '+selector);
  check(rule(selector)['text-decoration']==='underline','link remains identifiable without relying on colour: '+selector);
}
check(rule('.route-map-block .leaflet-control-attribution a').color==='#1e4e80','white Leaflet attribution bar retains its contrasting dark blue link');
const luminance=hex=>{
  const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const palettes=[rule(':root'),rule(':root[data-theme="light"]')];
for(const palette of palettes)check(contrast(palette['--sage'],palette['--panel'])>=4.5,'attribution link colours clear 4.5:1 in both themes');
console.log(JSON.stringify({status:'passed',checks,note:'Source-level selector/cascade and colour checks; visual layout needs the published app.'}));
