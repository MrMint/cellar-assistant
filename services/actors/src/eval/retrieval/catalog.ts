/**
 * The retrieval eval's fixture catalog (roadmap N05).
 *
 * A seeded catalog, written for the eval and nothing else, so a number
 * measured on it means the same thing on every machine. The review that asked
 * for this measured "1–2 of 8 matched" against whatever e2e residue the
 * development database held that day, which is an anecdote; this is the
 * denominator that makes it a number.
 *
 * It is small — the targets below plus `distractors.ts`, about 150 items — but
 * **adversarial on purpose**:
 *
 *  - near-duplicates that only a detail separates — two Caymus vintages,
 *    Dassai 45 and 23, two Marlborough sauvignon blancs, two Islay malts,
 *    three Buffalo Trace bourbons;
 *  - names a vector model is bad at and a lexical index is good at
 *    ("Pliny the Elder", "Heady Topper", "Tie Guan Yin");
 *  - knowledge that lives only in the brand ("Tignanello" is Antinori's,
 *    "Eagle Rare" is Buffalo Trace's), which `embeddingTextFor` did not
 *    embed before N08;
 *  - attributes stored as vocabulary codes (`SCOTCH`, `PILSENER_PILSNER_PILS`,
 *    `junmai_daiginjo`) — what the embedded text spelled verbatim before N08.
 *
 * Every value here is a real vocabulary value in the transformed database
 * (`wine_style`, `spirit_type`, `country`, …); `fixtures.test.ts` checks the
 * bag keys against `ITEM_TYPE_SPECS` and that every expected key in the
 * queries and menus names an entry here.
 *
 * Keys are `<type>.<slug>` and are what the queries and menus refer to. They
 * never reach the database: `seed.ts` mints a uuid per entry and maps back.
 */
import type { ItemType } from "@cellar-assistant/contracts";
import { DISTRACTORS } from "./distractors.ts";

export type CatalogEntry = {
  readonly key: string;
  readonly type: ItemType;
  readonly name: string;
  readonly description?: string;
  readonly country?: string;
  /** The wire-keyed attribute bag (`ITEM_TYPE_SPECS[type].attributes`). */
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  /** Brand names, primary first. Seeded into `brands` + `item_brands`. */
  readonly brands?: readonly string[];
};

