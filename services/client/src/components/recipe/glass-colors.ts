/**
 * B03: a recipe glass coloured by what is in it. A fixed ingredient → hue
 * table, matched on the ingredient's words; the glass's body takes the
 * dominant ingredient's hue and its top band the second's (the Main board).
 * There is no glassware data, so only the colour comes from the ingredients
 * and the shape is fixed per recipe type (L36).
 *
 * Every hue is a mix of the design tokens' custom properties — no raw colour
 * (the ui-platform guard), and a token change moves every glass with it.
 * Pure and deterministic: the same ingredients always pour the same glass.
 */

export const HUES = [
  "red",
  "orange",
  "amber",
  "gold",
  "citrus",
  "green",
  "blue",
  "purple",
  "coffee",
  "cream",
  "clear",
  "neutral",
] as const;

export type Hue = (typeof HUES)[number];

const mix = (a: string, pct: number, b: string) =>
  `color-mix(in oklab, ${a} ${pct}%, ${b})`;

/** Each hue as a CSS colour, built from `--ca-*` tokens only. */
export const HUE_COLOR: Readonly<Record<Hue, string>> = {
  red: mix("var(--ca-danger)", 60, "var(--ca-brand)"),
  orange: mix("var(--ca-danger)", 50, "var(--ca-type-beer)"),
  amber: mix("var(--ca-type-spirit)", 60, "var(--ca-type-beer)"),
  gold: mix("var(--ca-accent)", 75, "var(--ca-ink-1)"),
  citrus: mix(
    mix("var(--ca-accent)", 55, "var(--ca-success)"),
    75,
    "var(--ca-ink-1)",
  ),
  green: mix("var(--ca-type-tea-text)", 85, "var(--ca-ink-1)"),
  blue: "var(--ca-type-sake-text)",
  purple: mix("var(--ca-type-sake)", 55, "var(--ca-brand)"),
  coffee: mix("var(--ca-type-coffee)", 60, "var(--ca-bg)"),
  cream: mix("var(--ca-ink-1)", 80, "var(--ca-accent)"),
  clear: mix("var(--ca-ink-1)", 30, "var(--ca-surface-3)"),
  neutral: mix("var(--ca-ink-3)", 50, "var(--ca-surface-3)"),
};

/**
 * Phrase → hue, most specific first: "blue curaçao" before "curaçao", "dry
 * vermouth" before "vermouth", "ginger beer" before "beer", "egg white"
 * before "white". Whole words only, so "ginger" is never gin.
 */
export const INGREDIENT_HUES: readonly (readonly [string, Hue])[] = [
  ["blue curacao", "blue"],
  ["butterfly pea", "blue"],
  ["creme de menthe", "green"],
  ["creme de violette", "purple"],
  ["blackberry", "purple"],
  ["cassis", "purple"],
  ["coffee liqueur", "coffee"],
  ["kahlua", "coffee"],
  ["espresso", "coffee"],
  ["coffee", "coffee"],
  ["cola", "coffee"],
  ["chocolate", "coffee"],
  ["cacao", "coffee"],
  ["stout", "coffee"],
  ["irish cream", "cream"],
  ["egg white", "cream"],
  ["egg", "cream"],
  ["cream", "cream"],
  ["milk", "cream"],
  ["coconut", "cream"],
  ["orgeat", "cream"],
  ["ginger beer", "gold"],
  ["ginger ale", "gold"],
  ["dry vermouth", "clear"],
  ["blanc vermouth", "clear"],
  ["white rum", "clear"],
  ["sweet vermouth", "red"],
  ["vermouth", "red"],
  ["campari", "red"],
  ["grenadine", "red"],
  ["cranberry", "red"],
  ["cherry", "red"],
  ["raspberry", "red"],
  ["strawberry", "red"],
  ["pomegranate", "red"],
  ["hibiscus", "red"],
  ["tomato", "red"],
  ["angostura", "red"],
  ["aperol", "orange"],
  ["orange", "orange"],
  ["passion fruit", "orange"],
  ["peach", "orange"],
  ["apricot", "orange"],
  ["mango", "orange"],
  ["green chartreuse", "green"],
  ["mint", "green"],
  ["basil", "green"],
  ["cucumber", "green"],
  ["absinthe", "green"],
  ["midori", "green"],
  ["matcha", "green"],
  ["lime", "citrus"],
  ["lemon", "citrus"],
  ["grapefruit", "citrus"],
  ["dark rum", "amber"],
  ["whiskey", "amber"],
  ["whisky", "amber"],
  ["bourbon", "amber"],
  ["rye", "amber"],
  ["scotch", "amber"],
  ["brandy", "amber"],
  ["cognac", "amber"],
  ["amaro", "amber"],
  ["beer", "amber"],
  ["maple", "amber"],
  ["honey", "gold"],
  ["pineapple", "gold"],
  ["elderflower", "gold"],
  ["apple", "gold"],
  ["reposado", "gold"],
  ["anejo", "gold"],
  ["rum", "gold"],
  ["chartreuse", "gold"],
  ["lillet", "gold"],
  ["white wine", "gold"],
  ["red wine", "red"],
  ["prosecco", "gold"],
  ["champagne", "gold"],
  ["gin", "clear"],
  ["vodka", "clear"],
  ["tequila", "clear"],
  ["mezcal", "clear"],
  ["pisco", "clear"],
  ["sake", "clear"],
  ["soju", "clear"],
  ["triple sec", "clear"],
  ["cointreau", "clear"],
  ["maraschino", "clear"],
  ["curacao", "clear"],
  ["tonic", "clear"],
  ["soda", "clear"],
  ["water", "clear"],
  ["syrup", "clear"],
  ["sugar", "clear"],
];

