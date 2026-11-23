/**
 * The demo dataset `demo-seed.ts` writes: every name, number and relationship,
 * and nothing else. Synthetic: no row here was copied from any real database.
 *
 * The shape follows how the app is actually used — beer-heavy, ratings
 * clustered between 3.5 and 4.5, one cellar shared with friends, one long tier
 * list — so the screens look like a real collection rather than a fixture.
 *
 * Keys (`w_ridge`, `home`, `copper`, …) are stable handles: `demo-seed.ts`
 * derives every client-minted id from them, which is what makes a second run
 * a no-op. Renaming a key mints a new row, so don't.
 */

export type ItemType = "WINE" | "BEER" | "SPIRIT" | "COFFEE" | "SAKE" | "TEA";

export type DemoItem = {
  readonly key: string;
  readonly type: ItemType;
  readonly name: string;
  readonly brand: string;
  readonly country: string;
  readonly description?: string;
  /** The type's attribute input (`WineAttributesInput`, …), as sent. */
  readonly attrs: Record<string, unknown>;
  /** test@test.com's opinion of it, 0–5. Ratings and drink-log scores centre here. */
  readonly score: number;
};

const wine = (
  key: string,
  name: string,
  brand: string,
  country: string,
  style: string,
  variety: string,
  region: string,
  vintage: number | null,
  abv: number,
  score: number,
): DemoItem => ({
  key,
  type: "WINE",
  name,
  brand,
  country,
  score,
  attrs: {
    style,
    variety,
    region,
    alcoholContentPercentage: abv,
    // Explicit null for NV: an absent vintage is refused rather than guessed.
    vintage: vintage === null ? null : `${vintage}-01-01`,
  },
});

const beer = (
  key: string,
  name: string,
  brand: string,
  country: string,
  style: string,
  abv: number,
  ibu: number,
  score: number,
): DemoItem => ({
  key,
  type: "BEER",
  name,
  brand,
  country,
  score,
  attrs: {
    style,
    alcoholContentPercentage: abv,
    internationalBitternessUnit: ibu,
  },
});

const spirit = (
  key: string,
  name: string,
  brand: string,
  country: string,
  spiritType: string,
  abv: number,
  score: number,
): DemoItem => ({
  key,
  type: "SPIRIT",
  name,
  brand,
  country,
  score,
  attrs: { spiritType, alcoholContentPercentage: abv },
});

const coffee = (
  key: string,
  name: string,
  brand: string,
  country: string,
  cultivar: string,
  process: string,
  roastLevel: string,
  score: number,
): DemoItem => ({
  key,
  type: "COFFEE",
  name,
  brand,
  country,
  score,
  attrs: { cultivar, process, roastLevel, species: "ARABICA" },
});

const sake = (
  key: string,
  name: string,
  brand: string,
  category: string,
  riceVariety: string,
  polishGrade: number,
  region: string,
  sakeType: string,
  score: number,
): DemoItem => ({
  key,
  type: "SAKE",
  name,
  brand,
  country: "JAPAN",
  score,
  attrs: {
    category,
    riceVariety,
    polishGrade,
    region,
    sakeType,
    alcoholContentPercentage: 16,
    servingTemperature: "rei_shu",
  },
});

const tea = (
  key: string,
  name: string,
  brand: string,
  country: string,
  category: string,
  region: string,
  harvestYear: number,
  score: number,
): DemoItem => ({
  key,
  type: "TEA",
  name,
  brand,
  country,
  score,
  attrs: { category, region, harvestYear, form: "loose_leaf" },
});