const spirits: readonly CatalogEntry[] = [
  {
    key: "spirit.lagavulin-16",
    type: "SPIRIT",
    name: "Lagavulin 16 Year Old",
    description:
      "Islay single malt with intense peat smoke, iodine, and a rich sweetness from long maturation.",
    country: "SCOTLAND",
    attributes: { spiritType: "SCOTCH", alcoholContentPercentage: 43 },
    brands: ["Lagavulin"],
  },
  {
    key: "spirit.laphroaig-10",
    type: "SPIRIT",
    name: "Laphroaig 10 Year Old",
    description:
      "Medicinal, heavily peated Islay single malt with seaweed, smoke and a salty finish.",
    country: "SCOTLAND",
    attributes: { spiritType: "SCOTCH", alcoholContentPercentage: 40 },
    brands: ["Laphroaig"],
  },
  {
    key: "spirit.glenlivet-12",
    type: "SPIRIT",
    name: "The Glenlivet 12 Year Old",
    description:
      "Speyside single malt, fruity and floral with pineapple, vanilla and honey.",
    country: "SCOTLAND",
    attributes: { spiritType: "SCOTCH", alcoholContentPercentage: 40 },
    brands: ["The Glenlivet"],
  },
  {
    key: "spirit.macallan-12-sherry-oak",
    type: "SPIRIT",
    name: "The Macallan 12 Year Old Sherry Oak",
    description:
      "Speyside single malt matured exclusively in sherry-seasoned oak casks: dried fruit, ginger and wood spice.",
    country: "SCOTLAND",
    attributes: { spiritType: "SCOTCH", alcoholContentPercentage: 43 },
    brands: ["The Macallan"],
  },
  {
    key: "spirit.buffalo-trace",
    type: "SPIRIT",
    name: "Buffalo Trace Kentucky Straight Bourbon",
    description: "Vanilla, toffee and mint with a hint of molasses.",
    country: "UNITED_STATES",
    attributes: { spiritType: "BOURBON", alcoholContentPercentage: 45 },
    brands: ["Buffalo Trace"],
  },
  {
    key: "spirit.eagle-rare-10",
    type: "SPIRIT",
    name: "Eagle Rare 10 Year",
    description:
      "Single barrel, aged ten years: oak, honey, leather and orange peel.",
    country: "UNITED_STATES",
    attributes: { spiritType: "BOURBON", alcoholContentPercentage: 45 },
    brands: ["Buffalo Trace"],
  },
  {
    key: "spirit.blantons-original",
    type: "SPIRIT",
    name: "Blanton's Original Single Barrel",
    description:
      "Citrus, caramel and nutmeg from a single hand-selected barrel.",
    country: "UNITED_STATES",
    attributes: { spiritType: "BOURBON", alcoholContentPercentage: 46.5 },
    brands: ["Buffalo Trace"],
  },
  {
    key: "spirit.makers-mark",
    type: "SPIRIT",
    name: "Maker's Mark",
    description:
      "Made with soft red winter wheat instead of rye: caramel, vanilla and a gentle finish.",
    country: "UNITED_STATES",
    attributes: { spiritType: "BOURBON", alcoholContentPercentage: 45 },
    brands: ["Maker's Mark"],
  },
  {
    key: "spirit.woodford-reserve",
    type: "SPIRIT",
    name: "Woodford Reserve Distiller's Select",
    description: "Rich dried fruit, cocoa and toasted oak.",
    country: "UNITED_STATES",
    attributes: { spiritType: "BOURBON", alcoholContentPercentage: 45.2 },
    brands: ["Woodford Reserve"],
  },
  {
    key: "spirit.hendricks",
    type: "SPIRIT",
    name: "Hendrick's Gin",
    description: "Infused with Bulgarian rose and cucumber.",
    country: "SCOTLAND",
    attributes: { spiritType: "GIN", alcoholContentPercentage: 41.4 },
    brands: ["Hendrick's"],
  },
  {
    key: "spirit.tanqueray",
    type: "SPIRIT",
    name: "Tanqueray London Dry Gin",
    description: "Juniper-forward, with coriander, angelica and liquorice.",
    country: "UNITED_KINGDOM",
    attributes: { spiritType: "GIN", alcoholContentPercentage: 43.1 },
    brands: ["Tanqueray"],
  },
  {
    key: "spirit.don-julio-blanco",
    type: "SPIRIT",
    name: "Don Julio Blanco",
    description: "Unaged 100% blue agave, crisp citrus and black pepper.",
    country: "MEXICO",
    attributes: { spiritType: "TEQUILA", alcoholContentPercentage: 40 },
    brands: ["Don Julio"],
  },
  {
    key: "spirit.clase-azul-reposado",
    type: "SPIRIT",
    name: "Clase Azul Reposado",
    description:
      "Rested eight months in oak: vanilla, caramel and cooked agave.",
    country: "MEXICO",
    attributes: { spiritType: "TEQUILA", alcoholContentPercentage: 40 },
    brands: ["Clase Azul"],
  },
  {
    key: "spirit.del-maguey-vida",
    type: "SPIRIT",
    name: "Del Maguey Vida",
    description:
      "Espadín agave roasted in earthen pits in Oaxaca: smoke, fruit and spice.",
    country: "MEXICO",
    attributes: { spiritType: "MEZCAL", alcoholContentPercentage: 42 },
    brands: ["Del Maguey"],
  },
  {
    key: "spirit.appleton-12",
    type: "SPIRIT",
    name: "Appleton Estate 12 Year Old Rare Casks",
    description: "Pot and column still blend: orange peel, cocoa, molasses.",
    country: "JAMAICA",
    attributes: { spiritType: "RUM", alcoholContentPercentage: 43 },
    brands: ["Appleton Estate"],
  },
  {
    key: "spirit.hennessy-vsop",
    type: "SPIRIT",
    name: "Hennessy V.S.O.P Privilège",
    description: "Cognac with vanilla, cinnamon and toasted notes.",
    country: "FRANCE",
    attributes: { spiritType: "BRANDY_COGNAC", alcoholContentPercentage: 40 },
    brands: ["Hennessy"],
  },
  {
    key: "spirit.campari",
    type: "SPIRIT",
    name: "Campari",
    description: "Bitter red Italian aperitivo with orange peel and herbs.",
    country: "ITALY",
    attributes: {
      spiritType: "AMARO_APERITIF_VERMOUTH",
      alcoholContentPercentage: 24,
    },
    brands: ["Campari"],
  },
  {
    key: "spirit.jameson",
    type: "SPIRIT",
    name: "Jameson Irish Whiskey",
    description:
      "Triple distilled blended whiskey: smooth, vanilla, toasted wood.",
    country: "IRELAND",
    attributes: { spiritType: "WHISKEY", alcoholContentPercentage: 40 },
    brands: ["Jameson"],
  },
];

