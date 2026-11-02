'use strict';
// Focused checks of emitted markup and scoped layout rules; no browser rendering.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM(),{run,nodes,context}=app;
let checks=0;
function check(condition,message){assert.ok(condition,message);checks++;}
function render(bags){
  context.qaBags=JSON.stringify(bags);
  run('S.bags=JSON.parse(qaBags);renderBags();');
  return nodes.get('bagList').innerHTML;
}
const seat=render([{uid:7,pos:'seat',L:10,longestCm:32}]);
check(/<div class="bag-help-line"><small class="bagcapacity" id="bagCapacity7">[^<]+<\/small> <span class="info-help">/.test(seat),'usable volume and its help share one compact row');
check(/id="bagVolume7"[^>]*aria-describedby="bagCapacity7"/.test(seat),'volume retains its usable-capacity description');
check(/<div class="baglength-caption"><label for="bagLength7">Inside length <span>\(optional\)<\/span><\/label> <span class="info-help">/.test(seat),'inside-length help sits beside the associated label');
check([...seat.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].every(match=>!/<button\b/.test(match[1])),'bag labels contain no nested help buttons');
check(/<div class="baglength-field"><input id="bagLength7"[^>]*value="32"[^>]*aria-describedby="bagLengthHelp7"><span>cm<\/span><small id="bagLengthHelp7">/.test(seat),'inside-length field and description remain associated');
check(seat.includes('class="reset bagreset"')&&/class="drop" aria-label="Remove [^"]+"/.test(seat),'reset and remove remain available');
check(seat.includes('class="stp" data-d="-1"')&&seat.includes('class="stp" data-d="1"'),'both volume controls remain available');
const bottle=render([{uid:8,pos:'bottle',slot:'dt',L:0.75}]);
check(bottle.includes('Bottle capacity')&&!bottle.includes('id="bagLength8"'),'bottles retain volume controls without inside-length inputs');
check(bottle.includes('id="bagCapacity8"')&&bottle.includes('class="drop"'),'bottle descriptions and removal remain available');
const pair=render([{uid:9,pos:'rack',L:15,pair:true}]);
check(pair.includes('per bag')&&pair.includes('data-opt="pair"')&&pair.includes('class="pairnote"'),'matched pairs retain quantity and per-bag information');
const css=app.html.slice(0,app.html.indexOf('</style>'));
check(/\.bagrow\{\s*display:flex;align-items:flex-start;gap:12px/.test(css),'desktop bag names align with the first measurement row');
check(/\.bagmeasure \.bag-help-line\{display:flex;align-items:center;gap:4px;min-width:0/.test(css),'bag capacity help reserves one inline row');
check(/\.bagmeasure \.bag-help-line small\{display:inline;min-width:0;margin:0/.test(css),'capacity text does not create a separate block row');
check(/\.bagrow\{display:grid;grid-template-columns:minmax\(0,1fr\) 44px;gap:10px\}/.test(css),'phone rows reserve a top-right remove column');
check(/\.bagrow \.drop\{grid-column:2;grid-row:1;margin:0;align-self:start\}/.test(css),'phone remove stays in the first row');
check(/\.bagrow \.bagmeasure\{grid-column:1 \/ -1;grid-row:2;width:100%\}/.test(css),'phone measurements use the width below the bag name');
console.log(JSON.stringify({suite:'bag-help-layout',checks,scope:'emitted markup and scoped CSS; no local browser rendering'}));