// biome-ignore format: one row per item reads as a table
export const ITEMS: readonly DemoItem[] = [
  // Wine
  wine("w_ridge", "Ridge Lytton Springs", "Ridge Vineyards", "UNITED_STATES", "RED", "ZINFANDEL", "Dry Creek Valley", 2019, 14.5, 4.5),
  wine("w_tempier", "Domaine Tempier Bandol Rouge", "Domaine Tempier", "FRANCE", "RED", "MOURVEDRE_MONASTRELL", "Bandol", 2018, 14, 4.5),
  wine("w_barbaresco", "Produttori del Barbaresco", "Produttori del Barbaresco", "ITALY", "RED", "NEBBIOLO", "Piedmont", 2017, 14, 4),
  wine("w_cloudy", "Cloudy Bay Sauvignon Blanc", "Cloudy Bay", "NEW_ZEALAND", "WHITE", "SAUVIGNON_BLANC", "Marlborough", 2023, 13.5, 3.5),
  wine("w_loosen", "Dr. Loosen Blue Slate Riesling Kabinett", "Dr. Loosen", "GERMANY", "WHITE", "RIESLING", "Mosel", 2021, 8, 4),
  wine("w_catena", "Catena Zapata Malbec Argentino", "Bodega Catena Zapata", "ARGENTINA", "RED", "MALBEC", "Mendoza", 2019, 13.5, 4),
  wine("w_billecart", "Billecart-Salmon Brut Rosé", "Billecart-Salmon", "FRANCE", "SPARKLING", "CHAMPAGNE", "Champagne", null, 12, 4.5),
  wine("w_muga", "Muga Reserva Rioja", "Bodegas Muga", "SPAIN", "RED", "TEMPRANILLO", "Rioja", 2019, 14, 3.5),
  wine("w_guiraud", "Château Guiraud Sauternes", "Château Guiraud", "FRANCE", "DESSERT", "SEMILLON", "Sauternes", 2015, 13.5, 4),
  wine("w_musar", "Château Musar Rouge", "Château Musar", "LEBANON", "RED", "RED_BLEND", "Bekaa Valley", 2016, 14, 4.5),
  wine("w_vietti", "Vietti Barbera d'Asti Tre Vigne", "Vietti", "ITALY", "RED", "BARBERA", "Piedmont", 2021, 14, 3.5),
  wine("w_tondonia", "López de Heredia Viña Tondonia Blanco Reserva", "R. López de Heredia", "SPAIN", "WHITE", "BLEND", "Rioja", 2011, 12.5, 4.5),
  // Beer
  beer("b_pliny", "Pliny the Elder", "Russian River Brewing Company", "UNITED_STATES", "INDIA_PALE_ALE", 8, 100, 4.5),
  beer("b_weihen", "Weihenstephaner Hefeweissbier", "Bayerische Staatsbrauerei Weihenstephan", "GERMANY", "HEFEWEIZEN", 5.4, 14, 4),
  beer("b_spotted", "New Glarus Spotted Cow", "New Glarus Brewing Co.", "UNITED_STATES", "CREAM_ALE", 4.8, 18, 3.5),
  beer("b_guinness", "Guinness Draught", "Guinness", "IRELAND", "STOUT", 4.2, 45, 3),
  beer("b_dupont", "Saison Dupont", "Brasserie Dupont", "BELGIUM", "SAISON", 6.5, 30, 4.5),
  beer("b_urquell", "Pilsner Urquell", "Plzeňský Prazdroj", "CZECH_REPUBLIC", "PILSENER_PILSNER_PILS", 4.4, 40, 3.5),
  beer("b_twohearted", "Bell's Two Hearted IPA", "Bell's Brewery", "UNITED_STATES", "INDIA_PALE_ALE", 7, 55, 4),
  beer("b_kbs", "Founders Breakfast Stout", "Founders Brewing Co.", "UNITED_STATES", "STOUT", 8.3, 60, 4),
  beer("b_rodenbach", "Rodenbach Grand Cru", "Brouwerij Rodenbach", "BELGIUM", "FLANDERS_RED_ALE", 6, 15, 4),
  beer("b_orval", "Orval", "Brasserie d'Orval", "BELGIUM", "PALE_ALE", 6.2, 36, 4.5),
  beer("b_celebrator", "Ayinger Celebrator Doppelbock", "Privatbrauerei Ayinger", "GERMANY", "DOPPELBOCK", 6.7, 24, 4),
  beer("b_allagash", "Allagash White", "Allagash Brewing Company", "UNITED_STATES", "WITBIER", 5.2, 13, 3.5),
  beer("b_julius", "Tree House Julius", "Tree House Brewing Company", "UNITED_STATES", "INDIA_PALE_ALE", 6.8, 72, 4.5),
  beer("b_aventinus", "Schneider Aventinus", "Schneider Weisse", "GERMANY", "WEIZENBOCK", 8.2, 16, 4),
  beer("b_cantillon", "Cantillon Gueuze 100% Lambic Bio", "Brasserie Cantillon", "BELGIUM", "GEUZE", 5.5, 10, 4.5),
  beer("b_sierra", "Sierra Nevada Pale Ale", "Sierra Nevada Brewing Co.", "UNITED_STATES", "PALE_ALE", 5.6, 38, 3.5),
  beer("b_augustiner", "Augustiner Lagerbier Hell", "Augustiner-Bräu", "GERMANY", "HELLES", 5.2, 20, 4),
  beer("b_edward", "Hill Farmstead Edward", "Hill Farmstead Brewery", "UNITED_STATES", "PALE_ALE", 5.2, 50, 4.5),
  beer("b_zombie", "3 Floyds Zombie Dust", "Three Floyds Brewing", "UNITED_STATES", "PALE_ALE", 6.4, 50, 4),
  beer("b_rasputin", "North Coast Old Rasputin", "North Coast Brewing Co.", "UNITED_STATES", "STOUT", 9, 75, 3.5),
  beer("b_duvel", "Duvel", "Duvel Moortgat", "BELGIUM", "BLONDE_ALE", 8.5, 32, 4),
  // Spirit
  spirit("s_lagavulin", "Lagavulin 16 Year Old", "Lagavulin", "SCOTLAND", "SCOTCH", 43, 4.5),
  spirit("s_buffalo", "Buffalo Trace Kentucky Straight Bourbon", "Buffalo Trace Distillery", "UNITED_STATES", "BOURBON", 45, 3.5),
  spirit("s_hendricks", "Hendrick's Gin", "Hendrick's", "SCOTLAND", "GIN", 41.4, 3.5),
  spirit("s_vida", "Del Maguey Vida Mezcal", "Del Maguey", "MEXICO", "MEZCAL", 42, 4),
  spirit("s_campari", "Campari", "Campari", "ITALY", "AMARO_APERITIF_VERMOUTH", 24, 3.5),
  spirit("s_carpano", "Carpano Antica Formula", "Fratelli Branca", "ITALY", "AMARO_APERITIF_VERMOUTH", 16.5, 4),
  spirit("s_plantation", "Plantation 3 Stars Rum", "Plantation", "BARBADOS", "RUM", 41.2, 3.5),
  spirit("s_fortaleza", "Fortaleza Blanco Tequila", "Tequila Fortaleza", "MEXICO", "TEQUILA", 40, 4.5),
  spirit("s_rittenhouse", "Rittenhouse Straight Rye Whisky", "Heaven Hill", "UNITED_STATES", "WHISKEY", 50, 4),
  spirit("s_redbreast", "Redbreast 12 Year Old", "Redbreast", "IRELAND", "WHISKEY", 40, 4.5),
  spirit("s_montenegro", "Amaro Montenegro", "Montenegro", "ITALY", "AMARO_APERITIF_VERMOUTH", 23, 4),
  // Coffee
  coffee("c_kochere", "Ethiopia Yirgacheffe Kochere", "Counter Culture Coffee", "ETHIOPIA", "YIRGACHEFFE", "WASHED", "LIGHT", 4.5),
  coffee("c_geisha", "Colombia Huila Geisha", "Intelligentsia", "COLOMBIA", "GEISHA", "WASHED", "LIGHT", 4.5),
  coffee("c_mandheling", "Sumatra Mandheling", "Stumptown Coffee Roasters", "INDONESIA", "SUMATRA", "WET_HULLED", "DARK", 3.5),
  coffee("c_nyeri", "Kenya Nyeri Gatomboya AA", "Ruby Coffee Roasters", "KENYA", "SL28", "WASHED", "LIGHT", 4),
  coffee("c_huehue", "Guatemala Huehuetenango", "Kickapoo Coffee", "GUATEMALA", "BOURBON", "WASHED", "MEDIUM", 3.5),
  // Sake
  sake("k_dassai", "Dassai 45 Junmai Daiginjo", "Asahi Shuzo", "junmai_daiginjo", "yamadanishiki", 45, "Yamaguchi", "fruity", 4.5),
  sake("k_kubota", "Kubota Senju Ginjo", "Asahi-Shuzo Niigata", "ginjo", "gohyakumangoku", 55, "Niigata", "dry", 4),
  sake("k_hakkaisan", "Hakkaisan Tokubetsu Honjozo", "Hakkaisan Brewery", "tokubetsu_honjozo", "gohyakumangoku", 55, "Niigata", "light", 3.5),
  sake("k_funaguchi", "Kikusui Funaguchi Nama Genshu", "Kikusui Sake Co.", "namazake", "gohyakumangoku", 70, "Niigata", "rich", 3.5),
  // Tea
  tea("t_longjing", "Xi Hu Long Jing Dragonwell", "Seven Cups", "CHINA", "green", "Zhejiang", 2026, 4),
  tea("t_castleton", "Castleton First Flush Darjeeling", "Darjeeling Tea Boutique", "INDIA", "black", "Darjeeling", 2026, 4.5),
  tea("t_tieguanyin", "Anxi Tieguanyin Oolong", "Seven Cups", "CHINA", "oolong", "Fujian", 2025, 4),
  tea("t_sencha", "Yame Sencha", "Ippodo Tea", "JAPAN", "green", "Fukuoka", 2026, 3.5),
  tea("t_puerh", "Yunnan Sheng Pu-erh Cake", "Yunnan Sourcing", "CHINA", "pu_erh", "Yunnan", 2015, 4),
];

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

