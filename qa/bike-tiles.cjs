'use strict';
// Bike details as tiles (the owner's wish of 14 Nov 2026): under More details, a grid of eight tiles of a word or two, each opening only
// its own group of fields; brake type and brake fluid are details of the bike (Brakes and gears), not of the repair kit. Only the
// grouping and the opening change: every field keeps its id, its options, its label and the way it is read and saved.
// The browser side (opening, focus, widths, themes, an old bike) is tests/e2e/app-bike-tiles.spec.ts. Nothing of the page is printed.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {appVM}=require('./app-vm.cjs');
const app=appVM();let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const html=app.html;
const dlg=html.slice(html.indexOf('id="bikeDetailsBox"'),html.indexOf('id="maxWeightBox"'));
const more=dlg.slice(dlg.indexOf('id="bikeMoreDetails"'));

const TILES=[['bikeBrakesSection','Brakes and gears'],['bikeWheelsSection','Wheels and tyres'],['bikeFrameSection','Frame and fork'],
  ['bikeBoltsSection','Bolts and mounts'],['fitMeasureBox','Measurements'],['bikeMaxWeightSection','Weights'],['bikeRepairFields','Repair kit'],
  ['bikeLibraryPanel','Saved bikes']];
const GROUPS={
  bikeBrakesSection:['bikeBrakes','bikeRimBrake','bikeBrakeFluid','bikeDrive','bikeShifting'],
  bikeWheelsSection:['bikeTyres','bikeValve','bikeFrontTyre','bikeRearTyre','bikeAxle'],
  bikeFrameSection:['fitSizeLetter','fitSizeNumber','fitSizeUnit','bikeSuspension'],
  bikeBoltsSection:['fitBoltSt','fitBoltDt','fitBoltUn','fitTopTube','bikeRackMounts'],
  fitMeasureBox:['fitTriTop','fitTriSeat','fitTriDown','fitSeatGap','fitBarWidth'],
  bikeMaxWeightSection:['fitMaxWeight','fitMaxUnit','fitMaxIncludes','bikeBaseKg'],
  bikeRepairFields:['bikePads','bikeChain','bikeHanger','bikeNotes'],
  bikeLibraryPanel:['bikeName','bikeSavedSelect'],
};
const controls=text=>[...text.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>|<input\b[^>]*>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/g)].map(m=>m[0]);
const idOf=tag=>tag.match(/\sid="([^"]+)"/)[1];
/** A group's own markup: from its <details> to the next group, the end of the form or the end of More details. */
const panel=id=>{
  const start=more.indexOf(`<details class="bike-tool-optional bd-group" id="${id}"`);
  if(start<0)return '';
  const ends=[more.indexOf('<details class="bike-tool-optional bd-group"',start+1),more.indexOf('</form>',start),more.indexOf('<form id="bikeProfileForm">',start)].filter(i=>i>start);
  return more.slice(start,Math.min(...ends));
};

