/**
 * The retrieval eval's search queries (roadmap N05): what someone types into
 * search, and which catalog entries a correct answer contains.
 *
 * Grouped by what each one exercises, because the groups fail for different
 * reasons and a single average hides which:
 *
 *  - `name`     — the name, or part of it, typed correctly;
 *  - `typo`     — the name misspelled the way people misspell it;
 *  - `sibling`  — a name whose *number* is the whole difference (Dassai 39
 *    between 45 and 23, Eagle Rare 17 beside 10, Caymus 2019 beside 2021):
 *    the case a sentence embedding is weakest at and a lexical index is not;
 *  - `brand`    — a producer, where the item's own name does not say it;
 *  - `semantic` — a description of what the person wants.
 *
 * `relevant` is every entry a correct answer contains; `recallAt` caps the
 * denominator at k, so a three-answer query is not penalised at k = 1.
 */
import type { ItemType } from "@cellar-assistant/contracts";

export type QueryKind = "name" | "typo" | "sibling" | "brand" | "semantic";

export type EvalQuery = {
  readonly id: string;
  readonly kind: QueryKind;
  readonly text: string;
  /** Narrowed the way a type-scoped picker narrows it; omitted = all six. */
  readonly itemTypes?: readonly ItemType[];
  readonly relevant: readonly string[];
};

