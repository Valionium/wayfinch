// Frozen copy of the bag selection as it was before the design's rules (backup index_2026-10-30_17-51-05.html).
// Only the comparison tests load it: "never worse than today". Not product code.
globalThis.todaySelection=(()=>{
const ACC_CRITICAL=['rain','pump','tool','levers','snacks','plugs','link','docs','sun','bank'];
function allocateInto(units){
  const slots = units.map(b => ({ ...b, left:usableL(b), cap:usableL(b), items:[] }));
  const byPos = pos => slots.filter(s => s.pos === pos).sort((a,b) => a.left - b.left);
  const have = pos => slots.some(s => s.pos === pos);
  const claimed = deckedIds();
  const all = activeKit().filter(k => !claimed.includes(k.id));
  const tier = k =>
    TIER_1.includes(k.id) ? 1 :
    (k.cat === 'Sleep' && camping()) ? 2 :
    (k.warmth ? 3 : 4);
  const solid = all.filter(k => !k.divisible).sort((a,b) => {
    if(tier(a) !== tier(b)) return tier(a) - tier(b);
    const av = a.pref.filter(have).length, bv = b.pref.filter(have).length;
    if(av !== bv) return av - bv;
    return itemL(b) - itemL(a);
  });
  const spill = [], stranded = [];

  // Hand-placed items go first and stay put. If a pin no longer fits — the bag
  // shrank, the kit changed — it quietly falls back to being packed normally.
  const queue = [];
  solid.forEach(k => {
    const want = S.pinned && S.pinned[k.id];
    if(!want){ queue.push(k); return; }
    const L = itemL(k);
    const slot = slots.find(s => s.key === want && s.left >= L && fitsLength(k, s));
    if(!slot){ queue.push(k); return; }
    slot.items.push({ ...k, vol:L, units:qtyOf(k), pinned:true });
    slot.left = +(slot.left - L).toFixed(2);
    if(ACC_CRITICAL.includes(k.id) && !POSITIONS[slot.pos].accessible)
      stranded.push({ item:k, where:slot.pos });
  });

  // Quantity means separate whole pieces, not one object the size of all of
  // them together. Round their cumulative volume so every centilitre is kept.
  queue.flatMap(k => {
    const count=qtyOf(k),cents=Math.round(itemL(k)*100);
    return Array.from({length:count},(_,i)=>({...k,units:1,
      vol:(Math.round(cents*(i+1)/count)-Math.round(cents*i/count))/100}));
  }).forEach(k => {
    const L = k.vol;
    let slot = null;
    // first choice: a position that actually suits the item, tightest fit first
    for(const p of k.pref){ slot = byPos(p).find(s => s.left >= L && fitsLength(k, s)); if(slot) break; }
    // fallback: you own what you own — any bag with room beats leaving it behind,
    // but the strap deck only takes things that don't mind rain and road spray
    if(!slot) slot = slots.filter(s => s.left >= L && fitsLength(k, s)).sort((a,b) => a.left - b.left)[0];
    if(!slot){
      // did it fail on volume, or because nothing you own is long enough?
      const anyLong = slots.some(s => fitsLength(k, s));
      spill.push({...k, vol:L, tooLong: !anyLong && rigidOf(k) > 0});
      return;
    }
    slot.items.push({...k, vol:L});
    slot.left = +(slot.left - L).toFixed(2);
    if(ACC_CRITICAL.includes(k.id) && !POSITIONS[slot.pos].accessible)
      stranded.push({ item:k, where:slot.pos });
  });

  // divisible items (food) fill whatever gaps are left
  all.filter(k => k.divisible).forEach(k => {
    let rest = Math.round(itemL(k)*100);
    const order = [...k.pref.flatMap(byPos), ...slots].filter((s,i,a) => a.indexOf(s) === i);
    const rank2 = s => POSITIONS[s.pos].onBody ? 1 : 0;
    order.sort((a,b) => rank2(a) - rank2(b)).forEach(s => {
      if(!rest || !fitsLength(k,s)) return;
      // round the share DOWN to two places, then subtract exactly that, or the
      // recorded volume drifts above what the bag actually holds
      const take = Math.min(Math.round(s.left*100),rest);
      if(take > 0){
        s.items.push({...k, vol:take/100, part:true});
        s.left = (Math.round(s.left*100)-take)/100;
        rest -= take;
      }
    });
    if(rest > 0) spill.push({...k, vol:rest/100,part:true,
      tooLong:rigidOf(k)>0 && !slots.some(s=>fitsLength(k,s))});
  });

  rebalancePairs(slots);
  // Show each selected item once per bag even when several pieces fit there.
  const combine=items=>{
    const grouped=new Map();
    items.forEach(k=>{
      const key=k.id+'|'+!!k.part+'|'+!!k.pinned,previous=grouped.get(key);
      if(previous){previous.vol=+(previous.vol+k.vol).toFixed(2);
        if(!k.part)previous.units=(previous.units||1)+(k.units||1);}
      else grouped.set(key,{...k});
    });
    return [...grouped.values()];
  };
  slots.forEach(s=>s.items=combine(s.items));
  const uniqueStranded=stranded.filter((s,i,a)=>a.findIndex(x=>x.item.id===s.item.id && x.where===s.where)===i);
  return { slots, spill:combine(spill), stranded:uniqueStranded };
}

// Two panniers should not end up 9 kg and 2 kg. Redistribute heaviest-first into
// whichever half is currently lighter, as long as the volume allows it.

function placedKg(k){
  if(k.part){const full=itemL(k);return full>0?itemKg(k)*k.vol/full:0;}
  return itemKg(k)*(k.units||qtyOf(k))/qtyOf(k);
}
function placedQuantity(k){return !k.part && qtyOf(k)>1?`${k.units||qtyOf(k)} of ${qtyOf(k)}`:'';}
function weightIn(s){ return s.items.reduce((t,k)=>t+placedKg(k),0); }

function loadByZone(slots){
  const zones={front:0,centre:0,rear:0,body:0};
  slots.forEach(s=>{zones[POSITIONS[s.pos].zone||'centre']+=weightIn(s);});
  deckClaims().forEach(k=>{zones.rear+=itemKg(k);});
  bottles().forEach(b=>{zones.centre+=+b.L||0;});
  return zones;
}

function rebalancePairs(slots){
  const groups = {};
  slots.forEach(s => { (groups[s.uid] = groups[s.uid] || []).push(s); });
  Object.values(groups).forEach(g => {
    if(g.length !== 2) return;
    if(g.some(s => s.items.some(k => k.pinned))) return;   // respect hand placement
    const snapshot = g.map(s => ({ items:s.items.slice(), left:s.left }));
    const solid = [...g[0].items, ...g[1].items].filter(k => !k.part);
    const parts = [...g[0].items, ...g[1].items].filter(k => k.part);
    if(solid.length < 2) return;
    g.forEach(s => { s.items = []; s.left = s.cap; });
    let failed = false;
    // Biggest item first, into whichever half is emptiest. Even fill matters as
    // much as even weight — an unbalanced fork is felt in the steering — and
    // weight tracks volume closely enough that one pass settles both.
    solid.sort((a,b) => b.vol - a.vol || placedKg(b) - placedKg(a)).forEach(k => {
      const cand = g.filter(s => s.left >= k.vol && fitsLength(k, s))
        .sort((a,b) => (a.cap-a.left)/a.cap - (b.cap-b.left)/b.cap || weightIn(a) - weightIn(b));
      if(!cand.length){ failed = true; return; }
      cand[0].items.push(k); cand[0].left = +(cand[0].left - k.vol).toFixed(2);
    });
    // Split items get re-spread across whatever room is actually left. The old
    // version fell back to "put it in the first bag" and silently overfilled it.
    parts.forEach(k => {
      let rest = Math.round(k.vol*100);
      g.forEach(s => {
        if(!rest || !fitsLength(k,s)) return;
        const take = Math.min(Math.round(s.left*100),rest);
        if(take > 0){
          s.items.push({ ...k, vol:take/100 });
          s.left = (Math.round(s.left*100)-take)/100;
          rest -= take;
        }
      });
      if(rest > 0) failed = true;    // no room for it after the shuffle — roll back
    });
    if(failed) g.forEach((s,i) => { s.items = snapshot[i].items; s.left = snapshot[i].left; });
  });
}

// Open bags until the kit fits, then try removing each one again.
// Anything that can come off without breaking the pack is a bag you leave at home.
// Panniers are a commitment, not a supplement. Either the kit fits comfortably
// in the bikepacking bags — in which case the rack and both panniers stay home —
// or it does not, and you commit: fill the panniers first, then drop whatever
// bikepacking bags have stopped earning their place. Half a pannier is the one
// answer nobody wants.
const COMFY_MARGIN = 0.18;

function mountedOf(list){ return list.reduce((s,b) => s + usableL(b), 0); }

function packFrom(units, prune, protect, pinnedKeys=new Set()){
  const ok = r => !r.spill.length && !r.stranded.length;
  let chosen = units.filter(b=>pinnedKeys.has(b.key)), res = allocateInto(chosen);
  for(const b of units){
    if(ok(res)) break;
    if(chosen.includes(b))continue;
    chosen.push(b);
    res = allocateInto(chosen);
  }
  if(ok(res) && prune){
    const BULKY = 3;
    let changed = true;
    while(changed){
      changed = false;
      const bySize = chosen
        .filter(b => usableL(b) >= BULKY && !pinnedKeys.has(b.key) && !(protect && protect(b)))
        .sort((a,b) => (POSITIONS[b.pos].onBody?1:0) - (POSITIONS[a.pos].onBody?1:0)
                    || usableL(b) - usableL(a));
      for(const b of bySize){
        const trial = chosen.filter(x => x !== b);
        const r = allocateInto(trial);
        if(ok(r)){ chosen = trial; res = r; changed = true; break; }
      }
    }
    const empties = res.slots.filter(s => !s.items.length).map(s => s.key);
    if(empties.length){ chosen = chosen.filter(b => !empties.includes(b.key)); res = allocateInto(chosen); }
  }
  return { chosen, res, ok:ok(res) };
}

function selectBags(){
  const ok = r => !r.spill.length && !r.stranded.length;
  // small reachable bags first — they solve access cheaply
  const rank = b => POSITIONS[b.pos].onBody ? 3 : (POSITIONS[b.pos].accessible ? 0 : (b.pos === 'rack' ? 2 : 1));
  const byRank = r => (a,b) => r(a) - r(b) || (r(a) === 0 ? usableL(a) - usableL(b) : usableL(b) - usableL(a));
  const owned = gearBags().filter(b => usableL(b) > 0.05).flatMap(physical);
  const all = owned.slice().sort(byRank(rank));
  const hasRack = owned.some(b => b.pos === 'rack');
  // Validate pins against all owned bags before choosing a smaller set. A bag
  // containing a valid hand placement must survive every pruning branch.
  const pinnedKeys=new Set(allocateInto(owned).slots.filter(s=>s.items.some(k=>k.pinned)).map(s=>s.key));

  let chosen, res, system = null;

  if(hasRack){
    // could this go without the rack at all, and still leave real slack?
    const soft = all.filter(b => b.pos !== 'rack');
    const A = packFrom(soft, true,null,pinnedKeys);
    const capA = mountedOf(A.chosen);
    const spareA = capA - kitL();
    // Whether the rack is needed is a question about volume. Something being
    // awkward to reach is worth saying, but it is not a reason to bolt a rack
    // and two panniers onto a bike that had 57% of its space free.
    const fitsA = !A.res.spill.length;
    const comfy = fitsA && capA > 0 && spareA / capA >= COMFY_MARGIN &&
      !owned.some(b=>b.pos==='rack' && pinnedKeys.has(b.key));

    if(comfy){
      let keep = S.mode === 'light' ? A.chosen
        : soft.filter(b => !POSITIONS[b.pos].onBody || A.chosen.includes(b));
      let r2 = allocateInto(keep);
      if(!r2.spill.length){
        // slack is fine, an entirely empty bag is not
        const empties = r2.slots.filter(s => !s.items.length).map(s => s.key);
        if(empties.length){ keep = keep.filter(b => !empties.includes(b.key)); r2 = allocateInto(keep); }
      }
      chosen = !r2.spill.length ? keep : A.chosen;
      res = !r2.spill.length ? r2 : A.res;
      system = { kind:'noRack', spare:+spareA.toFixed(1), pct:Math.round(spareA/capA*100),
                 panniers:owned.filter(b => b.pos === 'rack').length };
    } else {
      // committed: panniers get filled before the bikepacking bags are considered
      const rackFirst = b => POSITIONS[b.pos].onBody ? 3
        : (POSITIONS[b.pos].accessible ? 0 : (b.pos === 'rack' ? 1 : 2));
      // a pair goes on together — one loaded pannier and a seat pack is the
      // mixed setup this whole branch exists to avoid
      const B = packFrom(owned.slice().sort(byRank(rackFirst)), true, b => b.pos === 'rack',pinnedKeys);
      chosen = B.chosen; res = B.res;

      // A pannier sitting under half full while a bar roll or seat pack is
      // mounted means a soft bag is doing work the rack should be doing. Drop
      // it even if something ends up harder to reach, and say what that cost.
      const traded = [];
      for(let guard = 0; guard < 3; guard++){
        const slack = res.slots.some(s => s.pos === 'rack' && s.cap > 0 && (s.cap - s.left) / s.cap < 0.5);
        if(!slack) break;
        const soft = chosen.filter(b => (b.pos === 'bar' || b.pos === 'seat') && !pinnedKeys.has(b.key))
                           .sort((a,b) => usableL(b) - usableL(a));
        let moved = false;
        for(const b of soft){
          const trial = chosen.filter(x => x !== b);
          const r = allocateInto(trial);
          if(!r.spill.length){
            traded.push({ label:unitLabel(b),
                          cost:r.stranded.filter(s => !res.stranded.some(o => o.item.id === s.item.id))
                                         .map(s => s.item.name) });
            chosen = trial; res = r; moved = true; break;
          }
        }
        if(!moved) break;
      }
      const dropped = owned.filter(b => !chosen.includes(b) && b.pos !== 'rack' && !POSITIONS[b.pos].onBody);
      system = { kind:'rack', dropped:dropped.map(unitLabel), traded,
                 why: fitsA ? `only ${spareA.toFixed(1)} L would have been spare without them — ${Math.round(spareA/Math.max(1,capA)*100)}% of the bags, which is a squeeze rather than slack`
                            : 'it does not go without them' };
    }
  } else {
    const A = packFrom(all, S.mode === 'light',null,pinnedKeys);
    chosen = A.chosen; res = A.res;
    if(S.mode === 'comfort' && ok(res)){
      const rest = all.filter(b => !chosen.includes(b) && !POSITIONS[b.pos].onBody);
      if(rest.length){ chosen = chosen.concat(rest); res = allocateInto(chosen); }
      const idle = res.slots.filter(s => POSITIONS[s.pos].onBody && !s.items.length).map(s => s.key);
      if(idle.length){ chosen = chosen.filter(b => !idle.includes(b.key)); res = allocateInto(chosen); }
    }
  }

  const unused = owned.filter(b => !chosen.includes(b));
  const barely = S.mode === 'light'
    ? res.slots.filter(s => s.cap > 0.5 && (s.cap - s.left) / s.cap < 0.18 && !pinnedKeys.has(s.key))
      .filter(s=>ok(allocateInto(chosen.filter(b=>b.key!==s.key))))
    : [];
  return { ...res, chosen, unused, barely, swapped:null, system };
}


return selectBags;
})();