export type DemoUserKey = "me" | "test2" | "maya" | "omar";

export type DemoUser = {
  readonly key: DemoUserKey;
  readonly email: string;
  readonly name: string;
  /**
   * How this person's ratings sit against test@test.com's: added to the
   * item's base score. Maya agrees (friend agreement shows), Omar is the
   * contrarian (it shows the other way), test2 is in between.
   */
  readonly bias: (item: DemoItem) => number;
};

export const PASSWORD = "123456789";

export const USERS: readonly DemoUser[] = [
  { key: "me", email: "test@test.com", name: "Test", bias: () => 0 },
  {
    key: "test2",
    email: "test2@test.com",
    name: "Test Two",
    bias: (i) => (i.type === "BEER" ? 0 : i.score >= 4.5 ? -0.5 : 0.5),
  },
  {
    key: "maya",
    email: "maya.chen@demo.test",
    name: "Maya Chen",
    bias: () => 0,
  },
  {
    key: "omar",
    email: "omar.haddad@demo.test",
    name: "Omar Haddad",
    bias: (i) => (i.score >= 4.5 ? -1.5 : i.score <= 3.5 ? 1 : -0.5),
  },
];

/** Accepted friendships, requester first. */
export const FRIENDSHIPS: readonly (readonly [DemoUserKey, DemoUserKey])[] = [
  ["test2", "me"],
  ["maya", "me"],
  ["me", "omar"],
  ["maya", "test2"],
];

/* -------------------------------------------------------------------------- */
/* Cellars                                                                     */
/* -------------------------------------------------------------------------- */

export type DemoCellar = {
  readonly key: string;
  readonly owner: DemoUserKey;
  readonly name: string;
  readonly privacy: "PRIVATE" | "FRIENDS" | "PUBLIC";
  readonly coOwners?: readonly DemoUserKey[];
};

export const CELLARS: readonly DemoCellar[] = [
  { key: "home", owner: "me", name: "Home Cellar", privacy: "FRIENDS" },
  { key: "bar", owner: "me", name: "Bar Cart & Pantry", privacy: "PRIVATE" },
  {
    key: "lake",
    owner: "me",
    name: "Lake House Fridge",
    privacy: "FRIENDS",
    coOwners: ["maya"],
  },
  {
    key: "t2fridge",
    owner: "test2",
    name: "Apartment Fridge",
    privacy: "FRIENDS",
  },
  {
    key: "mayarack",
    owner: "maya",
    name: "Maya's Wine Rack",
    privacy: "FRIENDS",
  },
];

/**
 * One bottle. Dates are days before the run (`acquired`, `opened`, `emptied`)
 * or days after it (`drinkUntilIn`, negative for already past), so a fresh
 * load always looks current; a re-run leaves existing bottles alone.
 */
export type DemoBottle = {
  readonly key: string;
  readonly cellar: string;
  readonly item: string;
  readonly acquired: number;
  readonly opened?: number;
  readonly emptied?: number;
  readonly left?: number;
  readonly drinkUntilIn?: number;
  readonly packaged?: number;
  readonly price?: number;
  readonly location?: string;
};

const b = (
  cellar: string,
  item: string,
  acquired: number,
  extra: Partial<DemoBottle> = {},
  n = 1,
): DemoBottle => ({
  key: `${cellar}:${item}:${n}`,
  cellar,
  item,
  acquired,
  ...extra,
});

