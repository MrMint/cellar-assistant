/**
 * The bar: what a recipe ingredient *is*, what the viewer has, and the
 * comparison between the two (X14, decisions D9, D18/G29 and D23).
 *
 * ## Three things live here, all pure
 *
 *  1. **The ingredient vocabulary** — {@link BAR_KINDS}, a closed list of
 *     about seventy kinds ("bourbon", "sweet vermouth", "limes", "simple
 *     syrup"…). A recipe ingredient carries one (`recipe_ingredients.kind`),
 *     a cellar bottle is read as one ({@link bottleKind}), and a Bar pantry
 *     toggle *is* one. Comparing two strings from the same closed list is the
 *     whole trick: there is no fuzzy matching anywhere in availability.
 *  2. **The roles** — {@link INGREDIENT_ROLES}: what an ingredient does in the
 *     drink (base, modifier, acid…). A garnish never blocks "Make now".
 *  3. **Availability** — {@link ingredientAvailability} and
 *     {@link recipeMakeability}: Have / Substitute / Missing per ingredient,
 *     and Make now / One bottle away per recipe, from a {@link BarInventory}.
 *
 * Plain data and pure functions with no imports beyond types, so the actors
 * (classification on write, the backfill, the What-can-I-make scan), the API
 * (per-ingredient availability) and the browser all run the same code.
 *
 * ## Why the deterministic classifier leads and the model follows
 *
 * The recipe-photo extraction now answers a `kind` per ingredient too, from
 * the same list (its enum is {@link BAR_KIND_KEYS}). A keyword match over the
 * transcribed name is preferred when it finds anything ({@link resolveKind}),
 * because it is exact when it fires ("Campari", "Peychaud's", "lime juice")
 * and a 4-billion-parameter model choosing among seventy enum members is
 * not. The model's answer fills the gaps the keywords leave ("aged rhum
 * agricole"). Neither ever invents a kind the list does not hold, and an
 * ingredient neither can place stays `null` — shown as "Not tracked", and
 * counted as missing so Make now never claims a drink it cannot vouch for.
 */
import type { ItemType } from "./items.ts";

/* -------------------------------------------------------------------------- */
/* Roles                                                                       */
/* -------------------------------------------------------------------------- */

/** What an ingredient does in the drink. `recipe_ingredients.role`'s check. */
export const INGREDIENT_ROLES = [
  "base",
  "modifier",
  "sweetener",
  "acid",
  "bitters",
  "mixer",
  "garnish",
  "other",
] as const;

export type IngredientRole = (typeof INGREDIENT_ROLES)[number];

export const isIngredientRole = (value: unknown): value is IngredientRole =>
  typeof value === "string" &&
  (INGREDIENT_ROLES as readonly string[]).includes(value);

/* -------------------------------------------------------------------------- */
/* The vocabulary                                                              */
/* -------------------------------------------------------------------------- */

export type BarKindGroup =
  | "spirit"
  | "liqueur"
  | "fortified"
  | "wine"
  | "beer"
  | "sake"
  | "coffee"
  | "tea"
  | "citrus"
  | "juice"
  | "syrup"
  | "bitters"
  | "mixer"
  | "dairy"
  | "garnish"
  | "staple";

export type BarKindSpec = {
  readonly label: string;
  readonly group: BarKindGroup;
  /**
   * Kinds in one family stand in for each other as a **Substitute** (rye for
   * bourbon, Aperol for Campari, honey syrup for simple). Never a Have.
   */
  readonly family?: string;
  /**
   * A broader kind this one satisfies outright: a recipe asking for
   * "whiskey" is a **Have** with a bourbon on the shelf. One level only.
   */
  readonly parent?: string;
  /** One of the ~30 Bar pantry toggles (D23). */
  readonly pantry?: boolean;
  /** Always in the house — water, ice, sugar, salt. Never blocks a drink. */
  readonly staple?: boolean;
  /**
   * Whole-word phrases, already normalised ({@link normaliseForMatch}). The
   * longest phrase found in a name wins, which is what keeps "ginger beer"
   * out of `beer` and "orange bitters" out of `orange`.
   */
  readonly keywords: readonly string[];
};

const spec = (
  label: string,
  group: BarKindGroup,
  keywords: readonly string[],
  extra: Partial<Omit<BarKindSpec, "label" | "group" | "keywords">> = {},
): BarKindSpec => ({ label, group, keywords, ...extra });

/**
 * Every kind, keyed by its stored value. **Order is display order** within a
 * group (the pantry screen renders it). Adding a kind is safe; renaming or
 * removing one orphans stored rows, so do neither without a migration.
 */
