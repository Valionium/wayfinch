// Where each Bike care fact came from (design 3.5, ruling 4): for maintainers and the owner's read, never shipped. Only tests import
// this file (BC-SOURCES-PRIVATE); the app never does, so no link below reaches a build. "book p. N" is the owner's maintenance book
// (German), from the photos the owner sent (content draft, 7 November 2026, two rounds); the rule used where the book and other sources
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
};
