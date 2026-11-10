// Where each Bike care fact came from (design 3.5, ruling 4): for maintainers and the owner's read, never shipped. Only tests import
// this file (BC-SOURCES-PRIVATE); the app never does, so no link below reaches a build. "book p. N" is the owner's maintenance book
// (German), from the photos the owner sent (content draft, 7 November 2026, two rounds); group 2 adds the other Care tasks (chain-wipe, the draft's 49th row, is cut: no source for a wipe after every ride); group 3 adds the Roadside cards and the carry items; the rule used where the book and other sources
// differ: the more careful value ships (decision 6).

export const SOURCES: Record<string, { urls: string[]; note?: string }> = {
  'brakes-pads-disc': {
    urls: [
      'https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation',
      'https://manualmachine.com/shimano/xtr/19567146-service-instructions-manual',
      'https://www.parktool.com/en-us/blog/repair-help/mechanical-disc-brake-alignment',
    ],
    note: "Weekly: book p. 206 (was monthly). 1.5 mm and the grinding noise: book p. 120; lever step: book p. 121. Disagree: 0.5 mm in one Shimano manual, about 1 mm at Park Tool, 1.5 mm in the book, 3 mm incl. backing in an Avid guide; we use about 1.5 mm (book, more careful) and the pad maker\\'s mark if given. The book does not say whether the 1.5 mm includes the metal backing; read as pad material (owner to confirm). Review of PR 67, I1 and I2: the pad pin or bolt is refitted to its printed torque (spec 3.4; book p. 213); never touch the disc or pads with fingers, clean gloves (book p. 120).",
  },
  'brakes-pads-rim': {
    urls: ['https://www.sheldonbrown.com/rim-brakes.html'],
    note: "Weekly: book p. 206 (was monthly). Wear mark and toe-in: book p. 211. Scraping noise, scoring in the rim: book p. 110; left/right and top marks: book p. 111. Review of PR 67, I1: after lining the pads up the pad bolt goes to the torque printed on the brake (spec 3.4; book pp. 111, 213).",
  },
  'wheels-spokes-check': {
    urls: [],
    note: 'Book pp. 40, 206: weekly (was monthly); cracks or bulges at the spoke holes (p. 40); loose spokes put the wheel out of true (p. 88).',
  },
  'frame-bolts-check': {
    urls: ['https://dedhambike.com/articles/torque-table-pg186.htm', 'https://www.cyclingnews.com/features/torque-wrenches-why-you-need-one-and-how-to-use-them', 'https://www.parktool.com/en-int/blog/repair-help/how-to-adjust-a-threadless-headset'],
    note: 'Weekly, cranks, chainring and brake bolts, quick releases, cracks: book p. 206. Twist test and quick releases before every ride, carbon by torque wrench, bar end plugs, lever fixings, bar alignment: book p. 40; crank side play and pedals: book p. 41. Park Tool gives no stem torque: use the number on the part.',
  },
  'chain-lube': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/the-park-tool-guide-to-bicycle-lubricants-and-compounds'],
    note: 'Interval: book pp. 44, 206-207 (monthly and after every rain ride; after every wash, p. 44; always well oiled, p. 158). The draft\'s "every 1-2 weeks" was an unsourced guess and is cut. Steps and lube types: book pp. 44-45; wet vs dry lube agrees with Park Tool.',
  },
  'ebike-battery-care': {
    urls: ['https://www.bosch-ebike.com/us/help-center/asset-ast-00046', 'https://www.ternbicycles.com/us/node/348455'],
    note: 'Search summaries only. Disagree: the storage temperature differs by page (a wider band on the Bosch US/Canada page, about 20 C in the Smart System manual and at Tern). Book p. 206: keep the battery charged.',
  },
  'tyres-sealant-topup': {
    urls: ['https://www.bikeradar.com/advice/workshop/tubeless-tyre-maintenance/', 'https://www.slowtwitch.com/industry/tubeless-sealant-tips-and-strategy/', 'https://thelostco.com/en-jp/blogs/blog/how-often-to-add-tubeless-tire-sealant'],
    note: 'Amount per maker, spreading, soapy-water leak test: book p. 87. No interval in the book. Disagree: BikeRadar 3-6 months, Slowtwitch 2-12 months, one guide 1-2 months in hot weather.',
  },
  'gears-hub-oil': {
    urls: ['https://biketrailspfannenstiel.ch/auskunft/shimano-alfine-8-olwechsel/', 'https://www.cyclechat.net/threads/new-chainset-and-running-gear.279586/', 'https://biketrailspfannenstiel.ch/auskunft/shimano-nabenschaltung-olwechsel/'],
    note: 'Every 6 months: book p. 207 (the draft had 1-2 years by model). Alfine 5000 km or 2 years vs Nexus yearly or 2000 km vs other pages 1000 km or 6 months; the shorter per family. Rohloff: no source found, so its step is cut (owner\'s rule).',
  },
  'susp-fork-service': {
    urls: [
      'https://support.rockshox.com/hc/en-us/articles/4412306753947-How-often-should-I-service-my-RockShox-product',
      'https://worldwidecyclery.com/blogs/worldwide-cyclery-blog/ultimate-guide-suspension-service',
      'https://flowmountainbike.com/features/flows-guide-to-understanding-suspension-service-intervals-and-upgrade-options/',
    ],
    note: 'A shop check every 6 months: book p. 207 (was yearly). Disagree: Fox 100 h vs 125 h (secondary sources); the app shows about 100 h, the shorter (decision 6; the coordinator ruled so in the review of PR 58, I3). Search summaries only.',
  },

  // ---- Care tasks (group 2) ----
  'brakes-lever-test': {
    urls: [],
    note: "Source: book pp. 40, 207 (pull each brake before every ride; pad look p. 40); steps 2-3: no source found Book: p. 207: differs: book says check before every ride; added. Round 2: p. 40: agrees (pull each brake before riding, check the pad gap); differs: book adds a pad look on rim brakes; added Group 2: the draft's step 2 (check the bike slows evenly) had no source and is cut; step 3 (if a lever feels wrong, do not ride) stays as the careful direction. Review of PR 67, I7: step 2 (\"if a lever feels wrong, do not ride\") has no source in the draft; it is kept as the cautious choice and is on the owner's O4 list. The sourced \"Do not ride until fixed\" is on brakes-spongy (Park Tool, book p. 213).",
  },
  'susp-wipe-stanchions': {
    urls: [],
    note: "Source: book p. 207 (oil check); book p. 200 (keep the shock clean); wiping after every ride: no source found Book: p. 207: differs: book checks the fork tubes for oil monthly; draft kept (more often). Round 2: p. 200: agrees (keep the rear shock clean) Group 2 for the owner at O4: wiping after every ride has no source of its own. Kept because the book checks the fork tubes for oil monthly and asks to keep the shock clean, and the more frequent check is the more careful. O4 default (coordinator): moved from After every ride to Every month, as the book's monthly oil check on the fork tubes (p. 207) and keeping the shock clean (p. 200); the after-every-ride interval had no source.",
  },
  'ebike-charge-indoors': {
    urls: ['https://www.bosch-ebike.com/us/help-center/asset-ast-00046', 'https://www.ternbicycles.com/us/node/348455'],
    note: "Book: p. 206: differs: book says keep the battery charged, weekly; draft kept (more often). Round 2: not covered by the new pages",
  },
  'frame-wash': {
    urls: ['https://files.helpdocs.io/l3tsvrpr48/other/1597337518726/gates-carbon-drive-manual.pdf', 'https://gatescarbondrive.com/resources/faqs', 'https://www.bike-magazin.de/en/gearstick-or-drive/belt-drive-the-right-dental-care-for-the-gates-belt/'],
    note: "Source: book pp. 44, 206-207 Book: pp. 206-207: agrees (clean the bike, keep water out of the electrics, lube after each clean). Round 2: p. 44: agrees (lube after every clean)",
  },
  'chain-dry-lube': {
    urls: ['https://www.parktool.com/en-us/product/chain-wear-indicator-cc-3-2'],
    note: "Source: after rain: book p. 206; steps: book pp. 44-45 Book: p. 206: agrees on oiling after every rain ride; differs: book adds the jockey wheels; added. Round 2: pp. 44-45: steps now from the book (oil in front of the derailleur, wipe the outer plates, shift through all gears, derailleur pivots and springs, use little oil); added",
  },
  'belt-rinse': {
    urls: ['https://files.helpdocs.io/l3tsvrpr48/other/1597337518726/gates-carbon-drive-manual.pdf', 'https://gatescarbondrive.com/resources/faqs', 'https://www.bike-magazin.de/en/gearstick-or-drive/belt-drive-the-right-dental-care-for-the-gates-belt/'],
    note: "Book: not covered (pp. 206-215). Round 2: not covered by the new pages",
  },
  'brakes-rotor-wipe': {
    urls: ['https://manualmachine.com/shimano/xtr/19567146-service-instructions-manual'],
    note: "Source: book pp. 120, 213; Book: p. 213: agrees (oil or cleaner on disc or pads causes squeal and weak braking; clean the disc). Round 2: p. 120: differs: book handles the braking surface only with gloves; added",
  },
  'brakes-rim-wipe': {
    urls: [],
    note: "Source: book pp. 110-111, 211 Book: p. 211: differs: book adds degreaser for hardened pad residue; added. Round 2: pp. 110-111: agrees (pads wear fastest in cold, wet weather; wiping wet pads makes them last longer)",
  },
  'ebike-dry-contacts': {
    urls: ['https://www.bosch-ebike.com/us/help-center/asset-ast-00046', 'https://www.ternbicycles.com/us/node/348455', 'https://www.ternbicycles.com/be/support/kb/349039/how-troubleshoot-bosch-ebike-system-tern-bikes', 'https://helpcenter.velo-de-ville.com/en/support/solutions/articles/80001185577-error-patterns-solutions-for-bosch-shimano'],
    note: "Source: book pp. 206, 215 Book: pp. 206, 215: agrees (keep water out; clean contacts, dry fully before refitting). Round 2: not covered by the new pages Review of PR 67, M5: the every-6-months contact clean moved from step 1 to the note.",
  },
  'tyres-pressure': {
    urls: ['https://www.schwalbe.com/en/technology-faq/tire-pressure/'],
    note: "Source: book pp. 40, 84, 209 Book: p. 209: agrees (soft tyres make the bike unsteady; pump to the maker's pressure); the schedule has no tyre line. Round 2: p. 40: differs: book squeezes the tyres before every ride and checks the tyre sits on the rim with no tube showing; added. p. 84: worn tread or cracked sidewalls mean a new tyre; added. p. 85: agrees (pressure is on the sidewall)",
  },
  'gears-shift-test': {
    urls: [],
    note: "Source: book pp. 41, 206 Book: p. 206: agrees (weekly: gears shift cleanly). Round 2: p. 41: agrees (shift through all gears to see the derailleur is set right) Group 2: the note names the task \"Fix gears that shift badly\" (gears-indexing).",
  },
  'chain-wear-check': {
    urls: ['https://www.parktool.com/en-us/product/chain-wear-indicator-cc-3-2'],
    note: "Source: interval: book p. 206; wear signs: book pp. 41, 158 Book: p. 206: differs: book says weekly; moved from Every month. Round 2: pp. 41, 158: agrees (check stretch with a gauge, smallest ring and sprocket, replace when the gauge sinks in or the chain slips); gap filled: the signs of a worn chain",
  },
  'gears-electronic-battery': {
    urls: ['https://www.competitivecyclist.com/bulletin/electronic-shifting-axs-di2-faq', 'https://ridereview.com/questions/how-to-check-shimano-di2-battery'],
    note: "Source: interval: book p. 206 Book: p. 206: differs: book says make sure the battery is charged weekly; moved from Every month. Round 2: not covered by the new pages",
  },
  'frame-headset-check': {
    urls: ['https://www.parktool.com/en-int/blog/repair-help/how-to-adjust-a-threadless-headset'],
    note: "Source: book pp. 40, 206, 209 Book: p. 206: differs: book says weekly (steering turns easily); moved from Every 6 months. p. 209: agrees (too tight, loose or worn headset). Round 2: p. 40: agrees (brake on, push forward; play means loose bearings; the book turns the bar 90 degrees first, added to step 1)",
  },
  'gears-cables-look': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/shift-cable-replacement-trigger-shifters'],
    note: "Source: book pp. 41, 206 Book: p. 206: differs: book says weekly (casing cracks and wear, cable fraying); moved from Every 6 months. Round 2: p. 41: differs: book points to wear where casing and hoses touch the frame; added",
  },
  'tyres-sealant-check': {
    urls: ['https://www.bikeradar.com/advice/workshop/tubeless-tyre-maintenance/', 'https://www.slowtwitch.com/industry/tubeless-sealant-tips-and-strategy/'],
    note: "Book: not covered (pp. 206-215). Round 2: pp. 86-87 cover fitting, not a check interval; not covered Review of PR 67, I6: let the air out before the core comes out, refit the core and pump up (the top-up task's own words).",
  },
  'belt-inspect': {
    urls: ['https://files.helpdocs.io/l3tsvrpr48/other/1597337518726/gates-carbon-drive-manual.pdf', 'https://gatescarbondrive.com/resources/faqs', 'https://www.bike-magazin.de/en/gearstick-or-drive/belt-drive-the-right-dental-care-for-the-gates-belt/'],
    note: "Book: not covered (pp. 206-215). Round 2: not covered by the new pages",
  },
  'susp-air-pressure': {
    urls: ['https://support.rockshox.com/hc/en-us/articles/4412294430107-How-much-air-should-I-put-in-my-RockShox-fork-for-my-rider-weight'],
    note: "Source: monthly interval: book p. 207; book p. 200 Book: p. 207: agrees (sag on all shocks, monthly). Round 2: p. 200: agrees (air goes in or out through the shock valve to set sag)",
  },
  'gears-cassette-wear': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/rear-derailleur-advanced-troubleshooting'],
    note: "Source: book pp. 41, 207, 215; worn-teeth look: book p. 41 (the book names worn teeth but does not describe the shape) Book: p. 207: differs: book says monthly and includes chainrings; moved from Every 6 months. p. 215: agrees (slipping in only some gears = worn sprockets or rings). Round 2: p. 41: gap partly filled (look for worn teeth on the sprockets); differs: book adds straight rings, tight ring bolts and free links; added",
  },
  'wheels-hubs-check': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/hub-overhaul-and-adjustment'],
    note: "Source: book pp. 40-41, 207, 209 Book: p. 207: differs: book says monthly and adds oil spots; moved from Every 6 months. p. 209: agrees (adjust cone bearings so there is no side play). Round 2: pp. 40-41: agrees (push the top of the wheel sideways to feel hub play) Review of PR 67, I3: a refit step added, as before each ride (book p. 40; the wheel quick release check in frame-bolts-check).",
  },
  'brakes-rotor-thickness': {
    urls: ['https://emtbforums.com/threads/rear-disc-below-1-5mm-minimum.39079', 'https://bike.bikegremlin.com/20365/when-to-replace-bicycle-brake-discs-rotors'],
    note: "Source: interval: book p. 207 Book: p. 207: differs: book says monthly, wear and alignment; moved from Every year. p. 213: agrees (replace a worn or badly bent disc). Round 2: p. 40: agrees (disc runs straight); fitting a new disc is candidate 56 Review of PR 67, I2 and M4: no fingers on disc or pads, clean gloves (book p. 120); \"a measuring caliper (not the brake caliper)\"; replace the disc at once if aluminium shows.",
  },
  'susp-lowers-service': {
    urls: ['https://support.rockshox.com/hc/en-us/articles/4412306753947-How-often-should-I-service-my-RockShox-product'],
    note: "Source: book p. 207 Book: p. 207: agrees (change the fork oil every 6 months). Round 2: not covered; the book's home fork-oiling tip (p. 45) is candidate 53, not applied",
  },
  'gears-cables-replace': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/shift-cable-replacement-trigger-shifters'],
    note: "Source: interval: book p. 207; book p. 148 Book: p. 207: differs: book says replace cables and casing every 6 months; the draft's yearly guess is replaced; moved from Every year. Round 2: p. 148: agrees (replace a worn cable before setting up the gears)",
  },
  'susp-shock-service': {
    urls: ['https://support.rockshox.com/hc/en-us/articles/4412306753947-How-often-should-I-service-my-RockShox-product', 'https://worldwidecyclery.com/blogs/worldwide-cyclery-blog/ultimate-guide-suspension-service', 'https://flowmountainbike.com/features/flows-guide-to-understanding-suspension-service-intervals-and-upgrade-options/'],
    note: "Source: Fox: book pp. 200, 207 Book: p. 207: differs: book says a shop check every 6 months; moved from Every year. Round 2: p. 200: differs: book says keep the shock clean and service it every 20 riding hours, and some models need a yearly shop check; 20 h added. Owner: the book does not say what the 20-hour service includes; decide whether it stays a rider task (clean and check) or a shop job Group 2: the owner's 7 November ruling: the 20-hour step is the rider's check and clean, the full service is at a shop. Fox: about 100 h, the shorter of 100 h and 125 h, as for the fork (decision 6). O4 default (coordinator): the 20 h step says what to check (clean the shaft, look for oil at the seal; book pp. 200, 207); the task is the rider's check, a shop does the service.",
  },
  'ebike-service': {
    urls: ['https://help.bosch-ebike.com/us/help-center/ebw-care/asset-asf-00318', 'https://www.bosch-ebike.com/en/service/dealer-service'],
    note: "Source: software interval: book p. 207; other fixed interval: no source found Book: p. 207: differs: book says software updates every 6 months; the draft's yearly guess is replaced; moved from Every year. Round 2: not covered by the new pages",
  },
  'brakes-hydraulic-bleed': {
    urls: ['https://www.parktool.com/blog/repair-help/shimano-hydraulic-brake-service-and-adjustment'],
    note: "Source: book p. 213 Book: p. 213: agrees (bleed when spongy; refill with the same fluid; mineral oil never mixed); the book gives no interval. Round 2: not covered by the new pages Group 2: the draft's interval (every 1-2 years) was its own guess and the book gives none, so the interval is cut: the task sits under When you notice, with its signs. Review of PR 67, M8: \"fluid old\" is cut from the signs (it needs an interval).",
  },
  'brakes-cable-disc-service': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/mechanical-disc-brake-alignment'],
    note: "Source: book pp. 121, 213 Book: p. 213: agrees (centre the caliper; set each pad on its own; clean or replace cable and casing). Round 2: p. 121: agrees (loosen the caliper bolts, centre so the wheel turns freely, tighten, squeeze the lever several times) Group 2: step 3 follows the roadside disc card's wording (the caliper bolts go to the torque printed on the caliper; without a torque wrench evenly until the caliper no longer moves; test the brake), as the owner's 7 November rule for brake bolts asks; torque wrench added to the tools.",
  },
  'belt-tension': {
    urls: ['https://files.helpdocs.io/l3tsvrpr48/other/1597337518726/gates-carbon-drive-manual.pdf', 'https://gatescarbondrive.com/resources/faqs', 'https://www.bike-magazin.de/en/gearstick-or-drive/belt-drive-the-right-dental-care-for-the-gates-belt/'],
    note: "Book: not covered (pp. 206-215). Round 2: not covered by the new pages Review of PR 67, I4: the axle nuts are wheel bolts, so they go to the printed torque (torque rule, as frame-bolts-check step 6); the task is critical.",
  },
  'frame-torque-check': {
    urls: ['https://dedhambike.com/articles/torque-table-pg186.htm', 'https://www.cyclingnews.com/features/torque-wrenches-why-you-need-one-and-how-to-use-them'],
    note: "Source: book pp. 40, 120, 213 Book: p. 213: agrees (caliper and disc bolts to the stated torque); the weekly bolt check of p. 206 is in frame-bolts-check. Round 2: p. 40: agrees (carbon parts: check with a torque wrench). p. 120: differs: book tightens disc bolts loosely first, then crosswise to torque; added Group 2: step 3 now says carbon parts are never tightened without a torque wrench (owner's 7 November rule; book p. 40); the draft's 4-6 Nm stays as a guide with 'follow the part'.",
  },
  'wheels-true-tension': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/wheel-and-rim-truing'],
    note: "Source: book pp. 88-89, 209 Book: p. 209: agrees (true by spoke tension at the bent part; broken spokes or a badly bent wheel: replace). Round 2: pp. 88-89: agrees (small steps, both sides, marker at the brake); differs: book adds two or three spokes at a time and care because spokes break easily; added. The book treats truing as a home job; the draft keeps \"shop\" (more careful) Group 2: the draft's steps 5 and 6 (the wobble limits and the tension meter) are joined so the task has six steps.",
  },
  'chain-deep-clean': {
    urls: ['https://www.parktool.com/en-us/product/chain-wear-indicator-cc-3-2'],
    note: "Source: book pp. 44, 207, 215 Book: pp. 207, 215: agrees (clean a dirty chain, rings and front derailleur; lube after cleaning); no interval in the book. Round 2: p. 44: agrees (lube after every clean) Group 2 for the owner at O4: the book gives no interval for a deep clean; the yearly section is the draft's. Review of PR 67, I5 and the O4 defaults: degreaser kept off discs, pads and rims (book p. 213; as chain-lube step 6); the quick link is rejoined and flexed as in the chain replacement (book p. 159); moved from Every year to When you notice (the book gives no interval; signs from book pp. 207, 215).",
  },
  'brakes-squeal': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation', 'https://www.sheldonbrown.com/rim-brakes.html'],
    note: "Source: book pp. 211, 213 Book: pp. 211, 213: agrees on toe-in, cleaning and oily pads; differs: book adds loose caliper or disc bolts; added. Round 2: not covered by the new pages Review of PR 67, I1 and I2: cleaner on a rag, not on the pads (as brakes-rotor-wipe; book pp. 120, 213); the pad bolt goes to the printed torque after toe-in (spec 3.4; book p. 111); no fingers on disc or pads (book p. 120).",
  },
  'brakes-spongy': {
    urls: ['https://www.parktool.com/blog/repair-help/shimano-hydraulic-brake-service-and-adjustment'],
    note: "Source: book p. 213 Book: p. 213: agrees (air, leaks at the hose joints, overheated fluid; bleed). Round 2: not covered by the new pages",
  },
  'chain-replace': {
    urls: ['https://www.parktool.com/en-us/product/chain-wear-indicator-cc-3-2'],
    note: "Source: book pp. 158-159, 215 Book: p. 215: agrees (right width and make; long enough for the biggest ring and sprocket). Round 2: pp. 158-159: agrees (length, routing, joining); differs: book adds the stiff-link check and the Shimano pin; added",
  },
  'gears-indexing': {
    urls: [],
    note: "Source: book pp. 148-149, 214-215 Book: pp. 214-215: agrees on cable and hanger; differs: book adds casing type, lockring, limit screws, worn pivots; added. Round 2: pp. 148-149: agrees (cable tension causes rattling, slipping and missed shifts); adds barrel adjuster direction, limit screw and angle screw settings; added Group 2: the draft's steps 1 and 2 are joined so the task has six steps.",
  },
  'wheels-wobble': {
    urls: ['https://www.parktool.com/en-us/blog/repair-help/wheel-and-rim-truing'],
    note: "Source: book pp. 88, 209 Book: p. 209: agrees on dropouts and spokes; differs: book adds the tyre bead; added. Round 2: p. 88: agrees (check the wheel is centred in the fork; loose spokes bend the wheel); the book's roadside straightening (p. 49) is candidate 61, not applied",
  },
  'tyres-replace': {
    urls: [],
    note: "Source: book pp. 84-85 Book: not covered (pp. 206-215). Round 2: pp. 84-85: gap filled (worn tread or cracked sidewalls mean a new tyre; fitting steps). The draft's \"cords showing, flat centre, repeated flats\" and \"wear marks\" had no source and are cut Group 2: the draft's steps 6 and 7 are joined so the task has six steps. Review of PR 67, I3 and the O4 defaults: the first step (it repeated the signs) is cut, the draft's steps 6 and 7 are split again, and the last step refits the wheel and closes its quick release (book p. 40). 6 steps.",
  },
  'frame-creak': {
    urls: [],
    note: "Source: partly: book pp. 41 (pedal and crank play), 45 (grease the seatpost and seat tube; carbon paste for carbon parts); \"common sources of creaks\": no source found Book: not covered (pp. 206-215). Round 2: pp. 41, 45: gap partly filled (the checks and the grease or carbon paste); differs: book adds carbon paste for carbon parts; added. The book does not tie these to creaks Group 2: the draft's claim that pedals, cranks and seatpost \"are common sources\" had no source and is cut; the checks are book p. 41, the grease and carbon paste book p. 45; re-torque follows the torque rule (carbon never without a torque wrench).",
  },
  'ebike-range-drop': {
    urls: ['https://www.bosch-ebike.com/us/help-center/asset-ast-00046', 'https://www.ternbicycles.com/us/node/348455', 'https://www.ternbicycles.com/be/support/kb/349039/how-troubleshoot-bosch-ebike-system-tern-bikes', 'https://helpcenter.velo-de-ville.com/en/support/solutions/articles/80001185577-error-patterns-solutions-for-bosch-shimano'],
    note: "Book: not covered (pp. 206-215). Round 2: not covered by the new pages",
  },

  // ---- Roadside repairs cards (group 3) ----
  'puncture-tube': {
    urls: [
      'https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know',
      'https://www.roadbikerider.com/be-a-hero-on-rides-d3/',
      'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot', 'https://www.parktool.com/en-us/blog/repair-help/tire-and-tube-removal-and-installation', 'https://www.schwalbe.com/AEROTHAN-GLUELESS-PATCHES'],
    note: 'Book pp. 48-49 and 84-85: the order of work, how to find the hole, pinch-flat slits, patch glue timing, a second check of tyre and rim, the pinched-tube check (book, more careful); p. 209: patch or replace the tube. Care pictures redo (approved by the owner, 9 November 2026): T1, Shimano manuals: with the wheel out a squeezed hydraulic lever pushes the pistons out; T2, Park Tool: push the bead to the middle of the rim first; T3, Schwalbe and Tubolito: glue patches do not hold on TPU tubes; T4 guides the disc between the pads.',
  },
  'puncture-tubeless': {
    urls: ['https://www.wtb.com/blogs/wtb/how-to-plug-a-puncture-on-a-tubeless-bicycle-tire', 'https://theproscloset.com/blogs/news/how-to-tubeless-tire-plug', 'https://www.performancebike.com/dynaplug-unpacked/cp1498'],
    note: "Not covered by the owner's book pages. Step 6 says to remove the tubeless valve (ruling I2 on PR 59: the draft said only the valve core, which leaves the valve in the rim); no public page could be read for how, so no detail is added. T5 (care pictures redo, 9 November 2026): a plug with a metal tip comes out before a tube goes in, or it can hole the tube (Dynaplug).",
  },
  'chain-broken': {
    urls: [
      'https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know',
      'https://www.roadbikerider.com/be-a-hero-on-rides-d3/',
      'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot',
      'https://www.parktool.com/en-us/product/master-link-pliers-mlp-1-2',
      'https://dealers.bike.shimano.com/product/509187/shimano-cycling-sm-cn910-quick-link',
      'https://www.bike-components.de/en/SRAM/PowerLock-Chain-12-speed-Master-Link-p69115/',
    ],
    note: 'Book p. 159: join with a link or pin, then flex the joined link sideways to find a stiff one (book, more careful); p. 215: twisted links and a damaged chain are replaced; p. 48: the repair kit has a chain tool. T6 (care pictures redo, 9 November 2026): a quick link is two plates, each with a pin and a keyhole slot, and must match the chain: its speeds and, for SRAM Flattop and T-Type chains, their own link (Park Tool, Shimano, SRAM).',
  },
  'spoke-snapped': {
    urls: [
      'https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know',
      'https://www.roadbikerider.com/be-a-hero-on-rides-d3/',
      'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot',
    ],
    note: "Book p. 49: tape the broken spoke or wrap it round a neighbour; pp. 208-209: broken spokes make the wheel wobble. Opening the brake's quick release is the draft's step 2, now for rim brakes only, named as the brake's own lever, with the weaker-brake caution and a step to close it again (rulings C1 and I1 on PR 59); \"more than a few spokes\" became \"more than one spoke\" (M1). The disc-brake step is the care pictures redo's T8 (owner's approval of 9 November 2026): the disc sits on the hub, so a wobbly rim never touches the brake; Park Tool: tie the broken spoke to a neighbour so it does not flop and scratch the frame (T7). Research note docs/research/2026-11-09-modern-bike-mechanisms.md, sections 1.1 and 4.",
  },
  'brake-rub-rim': {
    urls: ['https://www.sheldonbrown.com/rim-brakes.html', 'https://www.parktool.com/en-us/blog/repair-help/dual-pivot-brake-service', 'https://www.parktool.com/en-us/blog/repair-help/linear-pull-brake-service'],
    note: "Book p. 209: re-seat the wheel, the tyre bead (book, more careful). The centring step, cut in PR 59 for want of a source, is back as the care pictures redo's T10 (owner's approval of 9 November 2026): Park Tool's dual-pivot page (the centring screw on one arm moves both pads; some calipers have none) and linear-pull page (a spring screw on each arm). T11 says when to open the brake's release: a bent rim that still rubs.",
  },
  'brake-rub-disc': {
    urls: [
      'https://www.parktool.com/en-us/blog/repair-help/mechanical-disc-brake-alignment',
      'https://www.parktool.com/en-int/blog/repair-help/hydraulic-disc-brake-alignment',
    ],
    note: 'Book p. 213: bent disc, caliper not centred, pads too close; p. 121: loosen, centre, tighten, squeeze the lever several times. The draft\'s "snug the bolts" is replaced by the printed torque, or even tightening until the caliper no longer moves, and a brake test (the coordinator\'s ruling on PR 59, 7 Nov). Care pictures redo (approved by the owner, 9 November 2026): T12 names the thru-axle (most disc bikes have one; research note section 2) and the quick release of the wheel (PR 59, C1); T13 gives the direction to turn the pad adjuster; T14 asks about the lever squeezed with the wheel out (Shimano: the pistons come out; research note section 1.1).',
  },
  'brake-weak-rim': {
    urls: ['https://www.sheldonbrown.com/rim-brakes.html'],
    note: 'Book p. 211: cleaning, cable and pads; the brake quick release and loose pads (book, more careful); p. 110: a scraping noise means worn pads. T15 (care pictures redo, 9 November 2026): unscrewing the barrel draws the cable tighter (Park Tool, dual-pivot service); hydraulic rim brakes have no barrel.',
  },
  'brake-weak-disc': {
    urls: [
      'https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation',
      'https://www.parktool.com/en-us/blog/repair-help/mechanical-disc-brake-alignment',
    ],
    note: 'Book p. 213: oil, worn pads, air in the system (pumping firms the lever when air is in it); p. 120: a grinding noise as the worn-pad sign (book, more careful). "Never touch the disc or pads with your fingers" (the coordinator\'s ruling I3 on PR 59): book p. 120, gloves for the disc braking surfaces. T16 (care pictures redo, 9 November 2026): the Park Tool mechanical page: many calipers have one pad adjuster, some one each side; pad wear is taken up with the pad adjuster, never the barrel.',
  },
  'gears-skipping': {
    urls: ['https://www.parktool.com/en-us/product/chain-wear-indicator-cc-3-2', 'https://theradavist.com/shimano-grx-12-speed-gravel-group-review'],
    note: 'Book pp. 214-215: stiff links (flex them sideways), worn parts, bent cage or derailleur, dirty chain; pp. 148 and 159: wrong cable tension makes the chain rattle or slip, a stiff link jumps on the rear gears. T17 (care pictures redo, 9 November 2026): electronic gears (SRAM AXS, Shimano Di2) have no gear cable and no barrel adjuster; where a cable gear barrel sits varies, on the rear derailleur on Shimano GRX mechanical (The Radavist).',
  },
  'bolt-loose': {
    urls: ['https://dedhambike.com/articles/torque-table-pg186.htm', 'https://www.cyclingnews.com/features/torque-wrenches-why-you-need-one-and-how-to-use-them'],
    note: 'Book p. 40: the twist test (twist the part to see whether it still moves; never twist carbon parts) and a torque wrench for carbon (book, more careful); p. 206: bar and stem bolts tight. Carbon bolt torque: 4-6 Nm general vs 5.4/6.2/8.8 Nm by maker, so the card says to follow the printed number. The draft\'s "tighten by feel until firm" is unsourced (draft section 6) and is replaced by the printed torque, or, without a wrench, even tightening a little at a time until the part passes the twist test (the coordinator\'s ruling R1 on PR 59, after I4).',
  },
  'tyre-torn': {
    urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know', 'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot', 'https://www.parktool.com/en-int/blog/calvins-corner/repairing-on-the-ride'],
    note: 'Book p. 48: the repair kit carries a piece of old tyre, about 5 square cm, as a boot. T18 (care pictures redo, 9 November 2026): a boot needs the pressure of a tube to stay in place, so a tubeless tyre gets a tube too, its valve and any metal-tipped plug out first and the sealant wiped off (Park Tool); the card carries the clean cloth for that wipe (review of PR 59, I3).',
  },
  'ebike-no-power': {
    urls: [
      'https://www.ternbicycles.com/be/support/kb/349039/how-troubleshoot-bosch-ebike-system-tern-bikes',
      'https://helpcenter.velo-de-ville.com/en/support/solutions/articles/80001185577-error-patterns-solutions-for-bosch-shimano',
      'https://www.manualslib.com/manual/2912956/Bosch-Bdu336y.html?page=85',
    ],
    note: 'Book p. 215: charge, battery and plugs seated, dirty contacts; the book cleans with a damp cloth and dries fully. Care pictures redo (approved by the owner, 9 November 2026): T19, switch the system off before taking the battery out, refit until it clicks, lock with the key (Bosch PowerTube instructions); some light e-bikes have a battery that only comes out with tools, which stays in. T20, the battery\'s own button where it has one; on Bosch\'s smart system the main button can be on the handlebar remote or the top tube (Tern\'s Bosch guide).',
  },

  // ---- What to carry (group 3) ----
  'carry-spare-tube': {
    urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know', 'https://www.roadbikerider.com/be-a-hero-on-rides-d3/'],
    note: "Book pp. 24 and 48: tubes come in many sizes and valve types; a tube goes in the saddle bag. Tubeless riders carry one too (the tubeless card's step 6).",
  },
  'carry-tyre-levers': { urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'], note: 'Book pp. 24 and 48: always carry tyre levers.' },
  'carry-pump': {
    urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'],
    note: 'Book p. 24: mini pump, frame pump, CO2 inflator and cartridges; only some pumps fit each valve type; "fits your valves" added (book, more careful).',
  },
  'carry-patch-kit': {
    urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'],
    note: 'Book pp. 24 and 48: always carry a patch kit; its contents from p. 48.',
  },
  'carry-plug-kit': { urls: ['https://www.wtb.com/blogs/wtb/how-to-plug-a-puncture-on-a-tubeless-bicycle-tire', 'https://theproscloset.com/blogs/news/how-to-tubeless-tire-plug'] },
  'carry-knife': { urls: ['https://www.wtb.com/blogs/wtb/how-to-plug-a-puncture-on-a-tubeless-bicycle-tire', 'https://theproscloset.com/blogs/news/how-to-tubeless-tire-plug'] },
  'carry-tyre-boot': {
    urls: ['https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot'],
    note: 'Book p. 48: a piece of old tyre, about 5 square cm.',
  },
  'carry-quick-link': {
    urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know', 'https://dealers.bike.shimano.com/product/509187/shimano-cycling-sm-cn910-quick-link'],
    note: "Book p. 159: links that open without tools exist and join by hand; the book's repair kit lists a chain tool, not a link. T21 (care pictures redo, 9 November 2026): the link must match the chain's speeds and make, and most 12-speed links (Shimano, SRAM, KMC) are for one use only.",
  },
  'carry-chain-tool': { urls: [], note: 'Book pp. 24 and 48: a chain tool is in the repair kit.' },
  'carry-multi-tool': {
    urls: [],
    note: "Book p. 24: a multi-tool, tyre levers and a patch kit are the basic puncture kit; the tool must fit the bike's bolts (\"fits the bolts\" added, book, more careful).",
  },
  'carry-zip-ties': { urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'], note: 'Book pp. 48-49: both are in the repair kit; tape for a broken spoke.' },
  'carry-spoke-key': { urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'], note: 'Book p. 24: shown with the tools for the road.' },
  'carry-cloth': {
    urls: [],
    note: "Added back by the coordinator's ruling I3 on PR 59: the cards' steps wipe the rim, the disc and the contacts (book p. 215: a cloth for the contacts; p. 120: touch the disc braking surfaces only with gloves). The draft's own standalone row had \"no source found\".",
  },
  'carry-charger': { urls: ['https://www.bosch-ebike.com/us/help-center/asset-ast-00046', 'https://www.ternbicycles.com/us/node/348455'] },
};