export const BAR_KINDS = {
  // Spirits — read off cellar bottles.
  vodka: spec("Vodka", "spirit", ["vodka"]),
  gin: spec("Gin", "spirit", [
    "gin",
    "london dry",
    "old tom",
    "plymouth gin",
    "genever",
  ]),
  rum: spec("Rum", "spirit", ["rum", "rhum", "white rum", "dark rum"], {
    family: "rum",
  }),
  cachaca: spec("Cachaça", "spirit", ["cachaca"], { family: "rum" }),
  tequila: spec(
    "Tequila",
    "spirit",
    ["tequila", "blanco tequila", "reposado", "anejo"],
    { family: "agave" },
  ),
  mezcal: spec("Mezcal", "spirit", ["mezcal"], { family: "agave" }),
  whiskey: spec("Whiskey", "spirit", ["whiskey", "whisky"], {
    family: "whiskey",
  }),
  bourbon: spec("Bourbon", "spirit", ["bourbon"], {
    family: "whiskey",
    parent: "whiskey",
  }),
  rye: spec("Rye whiskey", "spirit", ["rye", "rye whiskey", "rye whisky"], {
    family: "whiskey",
    parent: "whiskey",
  }),
  scotch: spec(
    "Scotch",
    "spirit",
    ["scotch", "single malt", "blended scotch", "islay", "scotch whisky"],
    { family: "whiskey", parent: "whiskey" },
  ),
  irish_whiskey: spec("Irish whiskey", "spirit", ["irish whiskey"], {
    family: "whiskey",
    parent: "whiskey",
  }),
  brandy: spec(
    "Brandy",
    "spirit",
    ["brandy", "cognac", "armagnac", "calvados", "apple brandy", "applejack"],
    { family: "brandy" },
  ),
  pisco: spec("Pisco", "spirit", ["pisco"], { family: "brandy" }),
  absinthe: spec("Absinthe", "spirit", [
    "absinthe",
    "pastis",
    "pernod",
    "herbsaint",
  ]),
  soju: spec("Soju", "spirit", ["soju"]),
  baijiu: spec("Baijiu", "spirit", ["baijiu"]),
  moonshine: spec("Moonshine", "spirit", ["moonshine"]),

  // Liqueurs and aperitivi — also cellar bottles. `liqueur` itself has no
  // keywords: "peach liqueur" is not a Have for someone holding Cointreau, so
  // an unplaced liqueur stays unknown. It is only what a LIQUEURS-typed
  // bottle that names nothing more specific is read as.
  liqueur: spec("Liqueur", "liqueur", []),
  orange_liqueur: spec("Orange liqueur", "liqueur", [
    "triple sec",
    "cointreau",
    "grand marnier",
    "curacao",
    "orange liqueur",
    "orange curacao",
    "dry curacao",
  ]),
  maraschino: spec("Maraschino liqueur", "liqueur", [
    "maraschino",
    "maraschino liqueur",
    "luxardo",
  ]),
  coffee_liqueur: spec("Coffee liqueur", "liqueur", [
    "coffee liqueur",
    "kahlua",
    "tia maria",
  ]),
  elderflower_liqueur: spec("Elderflower liqueur", "liqueur", [
    "elderflower liqueur",
    "st germain",
    "st-germain",
    "elderflower",
  ]),
  amaretto: spec("Amaretto", "liqueur", ["amaretto", "disaronno"], {}),
  irish_cream: spec("Irish cream", "liqueur", ["irish cream", "baileys"], {}),
  chartreuse: spec("Chartreuse", "liqueur", [
    "chartreuse",
    "green chartreuse",
    "yellow chartreuse",
  ]),
  benedictine: spec("Bénédictine", "liqueur", ["benedictine"]),
  red_bitter: spec(
    "Campari / red bitter",
    "liqueur",
    ["campari", "red bitter", "bitter aperitivo", "aperitivo"],
    { family: "aperitivo" },
  ),
  aperol: spec("Aperol", "liqueur", ["aperol"], { family: "aperitivo" }),
  amaro: spec(
    "Amaro",
    "liqueur",
    [
      "amaro",
      "fernet",
      "fernet branca",
      "averna",
      "montenegro",
      "cynar",
      "nonino",
      "ramazzotti",
    ],
    { family: "amaro" },
  ),

  // Fortified and aromatised wines — pantry toggles, and cellar bottles.
  vermouth: spec("Vermouth", "fortified", ["vermouth"], {
    family: "vermouth",
  }),
  sweet_vermouth: spec(
    "Sweet vermouth",
    "fortified",
    [
      "sweet vermouth",
      "rosso vermouth",
      "red vermouth",
      "italian vermouth",
      "vermouth di torino",
      "carpano",
      "antica formula",
      "punt e mes",
    ],
    { family: "vermouth", parent: "vermouth", pantry: true },
  ),
  dry_vermouth: spec(
    "Dry vermouth",
    "fortified",
    ["dry vermouth", "french vermouth", "noilly prat", "extra dry vermouth"],
    { family: "vermouth", parent: "vermouth", pantry: true },
  ),
  blanc_vermouth: spec(
    "Blanc vermouth",
    "fortified",
    ["blanc vermouth", "bianco vermouth", "white vermouth"],
    { family: "vermouth", parent: "vermouth", pantry: true },
  ),
  lillet: spec(
    "Lillet / aromatised wine",
    "fortified",
    ["lillet", "lillet blanc", "cocchi americano", "kina lillet"],
    { family: "vermouth", pantry: true },
  ),
  sherry: spec(
    "Sherry",
    "fortified",
    ["sherry", "fino", "amontillado", "oloroso", "manzanilla"],
    { pantry: true },
  ),
  port: spec("Port", "fortified", ["port", "ruby port", "tawny port"], {
    pantry: true,
  }),

  // Wine, beer, sake, coffee, tea — read off the matching item types.
  sparkling_wine: spec("Sparkling wine", "wine", [
    "champagne",
    "prosecco",
    "cava",
    "sparkling wine",
    "cremant",
  ]),
  red_wine: spec("Red wine", "wine", ["red wine"]),
  white_wine: spec("White wine", "wine", ["white wine"]),
  rose_wine: spec("Rosé", "wine", ["rose wine", "sparkling rose"]),
  beer: spec("Beer", "beer", ["beer", "lager", "pilsner", "ale", "stout"]),
  sake: spec("Sake", "sake", ["sake"]),
  coffee: spec("Coffee", "coffee", [
    "coffee",
    "espresso",
    "cold brew",
    "cold brew coffee",
  ]),
  tea: spec("Tea", "tea", [
    "tea",
    "black tea",
    "green tea",
    "earl grey",
    "matcha",
  ]),

  // The Bar pantry (D23): citrus, juices, syrups, bitters, mixers, dairy and
  // garnishes. Cellar bottles never satisfy these; the toggles do.
  lemon: spec(
    "Lemons",
    "citrus",
    [
      "lemon",
      "lemons",
      "lemon juice",
      "lemon twist",
      "lemon peel",
      "lemon wheel",
    ],
    { pantry: true },
  ),
  lime: spec(
    "Limes",
    "citrus",
    ["lime", "limes", "lime juice", "lime wedge", "lime wheel", "lime peel"],
    { pantry: true },
  ),
  orange: spec(
    "Oranges",
    "citrus",
    [
      "orange",
      "oranges",
      "orange juice",
      "orange peel",
      "orange twist",
      "orange slice",
      "orange wheel",
    ],
    { pantry: true },
  ),
  grapefruit: spec(
    "Grapefruit",
    "citrus",
    ["grapefruit", "grapefruit juice", "grapefruit peel"],
    { pantry: true },
  ),
  pineapple_juice: spec(
    "Pineapple juice",
    "juice",
    ["pineapple", "pineapple juice"],
    { pantry: true },
  ),
  cranberry_juice: spec(
    "Cranberry juice",
    "juice",
    ["cranberry", "cranberry juice"],
    { pantry: true },
  ),
  simple_syrup: spec(
    "Simple syrup",
    "syrup",
    [
      "simple syrup",
      "sugar syrup",
      "rich syrup",
      "rich simple syrup",
      "demerara syrup",
      "gomme",
      "gomme syrup",
    ],
    { family: "sweetener", pantry: true },
  ),
  honey_syrup: spec("Honey", "syrup", ["honey", "honey syrup"], {
    family: "sweetener",
    pantry: true,
  }),
  agave_syrup: spec(
    "Agave syrup",
    "syrup",
    ["agave syrup", "agave nectar", "agave"],
    { family: "sweetener", pantry: true },
  ),
  maple_syrup: spec("Maple syrup", "syrup", ["maple syrup", "maple"], {
    family: "sweetener",
    pantry: true,
  }),
  grenadine: spec("Grenadine", "syrup", ["grenadine"], { pantry: true }),
  orgeat: spec("Orgeat", "syrup", ["orgeat", "almond syrup"], {
    pantry: true,
  }),
  aromatic_bitters: spec(
    "Angostura bitters",
    "bitters",
    ["bitters", "angostura", "angostura bitters", "aromatic bitters"],
    { family: "bitters", pantry: true },
  ),
  orange_bitters: spec("Orange bitters", "bitters", ["orange bitters"], {
    family: "bitters",
    pantry: true,
  }),
  peychauds: spec(
    "Peychaud's bitters",
    "bitters",
    ["peychauds", "peychaud", "peychauds bitters"],
    { family: "bitters", pantry: true },
  ),
  soda_water: spec(
    "Soda water",
    "mixer",
    ["soda", "soda water", "club soda", "sparkling water", "seltzer"],
    { pantry: true },
  ),
  tonic: spec("Tonic water", "mixer", ["tonic", "tonic water"], {
    pantry: true,
  }),
  ginger_beer: spec("Ginger beer", "mixer", ["ginger beer"], {
    family: "ginger",
    pantry: true,
  }),
  ginger_ale: spec("Ginger ale", "mixer", ["ginger ale"], {
    family: "ginger",
    pantry: true,
  }),
  cola: spec("Cola", "mixer", ["cola", "coke", "coca cola"], { pantry: true }),
  egg: spec(
    "Eggs",
    "dairy",
    ["egg", "eggs", "egg white", "egg whites", "egg yolk", "whole egg"],
    { pantry: true },
  ),
  cream: spec(
    "Cream",
    "dairy",
    [
      "cream",
      "heavy cream",
      "double cream",
      "single cream",
      "half and half",
      "milk",
      "whole milk",
    ],
    { pantry: true },
  ),
  coconut_cream: spec(
    "Coconut cream",
    "dairy",
    ["coconut cream", "cream of coconut", "coconut milk"],
    { pantry: true },
  ),
  mint: spec("Mint", "garnish", ["mint", "mint leaves", "mint sprig"], {
    pantry: true,
  }),
  cherries: spec(
    "Cocktail cherries",
    "garnish",
    [
      "cherry",
      "cherries",
      "maraschino cherry",
      "luxardo cherry",
      "cocktail cherry",
    ],
    { pantry: true },
  ),
  olives: spec("Olives", "garnish", ["olive", "olives"], { pantry: true }),

  // Staples — in every kitchen, never a reason a drink cannot be made.
  sugar: spec(
    "Sugar",
    "staple",
    ["sugar", "sugar cube", "superfine sugar", "caster sugar", "white sugar"],
    { staple: true },
  ),
  water: spec("Water", "staple", ["water", "hot water", "cold water"], {
    staple: true,
  }),
  ice: spec("Ice", "staple", ["ice", "crushed ice", "ice cubes"], {
    staple: true,
  }),
  salt: spec("Salt", "staple", ["salt", "sea salt", "salt rim"], {
    staple: true,
  }),
} as const satisfies Record<string, BarKindSpec>;