const wines: readonly CatalogEntry[] = [
  {
    key: "wine.caymus-cabernet-2021",
    type: "WINE",
    name: "Caymus Napa Valley Cabernet Sauvignon",
    description: "Ripe dark fruit, cocoa and velvety tannins.",
    country: "UNITED_STATES",
    attributes: {
      vintage: "2021-01-01",
      style: "RED",
      variety: "CABERNET_SAUVIGNON",
      region: "Napa Valley",
      alcoholContentPercentage: 14.8,
    },
    brands: ["Caymus Vineyards"],
  },
  {
    key: "wine.caymus-cabernet-2019",
    type: "WINE",
    name: "Caymus Napa Valley Cabernet Sauvignon",
    description: "Ripe dark fruit, cocoa and velvety tannins.",
    country: "UNITED_STATES",
    attributes: {
      vintage: "2019-01-01",
      style: "RED",
      variety: "CABERNET_SAUVIGNON",
      region: "Napa Valley",
      alcoholContentPercentage: 14.6,
    },
    brands: ["Caymus Vineyards"],
  },
  {
    key: "wine.cloudy-bay-sauvignon-blanc",
    type: "WINE",
    name: "Cloudy Bay Sauvignon Blanc",
    description: "Passionfruit, lime and a flinty, mineral finish.",
    country: "NEW_ZEALAND",
    attributes: {
      vintage: "2023-01-01",
      style: "WHITE",
      variety: "SAUVIGNON_BLANC",
      region: "Marlborough",
    },
    brands: ["Cloudy Bay"],
  },
  {
    key: "wine.kim-crawford-sauvignon-blanc",
    type: "WINE",
    name: "Kim Crawford Sauvignon Blanc",
    description: "Tropical fruit, citrus and fresh herbs.",
    country: "NEW_ZEALAND",
    attributes: {
      vintage: "2023-01-01",
      style: "WHITE",
      variety: "SAUVIGNON_BLANC",
      region: "Marlborough",
    },
    brands: ["Kim Crawford"],
  },
  {
    key: "wine.dr-loosen-blue-slate",
    type: "WINE",
    name: "Dr. Loosen Blue Slate Riesling Kabinett",
    description: "Off-dry, peach and slate minerality.",
    country: "GERMANY",
    attributes: {
      vintage: "2022-01-01",
      style: "WHITE",
      variety: "RIESLING",
      region: "Mosel",
      specialDesignation: "Kabinett",
    },
    brands: ["Dr. Loosen"],
  },
  {
    key: "wine.whispering-angel",
    type: "WINE",
    name: "Whispering Angel Rosé",
    description: "Pale pink, strawberry and citrus, dry finish.",
    country: "FRANCE",
    attributes: {
      vintage: "2023-01-01",
      style: "ROSE",
      variety: "GRENACHE",
      region: "Côtes de Provence",
    },
    brands: ["Château d'Esclans"],
  },
  {
    key: "wine.veuve-clicquot-yellow-label",
    type: "WINE",
    name: "Veuve Clicquot Yellow Label Brut",
    description: "Toasty brioche, apple and fine bubbles.",
    country: "FRANCE",
    attributes: {
      vintage: "2020-01-01",
      style: "SPARKLING",
      variety: "CHAMPAGNE",
      region: "Champagne",
    },
    brands: ["Veuve Clicquot"],
  },
  {
    key: "wine.la-crema-pinot-noir",
    type: "WINE",
    name: "La Crema Sonoma Coast Pinot Noir",
    description: "Cherry, raspberry and baking spice.",
    country: "UNITED_STATES",
    attributes: {
      vintage: "2022-01-01",
      style: "RED",
      variety: "PINOT_NOIR",
      region: "Sonoma Coast",
    },
    brands: ["La Crema"],
  },
  {
    key: "wine.meiomi-pinot-noir",
    type: "WINE",
    name: "Meiomi Pinot Noir",
    description: "Jammy strawberry, mocha and vanilla.",
    country: "UNITED_STATES",
    attributes: {
      vintage: "2022-01-01",
      style: "RED",
      variety: "PINOT_NOIR",
      region: "California",
    },
    brands: ["Meiomi"],
  },
  {
    key: "wine.tignanello",
    type: "WINE",
    name: "Tignanello",
    description: "Super Tuscan: cherry, tobacco and firm tannins.",
    country: "ITALY",
    attributes: {
      vintage: "2020-01-01",
      style: "RED",
      variety: "SANGIOVESE",
      region: "Toscana",
    },
    brands: ["Antinori"],
  },
  {
    key: "wine.catena-malbec",
    type: "WINE",
    name: "Catena Malbec",
    description: "High-altitude: violet, blackberry and mocha.",
    country: "ARGENTINA",
    attributes: {
      vintage: "2021-01-01",
      style: "RED",
      variety: "MALBEC",
      region: "Mendoza",
    },
    brands: ["Catena Zapata"],
  },
  {
    key: "wine.santa-margherita-pinot-grigio",
    type: "WINE",
    name: "Santa Margherita Pinot Grigio",
    description: "Crisp, golden apple and citrus.",
    country: "ITALY",
    attributes: {
      vintage: "2023-01-01",
      style: "WHITE",
      variety: "PINOT_GRIGIO_PINOT_GRIS",
      region: "Alto Adige",
    },
    brands: ["Santa Margherita"],
  },
  {
    key: "wine.la-marca-prosecco",
    type: "WINE",
    name: "La Marca Prosecco",
    description: "Green apple, honeysuckle and lively bubbles.",
    country: "ITALY",
    attributes: {
      vintage: "2023-01-01",
      style: "SPARKLING",
      variety: "PROSECCO",
      region: "Veneto",
    },
    brands: ["La Marca"],
  },
  {
    key: "wine.chateau-margaux-2015",
    type: "WINE",
    name: "Château Margaux",
    description: "First growth Bordeaux: cassis, violet, cedar.",
    country: "FRANCE",
    attributes: {
      vintage: "2015-01-01",
      style: "RED",
      variety: "CABERNET_SAUVIGNON",
      region: "Margaux",
      specialDesignation: "Premier Grand Cru Classé",
    },
    brands: ["Château Margaux"],
  },
  {
    key: "wine.rombauer-chardonnay",
    type: "WINE",
    name: "Rombauer Chardonnay",
    description: "Buttery, vanilla, ripe peach and toasted oak.",
    country: "UNITED_STATES",
    attributes: {
      vintage: "2022-01-01",
      style: "WHITE",
      variety: "CHARDONNAY",
      region: "Carneros",
    },
    brands: ["Rombauer Vineyards"],
  },
];