export const QUERIES: readonly EvalQuery[] = [
  // ---- name ------------------------------------------------------------
  {
    id: "name-lagavulin-16",
    kind: "name",
    text: "lagavulin 16",
    relevant: ["spirit.lagavulin-16"],
  },
  {
    id: "name-lagavulin",
    kind: "name",
    text: "lagavulin",
    relevant: [
      "spirit.lagavulin-16",
      "spirit.lagavulin-8",
      "spirit.lagavulin-distillers-edition",
    ],
  },
  {
    id: "name-glenlivet",
    kind: "name",
    text: "glenlivet",
    relevant: ["spirit.glenlivet-12", "spirit.glenlivet-18"],
  },
  {
    id: "name-macallan",
    kind: "name",
    text: "macallan sherry oak",
    relevant: [
      "spirit.macallan-12-sherry-oak",
      "spirit.macallan-18-sherry-oak",
    ],
  },
  {
    id: "name-pliny",
    kind: "name",
    text: "pliny the elder",
    relevant: ["beer.pliny-the-elder"],
  },
  {
    id: "name-heady",
    kind: "name",
    text: "heady topper",
    relevant: ["beer.heady-topper"],
  },
  {
    id: "name-dassai-23",
    kind: "name",
    text: "dassai 23",
    relevant: ["sake.dassai-23"],
  },
  {
    id: "name-caymus",
    kind: "name",
    text: "caymus cabernet",
    relevant: [
      "wine.caymus-cabernet-2021",
      "wine.caymus-cabernet-2019",
      "wine.caymus-special-selection-2019",
    ],
  },
  {
    id: "name-tie-guan-yin",
    kind: "name",
    text: "tie guan yin",
    relevant: ["tea.tie-guan-yin"],
  },
  {
    id: "name-kbs",
    kind: "name",
    text: "kbs",
    relevant: ["beer.founders-kbs"],
  },
  // ---- typo ------------------------------------------------------------
  {
    id: "typo-blantons",
    kind: "typo",
    text: "blantons",
    relevant: ["spirit.blantons-original"],
  },
  {
    id: "typo-laphroig",
    kind: "typo",
    text: "laphroig",
    relevant: ["spirit.laphroaig-10", "spirit.laphroaig-quarter-cask"],
  },
  {
    id: "typo-hendricks",
    kind: "typo",
    text: "hendricks gin",
    relevant: ["spirit.hendricks", "spirit.hendricks-orbium"],
  },
  {
    id: "typo-weihenstephaner",
    kind: "typo",
    text: "weihenstefaner",
    relevant: [
      "beer.weihenstephaner-hefeweissbier",
      "beer.weihenstephaner-vitus",
    ],
  },
  {
    id: "typo-veuve",
    kind: "typo",
    text: "veuve cliquot",
    relevant: ["wine.veuve-clicquot-yellow-label", "wine.veuve-clicquot-rose"],
  },
  // ---- sibling ---------------------------------------------------------
  {
    id: "sib-caymus-2019",
    kind: "sibling",
    text: "caymus 2019",
    relevant: [
      "wine.caymus-cabernet-2019",
      "wine.caymus-special-selection-2019",
    ],
  },
  {
    id: "sib-dassai-39",
    kind: "sibling",
    text: "dassai 39",
    relevant: ["sake.dassai-39"],
  },
  {
    id: "sib-kenya-aa",
    kind: "sibling",
    text: "kenya aa",
    relevant: ["coffee.kenya-aa-nyeri"],
  },
  {
    id: "sib-macallan-18",
    kind: "sibling",
    text: "macallan 18",
    relevant: ["spirit.macallan-18-sherry-oak"],
  },
  {
    id: "sib-eagle-rare-17",
    kind: "sibling",
    text: "eagle rare 17",
    relevant: ["spirit.eagle-rare-17"],
  },
  {
    id: "sib-don-julio-1942",
    kind: "sibling",
    text: "don julio 1942",
    relevant: ["spirit.don-julio-1942"],
  },
  {
    id: "sib-tanqueray-10",
    kind: "sibling",
    text: "tanqueray no 10",
    relevant: ["spirit.tanqueray-ten"],
  },
  {
    id: "sib-lagavulin-8",
    kind: "sibling",
    text: "lagavulin 8",
    relevant: ["spirit.lagavulin-8"],
  },
  {
    id: "sib-pliny-younger",
    kind: "sibling",
    text: "pliny the younger",
    relevant: ["beer.pliny-the-younger"],
  },
  {
    id: "sib-pavillon-rouge",
    kind: "sibling",
    text: "pavillon rouge margaux",
    relevant: ["wine.pavillon-rouge-2016"],
  },
  {
    id: "sib-cantillon-kriek",
    kind: "sibling",
    text: "cantillon kriek",
    relevant: ["beer.cantillon-kriek"],
  },
  {
    id: "sib-darjeeling-second",
    kind: "sibling",
    text: "darjeeling second flush",
    relevant: ["tea.darjeeling-second-flush"],
  },
  {
    id: "sib-makers-46",
    kind: "sibling",
    text: "makers 46",
    relevant: ["spirit.makers-mark-46"],
  },
  {
    id: "sib-woodford-double",
    kind: "sibling",
    text: "woodford double oaked",
    relevant: ["spirit.woodford-double-oaked"],
  },
  // ---- brand -----------------------------------------------------------
  {
    id: "brand-buffalo-trace",
    kind: "brand",
    text: "buffalo trace",
    relevant: [
      "spirit.buffalo-trace",
      "spirit.eagle-rare-10",
      "spirit.blantons-original",
      "spirit.eh-taylor-small-batch",
      "spirit.weller-special-reserve",
      "spirit.eagle-rare-17",
    ],
  },
  {
    id: "brand-antinori",
    kind: "brand",
    text: "antinori",
    relevant: [
      "wine.tignanello",
      "wine.antinori-peppoli",
      "wine.guado-al-tasso",
    ],
  },
  {
    id: "brand-twinings",
    kind: "brand",
    text: "twinings tea",
    relevant: [
      "tea.twinings-earl-grey",
      "tea.twinings-english-breakfast",
      "tea.twinings-lady-grey",
    ],
  },
  {
    id: "brand-russian-river",
    kind: "brand",
    text: "russian river brewing",
    relevant: [
      "beer.pliny-the-elder",
      "beer.pliny-the-younger",
      "beer.blind-pig",
    ],
  },
  // ---- semantic --------------------------------------------------------
  {
    id: "sem-smoky-islay",
    kind: "semantic",
    text: "smoky islay scotch",
    relevant: [
      "spirit.lagavulin-16",
      "spirit.laphroaig-10",
      "spirit.lagavulin-8",
      "spirit.lagavulin-distillers-edition",
      "spirit.laphroaig-quarter-cask",
      "spirit.ardbeg-10",
      "spirit.ardbeg-uigeadail",
    ],
  },
  {
    id: "sem-wheated-bourbon",
    kind: "semantic",
    text: "wheated bourbon",
    relevant: [
      "spirit.makers-mark",
      "spirit.weller-special-reserve",
      "spirit.makers-mark-46",
    ],
  },
  {
    id: "sem-nz-sauv-blanc",
    kind: "semantic",
    text: "new zealand sauvignon blanc",
    relevant: [
      "wine.cloudy-bay-sauvignon-blanc",
      "wine.kim-crawford-sauvignon-blanc",
    ],
  },
  {
    id: "sem-mosel-riesling",
    kind: "semantic",
    text: "german riesling from the mosel",
    relevant: ["wine.dr-loosen-blue-slate", "wine.dr-loosen-red-slate"],
  },
  {
    id: "sem-provence-rose",
    kind: "semantic",
    text: "provence rosé",
    relevant: ["wine.whispering-angel", "wine.rock-angel", "wine.miraval-rose"],
  },
  {
    id: "sem-champagne",
    kind: "semantic",
    text: "champagne",
    relevant: [
      "wine.veuve-clicquot-yellow-label",
      "wine.veuve-clicquot-rose",
      "wine.moet-imperial",
    ],
  },
  {
    id: "sem-pinot-noir-wine",
    kind: "semantic",
    text: "pinot noir",
    itemTypes: ["WINE"],
    relevant: [
      "wine.la-crema-pinot-noir",
      "wine.meiomi-pinot-noir",
      "wine.cloudy-bay-pinot-noir",
      "wine.kim-crawford-pinot-noir",
      "wine.belle-glos-clark-telephone",
    ],
  },
  {
    id: "sem-hazy-ipa",
    kind: "semantic",
    text: "hazy new england ipa",
    relevant: [
      "beer.heady-topper",
      "beer.focal-banger",
      "beer.tree-house-julius",
      "beer.sierra-nevada-hazy-little-thing",
    ],
  },
  {
    id: "sem-lambic",
    kind: "semantic",
    text: "belgian sour lambic",
    relevant: [
      "beer.cantillon-gueuze",
      "beer.cantillon-kriek",
      "beer.drie-fonteinen-oude-geuze",
    ],
  },
  {
    id: "sem-barrel-stout",
    kind: "semantic",
    text: "imperial stout aged in bourbon barrels",
    relevant: ["beer.founders-kbs", "beer.bourbon-county-stout"],
  },
  {
    id: "sem-floral-coffee",
    kind: "semantic",
    text: "floral ethiopian coffee",
    itemTypes: ["COFFEE"],
    relevant: ["coffee.ethiopia-yirgacheffe"],
  },
  {
    id: "sem-earthy-coffee",
    kind: "semantic",
    text: "earthy low acid indonesian coffee",
    relevant: ["coffee.sumatra-mandheling", "coffee.sulawesi-toraja"],
  },
  {
    id: "sem-matcha",
    kind: "semantic",
    text: "japanese powdered green tea",
    relevant: ["tea.ippodo-matcha", "tea.marukyu-matcha"],
  },
  {
    id: "sem-smoky-mezcal",
    kind: "semantic",
    text: "smoky mezcal from oaxaca",
    relevant: [
      "spirit.del-maguey-vida",
      "spirit.del-maguey-chichicapa",
      "spirit.montelobos-espadin",
    ],
  },
  {
    id: "sem-aperitivo",
    kind: "semantic",
    text: "bitter italian aperitivo",
    relevant: ["spirit.campari", "spirit.aperol"],
  },
  {
    id: "sem-nigori",
    kind: "semantic",
    text: "cloudy unfiltered sake",
    relevant: ["sake.gekkeikan-nigori", "sake.sho-chiku-bai-nigori"],
  },
];
