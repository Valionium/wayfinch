'use strict';
// Bikes across both pages (spec 7.1 "Bikes", 11.4): the page's own reader against bike.js's, which is the app's, on the shared sample.
// The 200 generated libraries and the drawing set run in Vitest (tests/unit/contracts/bike.test.ts) on this same page code.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {appVM}=require('./app-vm.cjs');
const sample=JSON.parse(fs.readFileSync(path.join(__dirname,'..','contracts','bike-library','sample.json'),'utf8'));
let passed=0;
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
const {run,context}=appVM();
context.qaText=JSON.stringify(sample);
run('var qaSample=JSON.parse(qaText);'); // parsed in the page's own realm, as its storage reads are

test('[C-BIKE-SAMPLE] the page reads the sample as bike.js does: every field, none, and invalid values that drop only themselves',()=>{
  assert.equal(sample.length,3);
  const mine=run('JSON.stringify(qaSample.map(normaliseBikeProfile))');
  const theirs=run('JSON.stringify(qaSample.map(window.WayfinchBike.normaliseBike))');
  assert.equal(mine,theirs);
  const [full,plain,odd]=JSON.parse(mine);
  assert.deepEqual(full,sample[0],'every field kept');
  assert.equal(plain.look,null);assert.equal(plain.fit,null);
  assert.equal(odd.look.colour,null);assert.equal(odd.fit.style,'unknown');assert.equal(odd.maxWeight,null);assert.equal(odd.wings,undefined);
});

test('[DF-02] a saved library goes through the page and bike.js unchanged in both directions',()=>{
  const once=run('JSON.stringify(qaSample.map(normaliseBikeProfile).filter(Boolean).map(window.WayfinchBike.normaliseBike).map(normaliseBikeProfile))');
  assert.equal(once,run('JSON.stringify(qaSample.map(normaliseBikeProfile))'));
});

for(const [name,fn] of tests){fn();passed++;console.log('ok',name);}
console.log(`${passed} bike contract tests passed`);
