// The bag planner's bike module, /tools/bags/bike.js (spec section 7.4): one entry for the build and for Load Check's QA suites, so
// both run the same code. A classic script that sets window.WayfinchBike.
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const options={
  stdin:{
    contents:"import { bikeArt, nearestSwatchName, normaliseBike, oklabMedian, resolveBikeSpec, SWATCHES } from './src/core/bike/index.ts';\n"
      +'window.WayfinchBike = Object.freeze({ bikeArt, resolveBikeSpec, SWATCHES, nearestSwatchName, normaliseBike, oklabMedian });\n',
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
let cached=null;
/** The script's text, built once per process (the QA suites build many pages). */
function bikeScriptSync(){
  if(cached===null)cached=Buffer.from(require('esbuild').buildSync(options).outputFiles[0].contents).toString('utf8');
  return cached;
}
module.exports={bikeScriptOptions:options,bikeScriptSync};