/** Typed items with no telling words: their type's colour, else neutral. */
const TYPE_HUE: Readonly<Record<string, Hue>> = {
  COFFEE: "coffee",
  BEER: "amber",
  SAKE: "clear",
  TEA: "gold",
};

/** What a glass reads of one ingredient line (`RecipeIngredient`'s fields). */
export type GlassIngredient = {
  quantity?: number | null;
  unit?: string | null;
  role?: string | null;
  kind_label?: string | null;
  item?: { name: string; type?: string | null } | null;
  generic_item?: {
    name: string;
    category?: string | null;
    subcategory?: string | null;
  } | null;
};

const words = (value: string): string =>
  ` ${value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/** The hue for one name, or `neutral` when no phrase matches. */
export const hueOfText = (text: string): Hue => {
  const padded = words(text);
  for (const [phrase, hue] of INGREDIENT_HUES) {
    if (padded.includes(` ${phrase} `)) return hue;
  }
  return "neutral";
};

/**
 * One line's hue: the bar kind ("Sweet vermouth") says the most, then the
 * generic item's name and category, then the linked bottle's name, then the
 * bottle's type. Nothing recognised is `neutral`.
 */
export const ingredientHue = (ingredient: GlassIngredient): Hue => {
  const texts = [
    ingredient.kind_label,
    ingredient.generic_item?.name,
    ingredient.generic_item?.subcategory,
    ingredient.generic_item?.category,
    ingredient.item?.name,
  ];
  for (const text of texts) {
    if (text === null || text === undefined || text.trim() === "") continue;
    const hue = hueOfText(text);
    if (hue !== "neutral") return hue;
  }
  const type = ingredient.item?.type;
  return (type !== null && type !== undefined && TYPE_HUE[type]) || "neutral";
};

/** Millilitres per unit, roughly; an unknown unit counts as a splash. */
const UNIT_ML: Readonly<Record<string, number>> = {
  oz: 30,
  ounce: 30,
  ounces: 30,
  ml: 1,
  cl: 10,
  l: 1000,
  part: 30,
  parts: 30,
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tsp: 5,
  teaspoon: 5,
  barspoon: 5,
  dash: 1,
  dashes: 1,
  drop: 0.05,
  drops: 0.05,
};

const UNKNOWN_UNIT_ML = 10;

/** How much of the glass a line fills, in ml. A garnish fills none. */
export const volumeOf = (ingredient: GlassIngredient): number => {
  if (ingredient.role === "garnish") return 0;
  const quantity = ingredient.quantity;
  const unit = ingredient.unit?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  const perUnit = UNIT_ML[unit] ?? UNKNOWN_UNIT_ML;
  if (quantity === null || quantity === undefined || !(quantity > 0)) {
    return perUnit;
  }
  return quantity * perUnit;
};

/** Coloured hues outrank a clear one, and a clear one outranks unknown. */
const strength = (hue: Hue) =>
  hue === "neutral" ? 0 : hue === "clear" ? 1 : 2;

export type GlassColors = {
  /** The body of the drink: the dominant ingredient's hue. */
  base: Hue;
  /** The top band: the second ingredient's hue, else the base's. */
  top: Hue;
};

/**
 * The glass's two colours. Lines rank by colour strength, then by volume,
 * then by the order they came in (the server's — required first, by name),
 * so two equal pours always resolve the same way. The top band is the
 * next line of a different hue; one hue alone fills both.
 */
export const glassColors = (
  ingredients: readonly GlassIngredient[] | null | undefined,
): GlassColors => {
  const ranked = (ingredients ?? [])
    .map((ingredient, index) => ({
      hue: ingredientHue(ingredient),
      volume: volumeOf(ingredient),
      index,
    }))
    .filter((line) => line.volume > 0)
    .sort(
      (a, b) =>
        strength(b.hue) - strength(a.hue) ||
        b.volume - a.volume ||
        a.index - b.index,
    );
  const base = ranked[0]?.hue ?? "neutral";
  const top = ranked.find((line) => line.hue !== base)?.hue ?? base;
  return { base, top };
};