export type BarKind = keyof typeof BAR_KINDS;

/** Every stored value, in declaration order — the extraction schema's enum. */
export const BAR_KIND_KEYS = Object.keys(BAR_KINDS) as readonly BarKind[];

export const isBarKind = (value: unknown): value is BarKind =>
  typeof value === "string" && Object.hasOwn(BAR_KINDS, value);

const kindSpec = (kind: BarKind): BarKindSpec => BAR_KINDS[kind];

/** The kind's display label, or the raw value for one this build never knew. */
export const barKindLabel = (
  kind: string | null | undefined,
): string | null => {
  if (kind === null || kind === undefined || kind === "") return null;
  if (isBarKind(kind)) return kindSpec(kind).label;
  return kind
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (first) => first.toUpperCase());
};

/** The spirit kinds — `recipe_groups.base_spirit` and the extraction's `baseSpirit`. */
export const BASE_SPIRIT_KINDS = BAR_KIND_KEYS.filter(
  (kind) => kindSpec(kind).group === "spirit",
);

/* -------------------------------------------------------------------------- */
/* The Bar pantry (D23)                                                        */
/* -------------------------------------------------------------------------- */

/** The pantry screen's sections, in order. */
export const PANTRY_SECTIONS: readonly {
  readonly title: string;
  readonly groups: readonly BarKindGroup[];
}[] = [
  { title: "Citrus & juice", groups: ["citrus", "juice"] },
  { title: "Syrups", groups: ["syrup"] },
  { title: "Bitters", groups: ["bitters"] },
  { title: "Vermouth & fortified", groups: ["fortified"] },
  { title: "Mixers", groups: ["mixer"] },
  { title: "Dairy & eggs", groups: ["dairy"] },
  { title: "Garnishes", groups: ["garnish"] },
];

