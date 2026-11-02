'use strict';
// Task 16: fixes from the real-browser walkthrough and the fresh review. Each was a failing case before its fix.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM();let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const J=code=>JSON.parse(app.run(`JSON.stringify(${code})`)??'null');
// A kg figure from 250 to 400 is queried once; saving the same figure again keeps it (it could never be saved before).
check(app.run(`maxWeightIssue({v:300,u:'kg',includes:'bike'})`)==='Did you mean 300 lb (136 kg)?','LC-WT-09b first query');
check(app.run(`maxWeightIssue({v:300,u:'kg',includes:'bike'})`)==='','LC-WT-09b the same figure again is kept');
check(/Did you mean 350/.test(app.run(`maxWeightIssue({v:350,u:'kg',includes:'bike'})`)),'LC-WT-09b another figure is queried again');
// A stored item may name a unit only once, or both entries pass the room check and overfill the bag.
const norm=items=>J(`normalisePlacements({v:1,basis:{mode:'comfort',rackDeck:false,units:[['1-0','frame','',5,40]]},inUse:['1-0'],items:${JSON.stringify(items)}},new Set(['base1','tent']),new Set(['1-0']))`);
const once=norm({base1:[['1-0',1,0.5]]});
check(once&&once.items.base1,'BK-ST-dup an item with one entry per unit is kept');
const twice=norm({base1:[['1-0',1,0.5],['1-0',1,0.5]],tent:[['1-0',1,1]]});
check(twice&&!twice.items.base1&&twice.items.tent,'BK-ST-dup an item naming a unit twice drops, the rest stays');
// A frame size just outside the range is refused on screen, as the storage check would refuse it.
check(J(`sizeFromNumber('39.6','cm')`).message,'BK-UI-size 39.6 cm is refused');
check(J(`sizeFromNumber('70.4','cm')`).message,'BK-UI-size 70.4 cm is refused');
check(J(`sizeFromNumber('23.4','in')`).message,'BK-UI-size 23.4 in is refused');
check(J(`sizeFromNumber('40','cm')`).letter==='XS'&&J(`sizeFromNumber('54','cm')`).letter==='M','BK-UI-size the range ends still work');
// Page source: the "under the down tube" move is offered only while no bottle sits there; the unusable-bag note has no stray full stop.
check(/cages\.un && !S\.bags\.some\(x => x\.pos === 'bottleU'\)/.test(app.html),'BK-UI-fix under-down-tube move guarded');
check(/<b>\$\{spec\.reason\}\$\{spec\.assumed\?'[^']*':''\}\.<\/b> This bag stays/.test(app.html),'BK-UI-fix no stray full stop after the reason');
// Polish (owner, 30 October): wording and layout only.
check(app.run('BANK_SEAT_NOTE')==='Push it down the side, close to the seat post.','LC-POL-02 the power bank note does not repeat the name');
{const w=J(`weightCheck({carriedKg:4.3,unplacedKg:0,decksKg:0,waterKg:0,slots:[],byPositionKg:{}},{id:'p',maxWeight:{v:150,u:'kg',includes:'no-bike'},pressure:{}},null)`);
 check(w&&!/= /.test(w.sentence),'LC-POL-01 one part: no sum '+(w&&w.sentence));}
check(/\.alloc li>\.il\{flex:1;min-width:0;text-align:left\}/.test(app.html),'LC-POL-04 names are left-aligned');
check(/const onScreen=new Map\(\)/.test(app.html),'LC-POL-03 print follows the screen order');
console.log(JSON.stringify({status:'passed',checks}));