// biome-ignore format: one row per bottle reads as a table
export const BOTTLES: readonly DemoBottle[] = [
  // Home Cellar — wine, mostly sealed; a few open (Drink soon on Home).
  b("home", "w_ridge", 420, { price: 48, location: "Rack A, row 2" }),
  b("home", "w_ridge", 420, { price: 48, location: "Rack A, row 2" }, 2),
  b("home", "w_tempier", 300, { price: 62, location: "Rack A, row 1" }),
  b("home", "w_barbaresco", 380, { price: 55, location: "Rack B, row 1", drinkUntilIn: 45 }),
  b("home", "w_cloudy", 60, { opened: 4, left: 40, price: 22 }),
  b("home", "w_loosen", 200, { price: 19, location: "Fridge door" }),
  b("home", "w_catena", 150, { opened: 2, left: 70, price: 25 }),
  b("home", "w_billecart", 90, { opened: 1, left: 50, price: 95 }),
  b("home", "w_muga", 500, { price: 30, location: "Rack B, row 3", drinkUntilIn: -20 }),
  b("home", "w_guiraud", 700, { opened: 18, left: 60, price: 45 }),
  b("home", "w_musar", 640, { price: 58, location: "Rack A, row 3" }),
  b("home", "w_vietti", 120, { price: 24, location: "Rack B, row 2", drinkUntilIn: 70 }),
  b("home", "w_tondonia", 260, { price: 70, location: "Rack C" }),
  b("home", "w_catena", 300, { opened: 210, emptied: 205, left: 0, price: 25 }, 2),
  // Bar Cart & Pantry — spirits open for months, plus tea, coffee and sake.
  b("bar", "s_lagavulin", 540, { opened: 400, left: 35, price: 95 }),
  b("bar", "s_buffalo", 300, { opened: 280, left: 55, price: 30 }),
  b("bar", "s_hendricks", 250, { opened: 240, left: 60, price: 38 }),
  b("bar", "s_vida", 200, { opened: 150, left: 70, price: 40 }),
  b("bar", "s_campari", 420, { opened: 410, left: 25, price: 28 }),
  b("bar", "s_carpano", 220, { opened: 200, left: 45, price: 34 }),
  b("bar", "s_plantation", 330, { opened: 320, left: 50, price: 24 }),
  b("bar", "s_fortaleza", 160, { opened: 90, left: 80, price: 52 }),
  b("bar", "s_rittenhouse", 100, { opened: 60, left: 85, price: 32 }),
  b("bar", "s_redbreast", 30, { price: 70 }),
  b("bar", "s_montenegro", 260, { opened: 250, left: 40, price: 33 }),
  b("bar", "c_kochere", 20, { opened: 12, left: 45, packaged: 25 }),
  b("bar", "c_geisha", 9, { opened: 6, left: 80, packaged: 14 }),
  b("bar", "c_nyeri", 40, { packaged: 45 }),
  b("bar", "t_longjing", 150, { opened: 140, left: 30 }),
  b("bar", "t_castleton", 100, { opened: 90, left: 55 }),
  b("bar", "t_puerh", 900, { opened: 600, left: 70 }),
  b("bar", "t_tieguanyin", 70, {}),
  b("bar", "k_funaguchi", 12, { opened: 6, left: 40 }),
  b("bar", "k_dassai", 45, {}),
  // Lake House Fridge — co-owned with Maya: beer and a little sake.
  b("lake", "b_pliny", 30, { packaged: 40 }),
  b("lake", "b_julius", 20, { packaged: 25 }),
  b("lake", "b_edward", 50, { packaged: 70 }),
  b("lake", "b_dupont", 120, {}),
  b("lake", "b_orval", 150, {}),
  b("lake", "b_cantillon", 400, { location: "Cellar shelf" }),
  b("lake", "b_celebrator", 60, {}),
  b("lake", "b_augustiner", 15, { packaged: 30 }),
  b("lake", "b_spotted", 10, {}),
  b("lake", "b_spotted", 10, {}, 2),
  b("lake", "b_kbs", 200, {}),
  b("lake", "b_zombie", 25, { packaged: 35 }),
  b("lake", "k_kubota", 30, {}),
  // test2's fridge.
  b("t2fridge", "b_twohearted", 14, { packaged: 20 }),
  b("t2fridge", "b_guinness", 30, {}),
  b("t2fridge", "b_allagash", 10, {}),
  b("t2fridge", "b_sierra", 12, {}),
  b("t2fridge", "b_weihen", 25, {}),
  b("t2fridge", "b_rasputin", 90, {}),
  b("t2fridge", "b_duvel", 40, {}),
  b("t2fridge", "w_cloudy", 15, {}),
  b("t2fridge", "s_buffalo", 200, { opened: 150, left: 30 }),
  b("t2fridge", "c_huehue", 10, { opened: 5, left: 60 }),
  // Maya's rack.
  b("mayarack", "w_barbaresco", 200, {}),
  b("mayarack", "w_tempier", 100, {}),
  b("mayarack", "w_musar", 300, {}),
  b("mayarack", "w_loosen", 40, { opened: 3, left: 50 }),
  b("mayarack", "w_tondonia", 500, {}),
  b("mayarack", "w_billecart", 30, {}),
];

/* -------------------------------------------------------------------------- */
/* Places, Madison WI                                                          */
/* -------------------------------------------------------------------------- */

export type DemoPlace = {
  readonly key: string;
  readonly name: string;
  readonly categories: readonly string[];
  readonly lat: number;
  readonly lng: number;
  readonly street: string;
  readonly postcode: string;
  readonly description: string;
  /** Left `pending` — the one that shows "Under review". */
  readonly underReview?: boolean;
};