const beers: readonly CatalogEntry[] = [
  {
    key: "beer.guinness-draught",
    type: "BEER",
    name: "Guinness Draught",
    description: "Nitrogenated, roasted barley, creamy head.",
    country: "IRELAND",
    attributes: { style: "STOUT", alcoholContentPercentage: 4.2 },
    brands: ["Guinness"],
  },
  {
    key: "beer.pliny-the-elder",
    type: "BEER",
    name: "Pliny the Elder",
    description: "Double IPA: pine, citrus and a firm bitterness.",
    country: "UNITED_STATES",
    attributes: {
      style: "INDIA_PALE_ALE",
      alcoholContentPercentage: 8,
      internationalBitternessUnit: 100,
    },
    brands: ["Russian River Brewing"],
  },
  {
    key: "beer.heady-topper",
    type: "BEER",
    name: "Heady Topper",
    description: "Unfiltered hazy New England double IPA, tropical hops.",
    country: "UNITED_STATES",
    attributes: { style: "INDIA_PALE_ALE", alcoholContentPercentage: 8 },
    brands: ["The Alchemist"],
  },
  {
    key: "beer.sierra-nevada-pale-ale",
    type: "BEER",
    name: "Sierra Nevada Pale Ale",
    description: "Cascade hops: grapefruit and pine.",
    country: "UNITED_STATES",
    attributes: { style: "PALE_ALE", alcoholContentPercentage: 5.6 },
    brands: ["Sierra Nevada"],
  },
  {
    key: "beer.weihenstephaner-hefeweissbier",
    type: "BEER",
    name: "Weihenstephaner Hefeweissbier",
    description: "Bavarian wheat beer: banana and clove.",
    country: "GERMANY",
    attributes: { style: "HEFEWEIZEN", alcoholContentPercentage: 5.4 },
    brands: ["Weihenstephan"],
  },
  {
    key: "beer.pilsner-urquell",
    type: "BEER",
    name: "Pilsner Urquell",
    description: "The original Czech pale lager: Saaz hops, soft malt.",
    country: "CZECH_REPUBLIC",
    attributes: {
      style: "PILSENER_PILSNER_PILS",
      alcoholContentPercentage: 4.4,
    },
    brands: ["Pilsner Urquell"],
  },
  {
    key: "beer.duvel",
    type: "BEER",
    name: "Duvel",
    description: "Belgian strong golden ale, bottle conditioned.",
    country: "BELGIUM",
    attributes: { style: "BLONDE_ALE", alcoholContentPercentage: 8.5 },
    brands: ["Duvel Moortgat"],
  },
  {
    key: "beer.allagash-white",
    type: "BEER",
    name: "Allagash White",
    description: "Belgian-style wheat beer with coriander and orange peel.",
    country: "UNITED_STATES",
    attributes: { style: "WITBIER", alcoholContentPercentage: 5.2 },
    brands: ["Allagash Brewing"],
  },
  {
    key: "beer.founders-kbs",
    type: "BEER",
    name: "Founders KBS",
    description:
      "Imperial stout brewed with coffee and chocolate, aged in bourbon barrels.",
    country: "UNITED_STATES",
    attributes: { style: "STOUT", alcoholContentPercentage: 12 },
    brands: ["Founders Brewing"],
  },
  {
    key: "beer.cantillon-gueuze",
    type: "BEER",
    name: "Cantillon Gueuze 100% Lambic Bio",
    description:
      "Spontaneously fermented blend of one-, two- and three-year-old lambic: tart and funky.",
    country: "BELGIUM",
    attributes: { style: "GEUZE", alcoholContentPercentage: 5.5 },
    brands: ["Cantillon"],
  },
  {
    key: "beer.modelo-especial",
    type: "BEER",
    name: "Modelo Especial",
    description: "Crisp Mexican pilsner-style lager.",
    country: "MEXICO",
    attributes: {
      style: "PILSENER_PILSNER_PILS",
      alcoholContentPercentage: 4.4,
    },
    brands: ["Modelo"],
  },
  {
    key: "beer.sapporo-premium",
    type: "BEER",
    name: "Sapporo Premium",
    description: "Refreshing Japanese rice lager.",
    country: "JAPAN",
    attributes: {
      style: "PILSENER_PILSNER_PILS",
      alcoholContentPercentage: 4.9,
    },
    brands: ["Sapporo"],
  },
];

