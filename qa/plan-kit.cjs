// Test kit for the plan object: set a plan, apply steps, read the plan back as plain data.
// planKit({ storage? }) -> { vm, setPlan(input), step(step), plan(), stored(), texts() }
const {appVM}=require('./app-vm.cjs');
function planKit(options={}){
  const vm=appVM({storage:options.storage});
  const {run}=vm;
  const json=code=>JSON.parse(run(`JSON.stringify(${code})`)??'null');
  const kit={
    vm,
    // input: { bags:[{uid,pos,L,...}], kit:[ids] | {id:bool}, mode, nights, sleep, foodMode, qty, custom, pinned, decks, packEff }
    setPlan(input={}){
      const copy=JSON.parse(JSON.stringify(input));
      if(Array.isArray(copy.kit))copy.kit=Object.fromEntries(copy.kit.map(id=>[id,true]));
      run(`(()=>{const p=${JSON.stringify(copy)};
        if(p.kit){Object.keys(S.kit).forEach(id=>S.kit[id]=false);Object.assign(S.kit,p.kit);}
        ['bags','mode','nights','sleep','foodMode','qty','custom','pinned','decks','packEff','packed'].forEach(k=>{if(p[k]!==undefined)S[k]=p[k];});
        S.placements=p.placements||null;
      })()`);
      return kit;
    },
    // A step: { add:id } { remove:id } { mode } { nights } { qty:{id:n} } { move:id, to:key } { tick:id }
    step(step){
      run(`(()=>{const s=${JSON.stringify(step)};
        if(s.add)S.kit[s.add]=true;
        if(s.remove)S.kit[s.remove]=false;
        if(s.mode)S.mode=s.mode;
        if(s.nights!==undefined)S.nights=s.nights;
        if(s.qty)Object.assign(S.qty,s.qty);
        if(s.move)S.pinned[s.move]=s.to;
        if(s.tick){DRAFT_READY=true;setPackedItem(s.tick,true);}
        currentPlan();
      })()`);
      return kit;
    },
    // The opening sequence of 95-init: read the stored draft, restore it, mark the tab ready.
    async open(){
      run('renderBikeProfiles=()=>{};renderClimate=()=>{};renderBags=()=>{};renderKit=()=>{};drawRig=()=>{};syncGPXControl=()=>{};renderPressureHelper=()=>{};renderPackingChecklist=()=>{};applyTheme=()=>{};');
      return run(`(async()=>{const d=await store.get(DRAFT_KEY);const ok=validPlan(d);if(ok)restorePlan(d,true);
        DRAFT_SIGNATURE=JSON.stringify(captureDraft());DRAFT_READY=true;initialiseDraftSaveStatus();return ok;})()`);
    },
    // Tab visibility, as the browser reports it. hide() runs the listeners with the tab hidden; show() with it visible.
    hide(){run('document.hidden=true;');(vm.listeners.visibilitychange||[]).forEach(cb=>cb());return kit;},
    show(){run('document.hidden=false;');(vm.listeners.visibilitychange||[]).forEach(cb=>cb());return kit;},
    // The tab is frozen or in the back-forward cache: it receives no storage events until thawed.
    freeze(){vm.store.vms.delete(vm);return kit;},
    thaw(){vm.store.vms.add(vm);return kit;},
    plan:()=>json('currentPlan()'),
    stored:()=>Object.fromEntries(vm.values),
    texts:()=>json("(()=>{const m=getChecklistModel();return {checklist:m.items.map(r=>r.name+': '+r.placementLabel)};})()"),
  };
  return kit;
}
module.exports={planKit};