// biome-ignore format: one row per place reads as a table
export const PLACES: readonly DemoPlace[] = [
  { key: "copper", name: "Copper Still Cocktail Room", categories: ["cocktail_bar"], lat: 43.0762, lng: -89.3849, street: "118 King St", postcode: "53703", description: "Low-lit bar off the Square; stirred drinks and a deep amaro shelf." },
  { key: "lakeside", name: "Lakeside Tap House", categories: ["beer_bar"], lat: 43.0731, lng: -89.391, street: "402 W Gorman St", postcode: "53703", description: "Thirty taps, a patio over the water, and a Belgian bottle list." },
  { key: "hollowoak", name: "Hollow Oak Brewing", categories: ["brewery", "taproom"], lat: 43.0952, lng: -89.357, street: "2210 Atwood Ave", postcode: "53704", description: "Neighborhood brewery: hazy IPAs, a farmhouse saison, and a fresh-hop release every fall." },
  { key: "kiln", name: "Kettle & Kiln Coffee", categories: ["coffee_shop"], lat: 43.0745, lng: -89.3955, street: "655 State St", postcode: "53703", description: "Light-roast pour-overs and a rotating single-origin." },
  { key: "sakura", name: "Sakura Izakaya", categories: ["izakaya", "sake_bar"], lat: 43.0705, lng: -89.401, street: "1012 Regent St", postcode: "53715", description: "Yakitori and forty sakes by the glass." },
  { key: "isthmus", name: "Isthmus Bottle Shop", categories: ["liquor_store", "wine_shop"], lat: 43.0801, lng: -89.3712, street: "1340 E Washington Ave", postcode: "53703", description: "Small shop, big Old World wine section, Saturday tastings." },
  { key: "heron", name: "Night Heron Mezcaleria", categories: ["cocktail_bar"], lat: 43.0689, lng: -89.3871, street: "27 S Park St", postcode: "53715", description: "New agave bar on Park Street — mezcal flights and a short taco menu.", underReview: true },
];

/* -------------------------------------------------------------------------- */
/* Drink logs                                                                  */
/* -------------------------------------------------------------------------- */

export const TAGS: Record<ItemType, readonly string[]> = {
  WINE: [
    "cherry",
    "earthy",
    "tannic",
    "bright acid",
    "oak",
    "plum",
    "citrus",
    "minerality",
    "honeyed",
  ],
  BEER: [
    "hoppy",
    "citrus",
    "pine",
    "malty",
    "roasty",
    "funky",
    "crisp",
    "banana",
    "clove",
    "tart",
  ],
  SPIRIT: [
    "smoky",
    "peaty",
    "vanilla",
    "caramel",
    "spice",
    "orange peel",
    "bitter",
    "agave",
  ],
  COFFEE: [
    "floral",
    "bergamot",
    "blueberry",
    "chocolate",
    "bright",
    "syrupy",
    "earthy",
  ],
  SAKE: ["melon", "rice", "clean", "umami", "pear", "rich"],
  TEA: ["grassy", "chestnut", "muscatel", "floral", "orchid", "earthy"],
};

export const NOTES: readonly string[] = [
  "Better than I remembered.",
  "Opened up a lot after an hour.",
  "Perfect with dinner.",
  "A little tired — drink the rest soon.",
  "Shared the last of it on the porch.",
  "Would buy again.",
  "Fresher than the last can.",
  "Brought this one to game night.",
];

/** How many logs each person gets over the last ~14 months. */
export const LOG_COUNTS: Record<DemoUserKey, number> = {
  me: 120,
  test2: 40,
  maya: 32,
  omar: 22,
};

/** Per type, how often a log is that type (beer-heavy, like the real thing). */
export const TYPE_WEIGHTS: Record<ItemType, number> = {
  BEER: 45,
  WINE: 25,
  SPIRIT: 12,
  COFFEE: 9,
  SAKE: 4,
  TEA: 5,
};

/** Where each type tends to be drunk; null means at home (no place). */
export const TYPE_PLACES: Record<ItemType, readonly (string | null)[]> = {
  BEER: ["lakeside", "hollowoak", "lakeside", null, null],
  WINE: ["isthmus", "copper", null, null, null],
  SPIRIT: ["copper", null, null],
  COFFEE: ["kiln", "kiln", null],
  SAKE: ["sakura", null],
  TEA: [null],
};

/* -------------------------------------------------------------------------- */
/* Ratings                                                                     */
/* -------------------------------------------------------------------------- */

/** Items each person reviews (item_reviews), beyond what their logs score. */
export const REVIEWS: Record<DemoUserKey, readonly string[]> = {
  me: [
    "w_ridge",
    "w_tempier",
    "w_barbaresco",
    "w_cloudy",
    "w_loosen",
    "w_catena",
    "w_billecart",
    "w_muga",
    "w_musar",
    "w_tondonia",
    "b_pliny",
    "b_weihen",
    "b_spotted",
    "b_guinness",
    "b_dupont",
    "b_urquell",
    "b_twohearted",
    "b_orval",
    "b_julius",
    "b_cantillon",
    "b_edward",
    "b_zombie",
    "s_lagavulin",
    "s_buffalo",
    "s_fortaleza",
    "s_redbreast",
    "s_campari",
    "c_kochere",
    "c_geisha",
    "k_dassai",
    "t_castleton",
    "t_longjing",
  ],
  test2: [
    "b_pliny",
    "b_twohearted",
    "b_guinness",
    "b_allagash",
    "b_sierra",
    "b_weihen",
    "b_duvel",
    "b_spotted",
    "w_cloudy",
    "w_ridge",
    "w_billecart",
    "s_buffalo",
    "c_huehue",
    "b_julius",
  ],
  maya: [
    "w_ridge",
    "w_tempier",
    "w_barbaresco",
    "w_loosen",
    "w_musar",
    "w_tondonia",
    "w_billecart",
    "w_catena",
    "b_dupont",
    "b_orval",
    "s_campari",
    "k_dassai",
    "t_longjing",
  ],
  omar: [
    "w_ridge",
    "w_muga",
    "w_catena",
    "b_pliny",
    "b_guinness",
    "b_spotted",
    "s_lagavulin",
    "s_buffalo",
    "s_fortaleza",
    "c_mandheling",
    "b_rasputin",
  ],
};

