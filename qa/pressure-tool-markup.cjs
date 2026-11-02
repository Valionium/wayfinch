// Structural HTML checks: source-only, without loading a local page.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(require('./paths.cjs').page,'utf8').split('<script>')[0];
const stack=[],ids=new Map(),elements=[],voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
for(const match of html.matchAll(/<\/?[a-zA-Z][\w:-]*(?:\s+[^<>]*?)?\s*\/?>/g)){
  const token=match[0],tag=token.match(/^<\/?([\w:-]+)/)[1].toLowerCase();
  if(token.startsWith('</')){
    const index=stack.map(node=>node.tag).lastIndexOf(tag);
    if(index>=0)stack.length=index;
    continue;
  }
  const id=token.match(/\bid="([^"]+)"/)?.[1],node={tag,id,parents:stack.map(parent=>parent.id).filter(Boolean),parentElements:[...stack],token};
  elements.push(node);
  if(id){assert.ok(!ids.has(id),'Duplicate ID: '+id);ids.set(id,node);}
  if(!voids.has(tag) && !token.endsWith('/>'))stack.push(node);
}
let checks=0;function check(value,message){assert.ok(value,message);checks++;}
const tool=ids.get('pressureToolBox');
check(tool && !tool.parents.some(id=>/^s[1-4]$/.test(id)),'tool must be independent of a planning step');
for(const id of ['pressureToolOpen','pressureToolFromCheck'])check(ids.get(id)?.token.includes('aria-controls="pressureToolBox"'),'opener controls shared tool: '+id);
check(ids.get('bikeDetailsOpen')?.token.includes('aria-controls="bikeDetailsBox"'),'the bike opener controls the Bike details dialog (Task 14 moved the editor out of the tyre tool)');
for(const id of ['bikeBaseKg','bikeWheel','bikeRim','bikeRimMm','bikeFrontMm','bikeRearMm','bikeFrontCasing','bikeRearCasing','bikeFrontMin','bikeFrontMax','bikeRearMin','bikeRearMax']){
  const node=ids.get(id);check(node?.parents.includes('bikeDetailsBox') && node.parents.includes('bikeProfileForm'),'hardware is in the profile form of the Bike details dialog: '+id);
  check(elements.some(element=>element.tag==='label' && element.token.includes('for="'+id+'"')),'hardware keeps its associated label: '+id);
}
for(const id of ['pressureRider','pressureMethod','pressureLoadedBike','pressureFront','pressureRear','pressureConfirmed']){
  const node=ids.get(id);check(node?.parents.includes('pressureToolBox') && !node.parents.includes('bikeProfileForm'),'pressure inputs are outside bike form: '+id);
}
check(!ids.get('packingChecklist').parents.includes('pressureToolBox'),'packing list stays in the main app');
check(ids.get('pressureToolClose')?.parents.includes('pressureToolBox') && !ids.get('pressureToolClose').parents.includes('pressureToolBody'),'close button remains outside scrollable body');
check(ids.get('pressureConfirmed')?.parents.includes('pressureResultFields'),'confirmation belongs to the optional result section');
check(ids.get('bikeWheel').tag==='select' && ids.get('pressureFront').tag==='input','control types remain intact');
check(ids.get('bikeBaseField').tag==='div' && ids.get('bikeBaseKg').parents.includes('bikeBaseField'),'bike-weight wrapper hides the whole field together');
const weightHelp=elements.find(element=>element.token.includes('data-info="What the bike weight includes"'));
check(weightHelp?.parents.includes('bikeBaseField') && !weightHelp.parentElements.some(parent=>parent.tag==='label'),'bike-weight help hides with its input and stays outside the label');
const rimHelp=elements.find(element=>element.token.includes('data-info="Measuring internal rim width"'));
check(rimHelp?.parentElements.some(parent=>parent.token.includes('class="bike-field-heading"')) && !rimHelp.parentElements.some(parent=>parent.tag==='label'),'rim-width help shares the field heading without activating the input label');
const casingHelp=elements.find(element=>element.token.includes('data-info="Tyre width and casing inputs"'));
check(casingHelp?.parentElements.some(parent=>parent.tag==='h4') && !casingHelp.parentElements.some(parent=>parent.token.includes('class="bike-profile-grid"')),'tyre-width and casing help sits in the section heading instead of a blank grid row');
check(!elements.some(element=>element.tag==='p' && element.token.includes('data-info=') && element.parents.includes('bikePressureFields')),'pressure field grid has no standalone icon-only paragraph cells');
console.log(JSON.stringify({suite:'pressure-tool-markup',checks,staticIds:ids.size}));