const coffees: readonly CatalogEntry[] = [
  {
    key: "coffee.ethiopia-yirgacheffe",
    type: "COFFEE",
    name: "Ethiopia Yirgacheffe Kochere",
    description: "Jasmine, bergamot and lemon; tea-like body.",
    country: "ETHIOPIA",
    attributes: {
      roastLevel: "LIGHT",
      process: "WASHED",
      species: "ARABICA",
      cultivar: "YIRGACHEFFE",
    },
  },
  {
    key: "coffee.colombia-huila",
    type: "COFFEE",
    name: "Colombia Huila Supremo",
    description: "Caramel, red apple and milk chocolate.",
    country: "COLOMBIA",
    attributes: {
      roastLevel: "MEDIUM",
      process: "WASHED",
      species: "ARABICA",
      cultivar: "CATURRA",
    },
  },
  {
    key: "coffee.kenya-aa-nyeri",
    type: "COFFEE",
    name: "Kenya AA Nyeri",
    description: "Blackcurrant, grapefruit and a bright, winey acidity.",
    country: "KENYA",
    attributes: {
      roastLevel: "LIGHT_MEDIUM",
      process: "WASHED",
      species: "ARABICA",
      cultivar: "SL28",
    },
  },
  {
    key: "coffee.sumatra-mandheling",
    type: "COFFEE",
    name: "Sumatra Mandheling",
    description: "Earthy and full-bodied: cedar, dark chocolate, low acidity.",
    country: "INDONESIA",
    attributes: {
      roastLevel: "DARK",
      process: "WET_HULLED",
      species: "ARABICA",
      cultivar: "SUMATRA",
    },
  },
  {
    key: "coffee.guatemala-antigua",
    type: "COFFEE",
    name: "Guatemala Antigua",
    description: "Cocoa, spice and toasted nut.",
    country: "GUATEMALA",
    attributes: {
      roastLevel: "MEDIUM",
      process: "WASHED",
      species: "ARABICA",
      cultivar: "BOURBON",
    },
  },
  {
    key: "coffee.esmeralda-geisha",
    type: "COFFEE",
    name: "Hacienda La Esmeralda Geisha",
    description: "Jasmine, white peach and tropical fruit.",
    country: "PANAMA",
    attributes: {
      roastLevel: "LIGHT",
      process: "NATURAL_DRY",
      species: "ARABICA",
      cultivar: "GEISHA",
    },
  },
  {
    key: "coffee.stumptown-hair-bender",
    type: "COFFEE",
    name: "Stumptown Hair Bender",
    description: "Espresso blend: dark chocolate, cherry and toffee.",
    country: "UNITED_STATES",
    attributes: {
      roastLevel: "MEDIUM_DARK",
      process: "WASHED",
      species: "ARABICA",
    },
    brands: ["Stumptown Coffee Roasters"],
  },
];

