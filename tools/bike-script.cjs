/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, so the QA suites (plain Node scripts) can require it too */
// The bag planner's bike module, /tools/bags/bike.js (spec section 7.4): one entry for the build and for Load Check's QA suites, so
// both run the same code. A classic script that sets window.WayfinchBike.
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const options={
  stdin:{
    contents:"import { bikeArt, DEFAULT_COLOURS, FADES, forkColours, nearestSwatchName, normaliseBike, oklabMedian, PAINT_WORDS, pairFor, PATTERN_LIST, resolveBikeSpec, SWATCHES } from './src/core/bike/planner.ts';\n"
      +'window.WayfinchBike = Object.freeze({ bikeArt, resolveBikeSpec, SWATCHES, nearestSwatchName, normaliseBike, oklabMedian, PATTERN_LIST, FADES, DEFAULT_COLOURS, PAINT_WORDS, forkColours, pairFor });\n',
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
let cached=null;
/** The script's text, built once per process (the QA suites build many pages). */
function bikeScriptSync(){
  if(cached===null)cached=Buffer.from(require('esbuild').buildSync(options).outputFiles[0].contents).toString('utf8');
  return cached;
}
module.exports={bikeScriptOptions:options,photoScriptOptions:photoOptions,bikeScriptSync};