export const REVIEW_TEXT: Record<string, string> = {
  w_ridge:
    "Brambly, peppery, and somehow still fresh. The house red for a reason.",
  w_musar: "Volatile in the best way — dried cherry, leather, cedar.",
  b_pliny: "Still the benchmark for a West Coast double IPA.",
  b_cantillon: "Lemon, hay and barnyard. Pure.",
  s_lagavulin: "Campfire and sea spray, long sweet finish.",
  c_kochere: "Jasmine and bergamot; tea-like body on a V60.",
  t_castleton: "Muscatel bright, almost no astringency.",
};

export const WANT_TO_TRY: Record<
  DemoUserKey,
  readonly { item?: string; place?: string; recipe?: string }[]
> = {
  me: [
    { item: "b_rodenbach" },
    { item: "b_aventinus" },
    { item: "c_mandheling" },
    { item: "k_hakkaisan" },
    { item: "t_sencha" },
    { item: "b_rasputin" },
    { recipe: "lastword" },
    { place: "heron" },
    { place: "sakura" },
  ],
  test2: [{ item: "b_cantillon" }, { item: "w_musar" }],
  maya: [{ item: "s_redbreast" }],
  omar: [],
};

export const FAVORITES: Record<DemoUserKey, readonly string[]> = {
  me: ["w_ridge", "b_dupont", "s_lagavulin", "c_kochere"],
  test2: ["b_pliny"],
  maya: ["w_tempier"],
  omar: [],
};

/* -------------------------------------------------------------------------- */
/* Tier lists                                                                  */
/* -------------------------------------------------------------------------- */

export type DemoTierList = {
  readonly key: string;
  readonly owner: DemoUserKey;
  readonly name: string;
  readonly description: string;
  readonly listType: "wine" | "beer" | "spirit" | "place";
  readonly privacy: "PRIVATE" | "FRIENDS" | "PUBLIC";
  /** Pre-band from the owner's ratings (X16) instead of listing entries. */
  readonly fromRatings?: boolean;
  /** [band 0–5, item or place key] in order within each band. */
  readonly entries?: readonly (readonly [number, string])[];
  /** Build an Undo history: a reorder and a cross-band move, then undo the move. */
  readonly history?: boolean;
};

