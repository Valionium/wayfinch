'use strict';
// Task 21: two taps to start. Wording and layout of the Bike details dialog only; same fields, same bikeFit.
const assert=require('node:assert/strict');
const {appVM}=require('./app-vm.cjs');
const app=appVM();let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const html=app.html;
const J=code=>JSON.parse(app.run(`JSON.stringify(${code})`)??'null');
const dlg=html.slice(html.indexOf('id="bikeDetailsBox"'),html.indexOf('id="maxWeightBox"'));
const at=s=>dlg.indexOf(s);

// [BK-UI-07] the frame pictures and the size row are the Quick start; everything else comes after them. Since the owner's answer of
// 14 Nov 2026 ("All tiles at top") Bike details opens on its tiles, Quick start the first; a new bike opens at Quick start.
{
  const quick=at('id="bikeQuick"'),more=at('id="bikeMoreDetails"');
  check(quick>0&&more>quick,'BK-UI-07 the quick block comes first');
  check(at('id="fitStyleChoices"')>quick&&at('id="fitStyleChoices"')<more,'BK-UI-07 frame pictures are in the quick block');
  check(at('id="fitSizeChips"')>quick&&at('id="fitSizeChips"')<more&&at('id="fitQuickResult"')>quick&&at('id="fitQuickResult"')<more,'BK-UI-07 size row and result are in the quick block');
  check(/<details class="bike-tool-optional bd-group" id="bikeQuickGroup"[^>]*><summary>Quick start<\/summary>\s*<section class="bike-quick" id="bikeQuick"/.test(dlg) && at('aria-controls="bikeQuickGroup"')>0 && at('aria-controls="bikeQuickGroup"')<at('class="bd-tile" aria-expanded="false" aria-controls="bikeLookGroup"'),'BK-UI-07 the quick block is the Quick start tile, the first tile');
  for(const id of ['fitBoltSt','fitBoltDt','fitBoltUn','fitTopTube','fitMeasureBox','fitMaxWeight','bikeRepairFields','bikeLibraryPanel','bikeApply','bikeBaseKg'])
    check(at('id="'+id+'"')>more,'BK-UI-07 '+id+' sits under More details');
  check(app.run(`FIT_STYLES.length>=8`)&&app.run(`['XS','S','M','L','XL'].every(l=>fitSizeChipLetters().includes(l))`),'BK-UI-07 sizes XS to XL');
}
// [BK-UI-08] a plain estimate result, updating on each tap
{
  app.run(`fillFitFields(null);quickPickStyle('unknown');`);
  check(/Pick/.test(app.run(`fitQuickResultText()`)),'BK-UI-08 nothing chosen: an invitation, no numbers');
  app.run(`applyBikeDetails=async()=>true;quickPickStyle('diamond-level');quickPickSize('M');`);
  const a=app.run(`fitQuickResultText()`);
  check(/frame bag/i.test(a)&&/about 6 L/.test(a)&&/estimate/i.test(a)&&/bottle/i.test(a)&&/top-tube/i.test(a),'BK-UI-08 diamond M: frame bag, bottles, top tube, marked as estimates: '+a);
  app.run(`quickPickSize('XS');`);
  const b=app.run(`fitQuickResultText()`);
  check(b!==a&&/3\.5 L/.test(b),'BK-UI-08 the result changes at once with the size: '+b);
  app.run(`quickPickStyle('step-through');`);
  check(/no frame bag|no mount/i.test(app.run(`fitQuickResultText()`)),'BK-UI-08 step-through says no frame bag');
  check(app.run(`fitQuickState().size`)==='XS'&&app.run(`fitQuickState().style`)==='step-through','BK-UI-08 the chosen style and size are reported');
}
// [BK-UI-09] one tap: "My frame has bolts here"
{
  const p=J(`profileWithBolt({id:'b',name:'B',fit:{style:'diamond-level',size:{kind:'letter',value:'M'},bolts:{st:'unknown',dt:'unknown',un:'unknown'},topTubeBag:'unknown'}},'un')`);
  check(p&&p.fit.bolts.un==='yes'&&p.fit.bolts.st==='unknown'&&p.fit.style==='diamond-level','BK-UI-09 sets only that bolt answer');
  const t=J(`profileWithBolt({id:'b',name:'B',fit:{style:'trapeze',bolts:{st:'unknown',dt:'unknown',un:'unknown'},topTubeBag:'unknown'}},'top')`);
  check(t&&t.fit.topTubeBag==='yes','BK-UI-09 the top-tube answer too');
  check(/data-bolt-yes="/.test(html)&&/My frame has bolts here/.test(html)&&/btn\.dataset\.boltYes/.test(app.script),'BK-UI-09 the bag row offers it and the handler is wired');
  check(/spec\.assumed && \(isBottle\(b\.pos\) && b\.slot \|\| b\.pos === 'top'\) \? `<span class="fitfixes"><button class="opt" data-bolt-yes/.test(html),'BK-UI-09 only for an assumed answer');
}
// [BK-UI-10] a saved bike reopens with nothing asked again; nothing is required
{
  app.run(`fillFitFields({fit:{style:'compact',size:{kind:'letter',value:'S'},bolts:{st:'yes',dt:'no',un:'unknown'},topTubeBag:'unknown',triangleCm:null,seatGapCm:null,barWidthCm:null}})`);
  check(app.run(`fitQuickState().style`)==='compact'&&app.run(`fitQuickState().size`)==='S','BK-UI-10 the saved style and size are shown');
  check(app.run(`fitFieldsIssue()`)==='','BK-UI-10 nothing is required');
  app.run(`fillFitFields(null)`);
  check(app.run(`fitFieldsIssue()`)===''&&app.run(`fitQuickState().style`)==='unknown'&&app.run(`fitQuickState().size`)==='','BK-UI-10 an empty form is valid and asks for nothing');
  let applied=0;app.context.__count=()=>applied++;
  app.run(`applyBikeDetails=async()=>{__count();return true;}`);
  app.run(`closeBikeDetails()`);
  check(applied===0,'BK-UI-10 closing without a tap applies nothing');
  check(/closeBikeDetails\(\)\{[^}]*\}/.test(app.script)&&!/function closeBikeDetails\(\)\{[^}]*apply/.test(app.script),'BK-UI-10 closing never applies');
}
// [BK-UI-11] same answers, same placements, old and new route
{
  const via=(setup)=>{app.run(`S.bags=[{uid:1,pos:'frame',L:6},{uid:2,pos:'bottle',slot:'dt',L:0.75},{uid:3,pos:'seat',L:10}];S.kit={tent:true,quilt:true,pad:true};S.bikeProfile=null;`);setup();
    return app.run(`JSON.stringify(freshPlan().slots.map(s=>[s.key,s.cap,s.items.map(i=>[i.id,i.vol])]))`);};
  const oldWay=via(()=>app.run(`S.bikeProfile=normaliseBikeProfile({id:'x',name:'X',fit:{style:'diamond-level',size:{kind:'letter',value:'M'},bolts:{st:'unknown',dt:'unknown',un:'unknown'},topTubeBag:'unknown'}})`));
  const newWay=via(()=>{app.run(`fillFitFields(null);applyBikeDetails=async()=>true;quickPickStyle('diamond-level');quickPickSize('M');S.bikeProfile=normaliseBikeProfile({id:'x',name:'X',fit:readFitFields().fit})`);});
  check(oldWay===newWay,'BK-UI-11 byte-identical placements');
  check(oldWay.length>10,'BK-UI-11 the plan is not empty');
}
console.log(JSON.stringify({status:'passed',checks}));