const sakes: readonly CatalogEntry[] = [
  {
    key: "sake.dassai-45",
    type: "SAKE",
    name: "Dassai 45",
    description: "Melon and pear, clean finish.",
    country: "JAPAN",
    attributes: {
      category: "junmai_daiginjo",
      sakeType: "fruity",
      riceVariety: "yamadanishiki",
      region: "Yamaguchi",
      polishGrade: 45,
      alcoholContentPercentage: 16,
    },
    brands: ["Asahi Shuzo"],
  },
  {
    key: "sake.dassai-23",
    type: "SAKE",
    name: "Dassai 23",
    description: "Rice polished to 23%: delicate, honeydew and white flowers.",
    country: "JAPAN",
    attributes: {
      category: "junmai_daiginjo",
      sakeType: "floral",
      riceVariety: "yamadanishiki",
      region: "Yamaguchi",
      polishGrade: 23,
      alcoholContentPercentage: 16,
    },
    brands: ["Asahi Shuzo"],
  },
  {
    key: "sake.kubota-manju",
    type: "SAKE",
    name: "Kubota Manju",
    description: "Elegant and smooth, Niigata's flagship.",
    country: "JAPAN",
    attributes: {
      category: "junmai_daiginjo",
      sakeType: "light",
      region: "Niigata",
      polishGrade: 50,
    },
    brands: ["Asahi Shuzo Niigata"],
  },
  {
    key: "sake.hakkaisan-tokubetsu-honjozo",
    type: "SAKE",
    name: "Hakkaisan Tokubetsu Honjozo",
    description: "Crisp, dry and clean; good warm or chilled.",
    country: "JAPAN",
    attributes: {
      category: "tokubetsu_honjozo",
      sakeType: "dry",
      region: "Niigata",
      servingTemperature: "nuru_kan",
    },
    brands: ["Hakkaisan"],
  },
  {
    key: "sake.gekkeikan-nigori",
    type: "SAKE",
    name: "Gekkeikan Nigori",
    description: "Coarsely filtered, cloudy and creamy with coconut sweetness.",
    country: "JAPAN",
    attributes: {
      category: "nigorizake",
      sakeType: "sweet",
      region: "Kyoto",
      servingTemperature: "rei_shu",
    },
    brands: ["Gekkeikan"],
  },
];