export const TIER_LISTS: readonly DemoTierList[] = [
  {
    key: "beers",
    owner: "me",
    name: "Beers, ranked",
    description: "Everything I'd order again, best first.",
    listType: "beer",
    privacy: "FRIENDS",
    history: true,
    entries: [
      [5, "b_cantillon"],
      [5, "b_pliny"],
      [5, "b_dupont"],
      [5, "b_orval"],
      [4, "b_edward"],
      [4, "b_julius"],
      [4, "b_twohearted"],
      [4, "b_zombie"],
      [4, "b_weihen"],
      [3, "b_augustiner"],
      [3, "b_celebrator"],
      [3, "b_kbs"],
      [3, "b_duvel"],
      [2, "b_spotted"],
      [2, "b_urquell"],
      [2, "b_sierra"],
      [2, "b_allagash"],
      [1, "b_guinness"],
      [1, "b_rasputin"],
    ],
  },
  {
    key: "wines",
    owner: "me",
    name: "Wine shelf",
    description: "Started from my ratings.",
    listType: "wine",
    privacy: "FRIENDS",
    fromRatings: true,
  },
  {
    key: "spots",
    owner: "me",
    name: "Madison drinking spots",
    description: "Where I send visitors.",
    listType: "place",
    privacy: "PUBLIC",
    entries: [
      [5, "copper"],
      [5, "lakeside"],
      [4, "sakura"],
      [4, "kiln"],
      [3, "hollowoak"],
      [3, "isthmus"],
    ],
  },
  {
    key: "t2beers",
    owner: "test2",
    name: "Fridge favorites",
    description: "The cans I keep restocking.",
    listType: "beer",
    privacy: "FRIENDS",
    entries: [
      [5, "b_pliny"],
      [5, "b_julius"],
      [4, "b_twohearted"],
      [4, "b_duvel"],
      [3, "b_sierra"],
      [2, "b_guinness"],
    ],
  },
  {
    key: "mayareds",
    owner: "maya",
    name: "Reds worth the splurge",
    description: "Special-occasion bottles.",
    listType: "wine",
    privacy: "FRIENDS",
    entries: [
      [5, "w_tempier"],
      [5, "w_musar"],
      [4, "w_barbaresco"],
      [4, "w_ridge"],
      [3, "w_catena"],
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Bar and recipes                                                             */
/* -------------------------------------------------------------------------- */

/** test@test.com's Bar pantry toggles (IngredientKind values). */
export const PANTRY: readonly string[] = [
  "lemon",
  "lime",
  "orange",
  "simple_syrup",
  "aromatic_bitters",
  "orange_bitters",
  "honey_syrup",
  "soda_water",
  "egg",
  "cherries",
];

export type DemoIngredient = {
  readonly name: string;
  readonly kind: string;
  readonly role: string;
  readonly generic: "spirit" | "wine" | "ingredient";
  readonly category: string;
  readonly qty?: number;
  readonly unit?: string;
  readonly text?: string;
  readonly optional?: boolean;
};

const ing = (
  name: string,
  kind: string,
  role: string,
  qty: number | null,
  unit: string | null,
  generic: DemoIngredient["generic"] = "ingredient",
  category = generic === "spirit" ? "spirit" : "mixer",
): DemoIngredient => ({
  name,
  kind,
  role,
  generic,
  category,
  ...(qty === null ? {} : { qty }),
  ...(unit === null ? {} : { unit }),
});

export type DemoRecipe = {
  readonly key: string;
  readonly owner: DemoUserKey;
  readonly name: string;
  readonly description: string;
  readonly privacy: "PRIVATE" | "FRIENDS" | "PUBLIC";
  readonly difficulty: number;
  readonly minutes: number;
  readonly ingredients: readonly DemoIngredient[];
  readonly steps: readonly string[];
  /** Days ago test@test.com logged "Made it" (recipe drink logs). */
  readonly made?: readonly number[];
  readonly loved?: boolean;
};

export const RECIPES: readonly DemoRecipe[] = [
  {
    key: "oldfashioned",
    owner: "me",
    name: "Old Fashioned",
    privacy: "PUBLIC",
    difficulty: 1,
    minutes: 3,
    description: "Bourbon, a little sugar, bitters, an orange twist.",
    ingredients: [
      ing("Bourbon", "bourbon", "base", 2, "oz", "spirit"),
      ing("Simple syrup", "simple_syrup", "sweetener", 0.25, "oz"),
      ing("Angostura bitters", "aromatic_bitters", "bitters", 2, "dashes"),
      ing("Orange peel", "orange", "garnish", 1, "twist"),
    ],
    steps: [
      "Stir bourbon, syrup and bitters with ice until well chilled.",
      "Strain over a large cube.",
      "Express the orange peel over the top and drop it in.",
    ],
    made: [12, 40, 95, 200],
    loved: true,
  },
  {
    key: "negroni",
    owner: "me",
    name: "Negroni",
    privacy: "PUBLIC",
    difficulty: 1,
    minutes: 3,
    description: "Equal parts gin, sweet vermouth and Campari.",
    ingredients: [
      ing("Gin", "gin", "base", 1, "oz", "spirit"),
      ing("Sweet vermouth", "sweet_vermouth", "modifier", 1, "oz", "spirit"),
      ing("Campari", "red_bitter", "modifier", 1, "oz", "spirit"),
      ing("Orange peel", "orange", "garnish", 1, "twist"),
    ],
    steps: [
      "Stir everything with ice.",
      "Strain over a large cube.",
      "Garnish with orange.",
    ],
    made: [5, 60, 150],
    loved: true,
  },
  {
    key: "mezcalnegroni",
    owner: "me",
    name: "Mezcal Negroni",
    privacy: "PUBLIC",
    difficulty: 1,
    minutes: 3,
    description: "The smoky cousin.",
    ingredients: [
      ing("Mezcal", "mezcal", "base", 1, "oz", "spirit"),
      ing("Sweet vermouth", "sweet_vermouth", "modifier", 1, "oz", "spirit"),
      ing("Campari", "red_bitter", "modifier", 1, "oz", "spirit"),
      ing("Orange peel", "orange", "garnish", 1, "twist"),
    ],
    steps: [
      "Stir with ice.",
      "Strain over a large cube; flame an orange peel over it.",
    ],
    made: [30],
  },
  {
    key: "daiquiri",
    owner: "me",
    name: "Daiquiri",
    privacy: "PUBLIC",
    difficulty: 2,
    minutes: 4,
    description: "Rum, lime, sugar. Shaken hard.",
    ingredients: [
      ing("White rum", "rum", "base", 2, "oz", "spirit"),
      ing("Fresh lime juice", "lime", "acid", 1, "oz"),
      ing("Simple syrup", "simple_syrup", "sweetener", 0.75, "oz"),
    ],
    steps: [
      "Shake with ice for 12 seconds.",
      "Double strain into a chilled coupe.",
    ],
    made: [80, 260],
  },
  {
    key: "manhattan",
    owner: "me",
    name: "Manhattan",
    privacy: "PUBLIC",
    difficulty: 1,
    minutes: 3,
    description: "Rye, sweet vermouth, bitters, a cherry.",
    ingredients: [
      ing("Rye whiskey", "rye", "base", 2, "oz", "spirit"),
      ing("Sweet vermouth", "sweet_vermouth", "modifier", 1, "oz", "spirit"),
      ing("Angostura bitters", "aromatic_bitters", "bitters", 2, "dashes"),
      ing("Brandied cherry", "cherries", "garnish", 1, null),
    ],
    steps: [
      "Stir with ice until very cold.",
      "Strain into a chilled coupe and add the cherry.",
    ],
  },
  {
    key: "goldrush",
    owner: "me",
    name: "Gold Rush",
    privacy: "PUBLIC",
    difficulty: 2,
    minutes: 4,
    description: "A whiskey sour with honey instead of sugar.",
    ingredients: [
      ing("Bourbon", "bourbon", "base", 2, "oz", "spirit"),
      ing("Fresh lemon juice", "lemon", "acid", 0.75, "oz"),
      ing("Honey syrup", "honey_syrup", "sweetener", 0.75, "oz"),
    ],
    steps: ["Shake with ice.", "Strain over a large cube."],
  },
  {
    key: "margarita",
    owner: "me",
    name: "Margarita",
    privacy: "PUBLIC",
    difficulty: 2,
    minutes: 4,
    description: "Tequila, orange liqueur, lime — one bottle short.",
    ingredients: [
      ing("Blanco tequila", "tequila", "base", 2, "oz", "spirit"),
      ing("Orange liqueur", "orange_liqueur", "modifier", 0.75, "oz", "spirit"),
      ing("Fresh lime juice", "lime", "acid", 1, "oz"),
      ing("Salt", "salt", "garnish", null, null),
    ],
    steps: ["Salt half the rim.", "Shake with ice and strain over fresh ice."],
  },
  {
    key: "paloma",
    owner: "me",
    name: "Paloma",
    privacy: "PUBLIC",
    difficulty: 1,
    minutes: 3,
    description: "Tequila and grapefruit, topped with soda.",
    ingredients: [
      ing("Blanco tequila", "tequila", "base", 2, "oz", "spirit"),
      ing("Fresh grapefruit juice", "grapefruit", "mixer", 2, "oz"),
      ing("Fresh lime juice", "lime", "acid", 0.5, "oz"),
      ing("Soda water", "soda_water", "mixer", 2, "oz"),
    ],
    steps: ["Build over ice in a highball.", "Top with soda and stir once."],
  },
  {
    key: "lastword",
    owner: "me",
    name: "Last Word",
    privacy: "PUBLIC",
    difficulty: 2,
    minutes: 4,
    description: "Gin, green Chartreuse, maraschino and lime in equal parts.",
    ingredients: [
      ing("Gin", "gin", "base", 0.75, "oz", "spirit"),
      ing("Green Chartreuse", "chartreuse", "modifier", 0.75, "oz", "spirit"),
      ing("Maraschino liqueur", "maraschino", "modifier", 0.75, "oz", "spirit"),
      ing("Fresh lime juice", "lime", "acid", 0.75, "oz"),
    ],
    steps: ["Shake hard with ice.", "Double strain into a chilled coupe."],
  },
  {
    key: "espresso",
    owner: "me",
    name: "Espresso Martini",
    privacy: "PUBLIC",
    difficulty: 2,
    minutes: 5,
    description: "Vodka, coffee liqueur and a fresh shot.",
    ingredients: [
      ing("Vodka", "vodka", "base", 1.5, "oz", "spirit"),
      ing("Coffee liqueur", "coffee_liqueur", "modifier", 0.75, "oz", "spirit"),
      ing("Espresso", "coffee", "modifier", 1, "oz"),
    ],
    steps: [
      "Pull a shot and let it cool a minute.",
      "Shake everything very hard with ice.",
      "Strain into a coupe; garnish with three beans.",
    ],
  },
  {
    key: "boulevardier",
    owner: "maya",
    name: "Maya's Boulevardier",
    privacy: "FRIENDS",
    difficulty: 1,
    minutes: 3,
    description: "A Negroni with bourbon, a touch heavier on the whiskey.",
    ingredients: [
      ing("Bourbon", "bourbon", "base", 1.5, "oz", "spirit"),
      ing("Sweet vermouth", "sweet_vermouth", "modifier", 1, "oz", "spirit"),
      ing("Campari", "red_bitter", "modifier", 1, "oz", "spirit"),
    ],
    steps: ["Stir with ice.", "Strain into a chilled coupe; orange twist."],
  },
];

/** test@test.com's brew numbers (setBrewPrefs). */
export const BREW_PREFS: readonly {
  readonly item: string;
  readonly doseGrams?: number;
  readonly waterMl?: number;
  readonly waterTempC?: number;
  readonly steepSeconds?: number;
}[] = [
  { item: "c_kochere", doseGrams: 18, waterMl: 300, waterTempC: 94 },
  { item: "c_geisha", doseGrams: 15, waterMl: 250, waterTempC: 93 },
  {
    item: "t_longjing",
    doseGrams: 3,
    waterMl: 200,
    waterTempC: 80,
    steepSeconds: 120,
  },
];

/* -------------------------------------------------------------------------- */
/* The menu scan (AI-free: written straight to its tables)                     */
/* -------------------------------------------------------------------------- */

export type DemoMenuLine = {
  readonly name: string;
  readonly category: string;
  readonly price: number;
  readonly type: "beer" | "wine" | "spirit" | "cocktail" | "unknown";
  readonly description?: string;
  /** A direct match (shows as matched). */
  readonly matched?: string;
  /** A pending suggestion (shows as "to confirm", and on /discoveries). */
  readonly suggested?: string;
};

export const MENU_SCAN = {
  key: "lakeside-draft",
  owner: "me" as DemoUserKey,
  place: "lakeside",
  header: "Lakeside Tap House — Draft & Bottles",
  daysAgo: 9,
  lines: [
    {
      name: "Pliny the Elder",
      category: "Draft",
      price: 9,
      type: "beer",
      matched: "b_pliny",
      description: "Double IPA, 8%",
    },
    {
      name: "Saison Dupont",
      category: "Bottles",
      price: 12,
      type: "beer",
      matched: "b_dupont",
      description: "Belgian farmhouse ale, 750ml",
    },
    {
      name: "Spotted Cow",
      category: "Draft",
      price: 6,
      type: "beer",
      matched: "b_spotted",
      description: "Farmhouse cream ale",
    },
    {
      name: "Guinness",
      category: "Draft",
      price: 7,
      type: "beer",
      matched: "b_guinness",
      description: "Nitro stout",
    },
    {
      name: "Two Hearted",
      category: "Draft",
      price: 7,
      type: "beer",
      matched: "b_twohearted",
    },
    {
      name: "Orval",
      category: "Bottles",
      price: 11,
      type: "beer",
      matched: "b_orval",
      description: "Trappist pale ale",
    },
    {
      name: "Zombie Dust (guest tap)",
      category: "Draft",
      price: 8,
      type: "beer",
      suggested: "b_zombie",
    },
    {
      name: "Celebrator",
      category: "Bottles",
      price: 9,
      type: "beer",
      suggested: "b_celebrator",
      description: "Doppelbock",
    },
    {
      name: "House Kölsch",
      category: "Draft",
      price: 6,
      type: "beer",
      description: "Brewed for us by Hollow Oak",
    },
    {
      name: "Hollow Oak Fresh Hop Pale",
      category: "Draft",
      price: 8,
      type: "beer",
      description: "Seasonal",
    },
    {
      name: "Lakeside Old Fashioned",
      category: "Cocktails",
      price: 12,
      type: "cocktail",
      description: "Bourbon, demerara, house bitters",
    },
  ] satisfies readonly DemoMenuLine[],
};