// [BK-TILES-GRID] eight tiles, each a button of a word or two that opens its own group; all of them before the groups, in More details
{
  const tiles=[...more.matchAll(/<button type="button" class="bd-tile" aria-expanded="false" aria-controls="([^"]+)"><span class="bd-name">([^<]+)<\/span><span class="bd-state"[^>]*><\/span><\/button>/g)].map(m=>[m[1],m[2]]);
  check(JSON.stringify(tiles)===JSON.stringify(TILES),'[BK-TILES-GRID] the eight tiles, in order, each naming its group: '+JSON.stringify(tiles));
  check(tiles.every(([,name])=>name.split(' ').length<=3),'[BK-TILES-GRID] each tile is a word or two');
  const grid=more.indexOf('id="bikeTiles"');
  check(grid>0 && TILES.every(([id])=>more.indexOf(`id="${id}"`)>grid),'[BK-TILES-GRID] the grid comes before every group');
  // the tiles show as soon as Bike details opens (the owner, 14 Nov 2026): no wrapper to open first, a heading that says they are optional
  check(/<section class="bike-more" id="bikeMoreDetails" aria-labelledby="bikeMoreTitle">\s*<h3 id="bikeMoreTitle">More details \(optional\)<\/h3>/.test(dlg) && !/<details[^>]*id="bikeMoreDetails"/.test(dlg),'[BK-TILES-GRID] the tiles show at once under the heading More details (optional), with no wrapper to open');
  check(!more.slice(0,grid).replace(/<!--[\s\S]*?-->/g,'').includes('<details'),'[BK-TILES-GRID] nothing that can stay closed is around the grid');
  check(more.slice(0,grid).includes('<p>Tap Use these bike details to plan with them. Saving the bike is optional; repair details can stay blank.</p>') && !dlg.includes('Choose Use these bike details to use them'),'[BK-TILES-GRID] the line before the tiles says plainly what to tap');
  for(const [id,name] of TILES){
    const p=panel(id);
    check(new RegExp(`^<details class="bike-tool-optional bd-group" id="${id}" aria-label="${name}"><summary>${name}</summary>`).test(p),`[BK-TILES-GRID] ${name} is a group closed by default, named as its tile`);
    check(p.includes(`<button type="button" class="linky bd-back" data-panel="${id}">Back to all details</button>`),`[BK-TILES-GRID] ${name} ends with Back to all details`);
  }
}
// [BK-TILES-GROUPS] each group holds exactly its own fields; brake type and fluid with the brakes, never under the repair kit
{
  for(const [id,ids] of Object.entries(GROUPS)){
    const got=controls(panel(id)).map(idOf);
    check(JSON.stringify(got)===JSON.stringify(ids),`[BK-TILES-GROUPS] ${id} holds ${ids.join(', ')}: ${got.join(', ')}`);
  }
  const repair=panel('bikeRepairFields');
  check(!repair.includes('id="bikeBrakes"') && !repair.includes('id="bikeBrakeFluid"') && panel('bikeBrakesSection').indexOf('id="bikeBrakeFluidField"')>panel('bikeBrakesSection').indexOf('id="bikeRimBrakeField"'),'[BK-TILES-GROUPS] Brake type and Brake fluid are under Brakes and gears, fluid after Rim brake type');
  check(Object.values(GROUPS).flat().length===34 && new Set(Object.values(GROUPS).flat()).size===34,'[BK-TILES-GROUPS] every one of the 34 fields is in one group');
  // the hints and the repair note go with their fields
  check(panel('bikeBoltsSection').includes('id="bikeRackMountsHint"') && panel('bikeWheelsSection').includes('id="bikeAxleHint"') && panel('bikeBrakesSection').includes('id="bikeBrakeFluidHint"'),'[BK-TILES-GROUPS] each hint sits with its field');
  check(panel('bikeRepairFields').includes('data-info="How a bike profile updates the kit"'),'[BK-TILES-GROUPS] the repair parts note is in Repair kit');
  check(panel('bikeMaxWeightSection').includes('id="bikeWeightFields"') && panel('bikeFrameSection').includes('For 2XS or 3XS choose XS'),'[BK-TILES-GROUPS] the bike weight is under Weights, the size note under Frame and fork');
}
// [BK-TILES-SAME] the 34 controls are byte for byte the ones before the tiles (id, type, options, limits), each once on the page
{
  const tags=controls(more).map(t=>[idOf(t),t]).sort((a,b)=>a[0]<b[0]?-1:1);
  const hash=crypto.createHash('sha256').update(JSON.stringify(tags)).digest('hex');
  check(hash==='6a620ec710dcb7a70e393c9cf93dda6c539393f36fe13d79ccb9f58a785a900f','[BK-TILES-SAME] the fields are those of before, unchanged: '+hash.slice(0,12));
  check(tags.every(([id])=>html.split(`id="${id}"`).length===2),'[BK-TILES-SAME] each field id is on the page once');
  check(app.run('JSON.stringify(Object.values(BIKE_PROFILE_INPUTS).sort())')===JSON.stringify(['bikeAxle','bikeBrakeFluid','bikeBrakes','bikeChain','bikeDrive','bikeFrontTyre','bikeHanger','bikeName','bikeNotes','bikePads','bikeRackMounts','bikeRearTyre','bikeRimBrake','bikeShifting','bikeSuspension','bikeTyres','bikeValve']),'[BK-TILES-SAME] the fields read and filled are the same');
}
// [BK-TILES-STATUS] a tile says Not set, or how many of its shown details are set; Saved bikes says how many are saved
{
  check(app.run('bikeTileStatus(0,5)')==='Not set' && app.run('bikeTileStatus(2,5)')==='2 of 5 set' && app.run('bikeTileStatus(5,5)')==='5 of 5 set','[BK-TILES-STATUS] Not set, or n of m set');
  check(app.run('bikeSavedStatus(0)')==='None saved' && app.run('bikeSavedStatus(1)')==='1 saved' && app.run('bikeSavedStatus(3)')==='3 saved','[BK-TILES-STATUS] Saved bikes: None saved, or n saved');
}
console.log(JSON.stringify({suite:'bike-tiles',checks}));