/** The toggles, in screen order. ~30 of them (D23). */
export const PANTRY_KINDS: readonly BarKind[] = PANTRY_SECTIONS.flatMap(
  (section) =>
    BAR_KIND_KEYS.filter((kind) => {
      const entry = kindSpec(kind);
      return entry.pantry === true && section.groups.includes(entry.group);
    }),
);

export const isPantryKind = (value: unknown): value is BarKind =>
  isBarKind(value) && kindSpec(value).pantry === true;

/* -------------------------------------------------------------------------- */
/* Classification                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Lowercase, accents off, apostrophes dropped, everything else that is not a
 * letter or digit a single space, padded so `includes(" lime ")` is a
 * whole-word test. "Peychaud's" → " peychauds ", "Crème de cassis" →
 * " creme de cassis ".
 */
export const normaliseForMatch = (text: string): string =>
  ` ${text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

type KeywordEntry = { readonly phrase: string; readonly kind: BarKind };

/** Longest phrase first, so the first hit is the most specific one. */
const KEYWORDS: readonly KeywordEntry[] = BAR_KIND_KEYS.flatMap((kind) =>
  kindSpec(kind).keywords.map((keyword) => ({
    phrase: normaliseForMatch(keyword),
    kind,
  })),
).sort((a, b) => b.phrase.length - a.phrase.length);

/**
 * The kind a piece of text names, by its longest whole-word keyword, or
 * `null`. Optionally limited to some groups — a cellar bottle typed SPIRIT
 * may only be read as a spirit, liqueur or fortified wine, never as "limes".
 */
export const classifyText = (
  text: string | null | undefined,
  groups?: readonly BarKindGroup[],
): BarKind | null => {
  if (typeof text !== "string" || text.trim() === "") return null;
  const haystack = normaliseForMatch(text);
  for (const entry of KEYWORDS) {
    if (groups !== undefined && !groups.includes(kindSpec(entry.kind).group)) {
      continue;
    }
    if (haystack.includes(entry.phrase)) return entry.kind;
  }
  return null;
};

/** `spirit_type` values (reference table) to the kind a bottle of it is. */
const SPIRIT_TYPE_KINDS: Readonly<Record<string, BarKind>> = {
  VODKA: "vodka",
  GIN: "gin",
  RUM: "rum",
  TEQUILA: "tequila",
  MEZCAL: "mezcal",
  BOURBON: "bourbon",
  SCOTCH: "scotch",
  WHISKEY: "whiskey",
  BRANDY_COGNAC: "brandy",
  LIQUEURS: "liqueur",
  AMARO_APERITIF_VERMOUTH: "amaro",
  SOJU: "soju",
  BAIJIU: "baijiu",
  MOONSHINE: "moonshine",
};

/** `wine_style` values to the kind a bottle of it is. */
const WINE_STYLE_KINDS: Readonly<Record<string, BarKind>> = {
  SPARKLING: "sparkling_wine",
  RED: "red_wine",
  WHITE: "white_wine",
  ROSE: "rose_wine",
};

/** Spirit types broad enough that the bottle's name should decide. */
const CATCH_ALL_SPIRIT_TYPES: ReadonlySet<string> = new Set([
  "LIQUEURS",
  "AMARO_APERITIF_VERMOUTH",
]);

/** What a bottle's own facts say it is — the input to {@link bottleKind}. */
export type BottleFacts = {
  readonly type: ItemType;
  readonly name: string;
  /** `spirits.type`, for a spirit. */
  readonly spiritType?: string | null;
  /** `wines.style`, for a wine. */
  readonly wineStyle?: string | null;
};

const sameLine = (a: BarKind, b: BarKind): boolean => {
  if (a === b) return true;
  const left = kindSpec(a);
  const right = kindSpec(b);
  if (left.parent === b || right.parent === a) return true;
  return left.family !== undefined && left.family === right.family;
};

/**
 * The kind one cellar bottle is, or `null` when nothing honest can be said.
 *
 * A spirit is read from its name first ("Rittenhouse Rye" typed WHISKEY is
 * rye; "Carpano Antica Formula" typed AMARO_APERITIF_VERMOUTH is sweet
 * vermouth), but the name is only believed when it agrees with the type's
 * line — a BOURBON-typed bottle called "Orange Grove Reserve" is bourbon, not
 * an orange — or when the type is one of the two catch-alls (liqueurs, amaro/
 * aperitif/vermouth), where the name is the only thing that can decide.
 */
export const bottleKind = (bottle: BottleFacts): BarKind | null => {
  switch (bottle.type) {
    case "SPIRIT": {
      const typed =
        bottle.spiritType === null || bottle.spiritType === undefined
          ? null
          : (SPIRIT_TYPE_KINDS[bottle.spiritType] ?? null);
      const named = classifyText(bottle.name, [
        "spirit",
        "liqueur",
        "fortified",
      ]);
      if (named === null) return typed;
      if (typed === null) return named;
      if (CATCH_ALL_SPIRIT_TYPES.has(bottle.spiritType ?? "")) return named;
      return sameLine(named, typed) ? named : typed;
    }
    case "WINE": {
      const styled =
        bottle.wineStyle === null || bottle.wineStyle === undefined
          ? null
          : (WINE_STYLE_KINDS[bottle.wineStyle] ?? null);
      return styled ?? classifyText(bottle.name, ["fortified", "wine"]);
    }
    case "BEER":
      return "beer";
    case "SAKE":
      return "sake";
    case "COFFEE":
      return "coffee";
    case "TEA":
      return "tea";
  }
};

/**
 * What an ingredient row says about itself, for {@link inferIngredientMeta}:
 * the referenced item or generic item's name and facts, plus anything already
 * stored.
 */
export type IngredientFacts = {
  /** The item's or generic item's name; `null` if the reference dangles. */
  readonly name: string | null;
  /** `GENERIC` or one of the six item types. */
  readonly refType: string;
  readonly brandMentioned?: string | null;
  readonly genericCategory?: string | null;
  readonly spiritType?: string | null;
  readonly wineStyle?: string | null;
  readonly quantity?: number | null;
  readonly unit?: string | null;
  readonly isOptional?: boolean | null;
  /** Stored values win over anything inferred. */
  readonly kind?: string | null;
  readonly role?: string | null;
  /** The model's answer at extraction time, used only if the name says nothing. */
  readonly modelKind?: string | null;
  readonly modelRole?: string | null;
};

const ITEM_TYPE_REFS: ReadonlySet<string> = new Set([
  "WINE",
  "BEER",
  "SPIRIT",
  "COFFEE",
  "SAKE",
  "TEA",
]);

/**
 * The kind of one ingredient: stored, else the referenced bottle's kind (a
 * specific spirit), else the name's (+ printed brand's) keywords, else the
 * generic item's category, else the model's in-vocabulary answer, else null.
 */
export const resolveKind = (facts: IngredientFacts): BarKind | null => {
  if (isBarKind(facts.kind)) return facts.kind;
  if (ITEM_TYPE_REFS.has(facts.refType) && facts.name !== null) {
    const fromBottle = bottleKind({
      type: facts.refType as ItemType,
      name: facts.name,
      spiritType: facts.spiritType ?? null,
      wineStyle: facts.wineStyle ?? null,
    });
    if (fromBottle !== null) return fromBottle;
  }
  const text = [facts.brandMentioned, facts.name]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return (
    classifyText(text) ??
    classifyText(facts.genericCategory) ??
    (isBarKind(facts.modelKind) ? facts.modelKind : null)
  );
};

const GARNISH_WORDS = / (twist|peel|wheel|wedge|slice|sprig|garnish|zest|rim) /;

/** Amount in ounces, for choosing a base. Unknown units compare as 0. */
const ounces = (quantity?: number | null, unit?: string | null): number => {
  if (quantity === null || quantity === undefined) return 0;
  const u = normaliseForMatch(unit ?? "").trim();
  if (
    u === "oz" ||
    u === "ounce" ||
    u === "ounces" ||
    u === "part" ||
    u === "parts"
  ) {
    return quantity;
  }
  if (u === "ml") return quantity / 30;
  if (u === "cl") return quantity / 3;
  return 0;
};

const roleForGroup = (group: BarKindGroup, kind: BarKind): IngredientRole => {
  switch (group) {
    case "spirit":
      return "base";
    case "liqueur":
    case "fortified":
      return "modifier";
    case "citrus":
    case "juice":
      return group === "citrus" ? "acid" : "mixer";
    case "syrup":
      return "sweetener";
    case "bitters":
      return "bitters";
    case "mixer":
      return "mixer";
    case "garnish":
      // Muddled mint is the drink, not its decoration.
      return kind === "mint" ? "other" : "garnish";
    case "staple":
      return kind === "sugar" ? "sweetener" : "other";
    case "wine":
    case "beer":
    case "sake":
    case "coffee":
    case "tea":
      return "mixer";
    case "dairy":
      return "other";
  }
};

export type InferredIngredientMeta = {
  readonly kind: BarKind | null;
  readonly role: IngredientRole | null;
};

/**
 * Kind and role for every ingredient of one recipe, together — a role is
 * relative ("base" is the *largest* spirit pour; the others are modifiers),
 * so it cannot be decided one row at a time.
 *
 * Stored values are kept as they are. A role is inferred only when there is a
 * kind to infer it from; with neither, both stay `null`.
 */
export const inferIngredientMeta = (
  ingredients: readonly IngredientFacts[],
): InferredIngredientMeta[] => {
  const kinds = ingredients.map(resolveKind);

  // The base: the largest spirit pour, the first one on a tie. When there is
  // no spirit at all, the largest wine/beer/sake/coffee/tea pour is the base
  // (a mimosa, a michelada, an espresso tonic).
  const baseIndex = (groups: readonly BarKindGroup[]): number => {
    let best = -1;
    let bestOz = -1;
    kinds.forEach((kind, index) => {
      if (kind === null || !groups.includes(kindSpec(kind).group)) return;
      const facts = ingredients[index];
      const oz = ounces(facts?.quantity, facts?.unit);
      if (oz > bestOz) {
        best = index;
        bestOz = oz;
      }
    });
    return best;
  };
  let base = baseIndex(["spirit"]);
  if (base === -1) base = baseIndex(["wine", "beer", "sake", "coffee", "tea"]);

  return ingredients.map((facts, index) => {
    const kind = kinds[index] ?? null;
    if (isIngredientRole(facts.role)) return { kind, role: facts.role };
    // The model's role is used only where the rules have nothing to go on.
    // Where they do, they win: a small model calling the muddled mint of a
    // Mojito a "garnish" would make the drink look makeable without it.
    if (kind === null) {
      return {
        kind,
        role: isIngredientRole(facts.modelRole) ? facts.modelRole : null,
      };
    }
    const group = kindSpec(kind).group;
    const name = normaliseForMatch(facts.name ?? "");
    let role: IngredientRole;
    if (index === base) role = "base";
    else if (GARNISH_WORDS.test(name)) role = "garnish";
    else if (group === "spirit") role = "modifier";
    else role = roleForGroup(group, kind);
    return { kind, role };
  });
};

/** The recipe's base spirit: the base-role ingredient's kind, if a spirit. */
export const baseSpiritOf = (
  meta: readonly InferredIngredientMeta[],
): BarKind | null => {
  const base = meta.find(
    (entry) =>
      entry.role === "base" &&
      entry.kind !== null &&
      kindSpec(entry.kind).group === "spirit",
  );
  return base?.kind ?? null;
};

/* -------------------------------------------------------------------------- */
/* The viewer's bar                                                            */
/* -------------------------------------------------------------------------- */

/** One bottle still in one of the viewer's own cellars. */
export type BarBottle = {
  readonly cellarItemId: string;
  readonly cellarId: string;
  readonly itemType: ItemType;
  readonly itemId: string;
  readonly name: string;
  readonly kind: BarKind | null;
  /** 0–100. */
  readonly percentageRemaining: number;
  readonly opened: boolean;
};

export type BarInventory = {
  /** Pantry toggles that are on. */
  readonly pantry: readonly BarKind[];
  /** Bottles not yet finished, in cellars the viewer created or co-owns. */
  readonly bottles: readonly BarBottle[];
};

export const EMPTY_BAR_INVENTORY: BarInventory = { pantry: [], bottles: [] };

/* -------------------------------------------------------------------------- */
/* Availability                                                                */
/* -------------------------------------------------------------------------- */

export const AVAILABILITY_STATUSES = [
  "HAVE",
  "SUBSTITUTE",
  "MISSING",
  "UNKNOWN",
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_SOURCES = ["BOTTLE", "PANTRY", "STAPLE"] as const;
export type AvailabilitySource = (typeof AVAILABILITY_SOURCES)[number];

export type IngredientAvailability = {
  readonly status: AvailabilityStatus;
  readonly source: AvailabilitySource | null;
  /** The bottle when `source` is BOTTLE. */
  readonly bottle: BarBottle | null;
  /** The kind that answered: the ingredient's own, or the stand-in's. */
  readonly via: BarKind | null;
};

/** The ingredient as availability needs it. */
export type AvailabilityInput = {
  readonly kind: string | null;
  /** The referenced catalog item, when the ingredient names a specific one. */
  readonly item?: { readonly type: string; readonly id: string } | null;
};

/**
 * Which bottle to point at when several would do: one already open first
 * (that is what "Use it up" means), then the emptiest.
 */
const preferBottle = (a: BarBottle, b: BarBottle): number => {
  if (a.opened !== b.opened) return a.opened ? -1 : 1;
  return a.percentageRemaining - b.percentageRemaining;
};

const pick = (bottles: readonly BarBottle[]): BarBottle | null =>
  [...bottles].sort(preferBottle)[0] ?? null;

const have = (
  source: AvailabilitySource,
  via: BarKind | null,
  bottle: BarBottle | null = null,
): IngredientAvailability => ({ status: "HAVE", source, bottle, via });

/**
 * Have, Substitute, Missing or Unknown for one ingredient (D9: real
 * availability, from bottles and the Bar pantry — never `Math.random()`).
 *
 *  1. The exact catalog item is on the shelf → **Have** (that bottle).
 *  2. No kind → **Unknown** ("Not tracked").
 *  3. A staple → **Have**.
 *  4. A bottle of that kind, or of a narrower kind that satisfies it
 *     (bourbon for "whiskey") → **Have**.
 *  5. The pantry toggle, or a narrower pantry kind → **Have**.
 *  6. A bottle or pantry kind in the same family, or the broader kind (a
 *     generic WHISKEY bottle for "rye") → **Substitute**.
 *  7. Otherwise **Missing**.
 */
export const ingredientAvailability = (
  ingredient: AvailabilityInput,
  inventory: BarInventory,
): IngredientAvailability => {
  const item = ingredient.item;
  if (item !== null && item !== undefined) {
    const exact = pick(
      inventory.bottles.filter(
        (bottle) => bottle.itemType === item.type && bottle.itemId === item.id,
      ),
    );
    if (exact !== null) return have("BOTTLE", exact.kind, exact);
  }

  const kind = ingredient.kind;
  if (!isBarKind(kind)) {
    return { status: "UNKNOWN", source: null, bottle: null, via: null };
  }
  const wanted = kindSpec(kind);
  if (wanted.staple === true) return have("STAPLE", kind);

  const satisfies = (candidate: BarKind | null): candidate is BarKind =>
    candidate !== null &&
    (candidate === kind || kindSpec(candidate).parent === kind);

  const bottle = pick(inventory.bottles.filter((b) => satisfies(b.kind)));
  if (bottle !== null) return have("BOTTLE", bottle.kind, bottle);

  const pantryHit = inventory.pantry.find(satisfies);
  if (pantryHit !== undefined) return have("PANTRY", pantryHit);

  const standsIn = (candidate: BarKind | null): candidate is BarKind => {
    if (candidate === null || candidate === kind) return false;
    if (candidate === wanted.parent) return true;
    const other = kindSpec(candidate);
    return wanted.family !== undefined && other.family === wanted.family;
  };
  const swap = pick(inventory.bottles.filter((b) => standsIn(b.kind)));
  if (swap !== null) {
    return {
      status: "SUBSTITUTE",
      source: "BOTTLE",
      bottle: swap,
      via: swap.kind,
    };
  }
  const pantrySwap = inventory.pantry.find(standsIn);
  if (pantrySwap !== undefined) {
    return {
      status: "SUBSTITUTE",
      source: "PANTRY",
      bottle: null,
      via: pantrySwap,
    };
  }
  return { status: "MISSING", source: null, bottle: null, via: null };
};

/* -------------------------------------------------------------------------- */
/* Makeability (G29)                                                           */
/* -------------------------------------------------------------------------- */

export const MAKEABILITY_STATUSES = [
  "MAKE_NOW",
  "ONE_AWAY",
  "MISSING",
] as const;
export type MakeabilityStatus = (typeof MAKEABILITY_STATUSES)[number];

export type MakeabilityIngredient = AvailabilityInput & {
  readonly role: string | null;
  readonly isOptional: boolean;
  /** For naming what is missing; the kind's label is used when absent. */
  readonly name?: string | null;
};

export type RecipeMakeability = {
  readonly status: MakeabilityStatus;
  /** Required ingredients that are Missing or Unknown. */
  readonly missing: readonly string[];
  /** The kinds behind `missing`, where known (what to buy). */
  readonly missingKinds: readonly BarKind[];
  readonly substituteCount: number;
  /** Required ingredients, and how many of them are Have or Substitute. */
  readonly requiredCount: number;
  readonly haveCount: number;
};

/**
 * Whether a recipe can be made from this bar.
 *
 * Required means not optional and not a garnish — a missing lemon twist never
 * stops a Negroni. **Make now**: nothing required is Missing or Unknown
 * (substitutes allowed, and counted, so the screen can say "1 swap"). **One
 * bottle away**: exactly one is. An Unknown counts as missing on purpose: the
 * app cannot vouch for an ingredient it cannot name, and claiming a drink is
 * makeable when it is not is the one wrong answer this screen must not give.
 */
export const recipeMakeability = (
  ingredients: readonly MakeabilityIngredient[],
  inventory: BarInventory,
): RecipeMakeability => {
  const missing: string[] = [];
  const missingKinds: BarKind[] = [];
  let substituteCount = 0;
  let requiredCount = 0;
  let haveCount = 0;
  for (const ingredient of ingredients) {
    if (ingredient.isOptional || ingredient.role === "garnish") continue;
    requiredCount += 1;
    const answer = ingredientAvailability(ingredient, inventory);
    if (answer.status === "HAVE") haveCount += 1;
    else if (answer.status === "SUBSTITUTE") {
      haveCount += 1;
      substituteCount += 1;
    } else {
      missing.push(
        (ingredient.name ?? "").trim() ||
          barKindLabel(ingredient.kind) ||
          "An ingredient",
      );
      if (isBarKind(ingredient.kind)) missingKinds.push(ingredient.kind);
    }
  }
  const status: MakeabilityStatus =
    missing.length === 0
      ? "MAKE_NOW"
      : missing.length === 1
        ? "ONE_AWAY"
        : "MISSING";
  return {
    status,
    missing,
    missingKinds,
    substituteCount,
    requiredCount,
    haveCount,
  };
};

/**
 * The ingredient kinds one bottle answers as a **Have** — its own kind and the
 * broader one (a bourbon serves "bourbon" and "whiskey"). What "Cocktails
 * with this" matches on.
 */
export const kindsSatisfiedBy = (kind: BarKind | null): readonly BarKind[] => {
  if (kind === null) return [];
  const parent = kindSpec(kind).parent;
  return isBarKind(parent) ? [kind, parent] : [kind];
};