const teas: readonly CatalogEntry[] = [
  {
    key: "tea.tie-guan-yin",
    type: "TEA",
    name: "Tie Guan Yin",
    description: "Iron Goddess of Mercy: floral, orchid, creamy.",
    country: "CHINA",
    attributes: {
      category: "oolong",
      form: "loose_leaf",
      caffeineLevel: "medium",
      region: "Anxi, Fujian",
    },
  },
  {
    key: "tea.longjing",
    type: "TEA",
    name: "West Lake Longjing",
    description: "Dragon Well pan-fired green tea: chestnut and fresh grass.",
    country: "CHINA",
    attributes: {
      category: "green",
      form: "loose_leaf",
      caffeineLevel: "medium",
      region: "Hangzhou, Zhejiang",
    },
  },
  {
    key: "tea.darjeeling-first-flush",
    type: "TEA",
    name: "Darjeeling First Flush FTGFOP1",
    description: "Spring harvest: muscatel, light and floral.",
    country: "INDIA",
    attributes: {
      category: "black",
      form: "loose_leaf",
      caffeineLevel: "high",
      region: "Darjeeling",
    },
  },
  {
    key: "tea.twinings-earl-grey",
    type: "TEA",
    name: "Twinings Earl Grey",
    description: "Black tea scented with bergamot.",
    country: "UNITED_KINGDOM",
    attributes: {
      category: "black",
      form: "tea_bag",
      caffeineLevel: "high",
      ingredients: "black tea, bergamot oil",
    },
    brands: ["Twinings"],
  },
  {
    key: "tea.ippodo-matcha",
    type: "TEA",
    name: "Ippodo Ummon-no-mukashi Matcha",
    description: "Ceremonial grade powdered green tea from Uji: deep umami.",
    country: "JAPAN",
    attributes: {
      category: "green",
      form: "matcha_powder",
      caffeineLevel: "high",
      region: "Uji, Kyoto",
    },
    brands: ["Ippodo"],
  },
  {
    key: "tea.rooibos-vanilla",
    type: "TEA",
    name: "Rooibos Vanilla",
    description: "Caffeine-free red bush with vanilla.",
    country: "SOUTH_AFRICA",
    attributes: {
      category: "rooibos",
      form: "loose_leaf",
      caffeineLevel: "none",
    },
  },
];

/**
 * Every seeded item: the targets the queries and menus are about, then the
 * hard negatives that make choosing them hard (`distractors.ts`).
 */
export const CATALOG: readonly CatalogEntry[] = [
  ...spirits,
  ...wines,
  ...beers,
  ...coffees,
  ...sakes,
  ...teas,
  ...DISTRACTORS,
];

export const catalogEntry = (key: string): CatalogEntry => {
  const entry = CATALOG.find((candidate) => candidate.key === key);
  if (entry === undefined) throw new Error(`no catalog entry ${key}`);
  return entry;
};
