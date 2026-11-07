/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, so the QA suites (plain Node scripts) can require it too */
// The bag planner's bike module, /tools/bags/bike.js (spec section 7.4): one entry for the build and for Load Check's QA suites, so
// both run the same code. A classic script that sets window.WayfinchBike.
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const options={
  stdin:{
    contents:"import { bikeArt, DEFAULT_COLOURS, FADES, colourName, forkColours, nearestSwatchName, normaliseBike, oklabMedian, PAINT_WORDS, pairFor, PATTERN_LIST, resolveBikeSpec, SWATCHES } from './src/core/bike/planner.ts';\n"
      +'window.WayfinchBike = Object.freeze({ bikeArt, resolveBikeSpec, SWATCHES, nearestSwatchName, normaliseBike, oklabMedian, PATTERN_LIST, FADES, DEFAULT_COLOURS, PAINT_WORDS, forkColours, pairFor, colourName });\n',
    resolveDir:ROOT,
    sourcefile:'bike-entry.ts',
    loader:'ts',
  },
  absWorkingDir:ROOT,
  bundle:true,
  write:false,
  format:'iife',
  target:'es2020',
  platform:'browser',
  charset:'utf8',
  legalComments:'none',
  minify:true,
  logLevel:'silent',
};
// The photo colour picker (spec 7.4, "Colour from a photo"): /tools/bags/bike-photo.js, loaded on demand; window.WayfinchBikePhoto.
const photoOptions={...options,stdin:{...options.stdin,
  contents:"import { openPicker } from './src/ui/bike-photo/picker.ts';\n"+'window.WayfinchBikePhoto = Object.freeze({ openPicker });\n',
  sourcefile:'bike-photo-entry.ts'}};
// The Gear advisor's search (sub-project 13): /tools/bags/advisor.js, loaded only when the advisor opens; window.WayfinchAdvisor.
const advisorOptions={...options,stdin:{...options.stdin,
  contents:"import { advise, adviseSteps } from './src/core/advisor/search.ts';\nimport { DECIDED, MIN_GAIN_BACK_L, SIZE_RANGES, WEIGHTS } from './src/core/advisor/table.ts';\n"
    +'window.WayfinchAdvisor = Object.freeze({ adviseSteps, advise, WEIGHTS, SIZE_RANGES, MIN_GAIN_BACK_L, DECIDED });\n',
  sourcefile:'advisor-entry.ts'}};
let cached=null,cachedAdvisor=null;
/** The script's text, built once per process (the QA suites build many pages). */
function bikeScriptSync(){
  if(cached===null)cached=Buffer.from(require('esbuild').buildSync(options).outputFiles[0].contents).toString('utf8');
  return cached;
}
/** advisor.js's text, built once per process, for the QA suites' page VM (qa/app-vm.cjs). */
function advisorScriptSync(){
  if(cachedAdvisor===null)cachedAdvisor=Buffer.from(require('esbuild').buildSync(advisorOptions).outputFiles[0].contents).toString('utf8');
  return cachedAdvisor;
}
module.exports={bikeScriptOptions:options,photoScriptOptions:photoOptions,advisorScriptOptions:advisorOptions,bikeScriptSync,advisorScriptSync};
