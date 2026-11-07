// Where each Bike care fact came from (design 3.5, ruling 4): for maintainers and the owner's read, never shipped. Only tests import
// this file (BC-SOURCES-PRIVATE); the app never does, so no link below reaches a build. "book p. N" is the owner's maintenance book
// (German), from the photos the owner sent (content draft, 7 November 2026, two rounds); group 3 adds the Roadside cards and the carry items; the rule used where the book and other sources
// differ: the more careful value ships (decision 6).

export const SOURCES: Record<string, { urls: string[]; note?: string }> = {
  'brakes-pads-disc': {
    urls: [
      'https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation',
      'https://manualmachine.com/shimano/xtr/19567146-service-instructions-manual',
      'https://www.parktool.com/en-us/blog/repair-help/mechanical-disc-brake-alignment',
    ],
    note: 'Weekly: book p. 206 (was monthly). 1.5 mm and the grinding noise: book p. 120; lever step: book p. 121. Disagree: 0.5 mm in one Shimano manual, about 1 mm at Park Tool, 1.5 mm in the book, 3 mm incl. backing in an Avid guide; we use about 1.5 mm (book, more careful) and the pad maker\'s mark if given. The book does not say whether the 1.5 mm includes the metal backing; read as pad material (owner to confirm).',
  },
  'brakes-pads-rim': {
    urls: ['https://www.sheldonbrown.com/rim-brakes.html'],
    note: 'Weekly: book p. 206 (was monthly). Wear mark and toe-in: book p. 211. Scraping noise, scoring in the rim: book p. 110; left/right and top marks: book p. 111.',
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

  // ---- Roadside repairs cards (group 3) ----
  'puncture-tube': {
    urls: [
      'https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know',
      'https://www.roadbikerider.com/be-a-hero-on-rides-d3/',
      'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot',
    ],
    note: 'Book pp. 48-49 and 84-85: the order of work, how to find the hole, pinch-flat slits, patch glue timing, a second check of tyre and rim, the pinched-tube check (book, more careful); p. 209: patch or replace the tube.',
  },
  'puncture-tubeless': {
    urls: ['https://www.wtb.com/blogs/wtb/how-to-plug-a-puncture-on-a-tubeless-bicycle-tire', 'https://theproscloset.com/blogs/news/how-to-tubeless-tire-plug'],
    note: "Not covered by the owner's book pages.",
  },
  'chain-broken': {
    urls: [
      'https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know',
      'https://www.roadbikerider.com/be-a-hero-on-rides-d3/',
      'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot',
    ],
    note: 'Book p. 159: join with a link or pin, then flex the joined link sideways to find a stiff one (book, more careful); p. 215: twisted links and a damaged chain are replaced; p. 48: the repair kit has a chain tool.',
  },
  'spoke-snapped': {
    urls: [
      'https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know',
      'https://www.roadbikerider.com/be-a-hero-on-rides-d3/',
      'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot',
    ],
    note: "Book p. 49: tape the broken spoke or wrap it round a neighbour; pp. 208-209: broken spokes make the wheel wobble. Opening the brake quick release is the draft's step 2, kept as written: for the owner's O5 read.",
  },
  'brake-rub-rim': {
    urls: ['https://www.sheldonbrown.com/rim-brakes.html'],
    note: "Book p. 209: re-seat the wheel, the tyre bead (book, more careful), centre the brake. The draft's centring-screw aside had \"no source found\" and is cut (decision 6); the centring itself is the book's.",
  },
  'brake-rub-disc': {
    urls: [
      'https://www.parktool.com/en-us/blog/repair-help/mechanical-disc-brake-alignment',
      'https://www.parktool.com/en-int/blog/repair-help/hydraulic-disc-brake-alignment',
    ],
    note: 'Book p. 213: bent disc, caliper not centred, pads too close; p. 121: loosen, centre, tighten, squeeze the lever several times.',
  },
  'brake-weak-rim': {
    urls: ['https://www.sheldonbrown.com/rim-brakes.html'],
    note: 'Book p. 211: cleaning, cable and pads; the brake quick release and loose pads (book, more careful); p. 110: a scraping noise means worn pads.',
  },
  'brake-weak-disc': {
    urls: [
      'https://www.parktool.com/en-us/blog/repair-help/disc-brake-pad-removal-installation',
      'https://www.parktool.com/en-us/blog/repair-help/mechanical-disc-brake-alignment',
    ],
    note: 'Book p. 213: oil, worn pads, air in the system (pumping firms the lever when air is in it); p. 120: a grinding noise as the worn-pad sign (book, more careful).',
  },
  'gears-skipping': {
    urls: ['https://www.parktool.com/en-us/product/chain-wear-indicator-cc-3-2'],
    note: 'Book pp. 214-215: stiff links (flex them sideways), worn parts, bent cage or derailleur, dirty chain; pp. 148 and 159: wrong cable tension makes the chain rattle or slip, a stiff link jumps on the rear gears.',
  },
  'bolt-loose': {
    urls: ['https://dedhambike.com/articles/torque-table-pg186.htm', 'https://www.cyclingnews.com/features/torque-wrenches-why-you-need-one-and-how-to-use-them'],
    note: 'Book p. 40: carbon parts are checked with a torque wrench, not by twisting (book, more careful); p. 206: bar and stem bolts tight. Carbon bolt torque: 4-6 Nm general vs 5.4/6.2/8.8 Nm by maker, so the card says to follow the printed number.',
  },
  'tyre-torn': {
    urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know', 'https://www.mec.ca/en/product/5048-270/park-tool-tb-2-emergency-tire-boot'],
    note: 'Book p. 48: the repair kit carries a piece of old tyre, about 5 square cm, as a boot.',
  },
  'ebike-no-power': {
    urls: [
      'https://www.ternbicycles.com/be/support/kb/349039/how-troubleshoot-bosch-ebike-system-tern-bikes',
      'https://helpcenter.velo-de-ville.com/en/support/solutions/articles/80001185577-error-patterns-solutions-for-bosch-shimano',
    ],
    note: 'Book p. 215: charge, battery and plugs seated, dirty contacts; the book cleans with a damp cloth and dries fully.',
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
    urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'],
    note: "Book p. 159: links that open without tools exist and join by hand; the book's repair kit lists a chain tool, not a link.",
  },
  'carry-chain-tool': { urls: [], note: 'Book pp. 24 and 48: a chain tool is in the repair kit.' },
  'carry-multi-tool': {
    urls: [],
    note: "Book p. 24: a multi-tool, tyre levers and a patch kit are the basic puncture kit; the tool must fit the bike's bolts (\"fits the bolts\" added, book, more careful).",
  },
  'carry-zip-ties': { urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'], note: 'Book pp. 48-49: both are in the repair kit; tape for a broken spoke.' },
  'carry-spoke-key': { urls: ['https://www.active.com/cycling/articles/5-roadside-repairs-you-need-to-know'], note: 'Book p. 24: shown with the tools for the road.' },
  'carry-charger': { urls: ['https://www.bosch-ebike.com/us/help-center/asset-ast-00046', 'https://www.ternbicycles.com/us/node/348455'] },
};
