/**
 * Configuration for generating rich embedding text from recipe data
 *
 * This module defines keyword mappings and configurations specific to recipes,
 * including recipe types, categories, base spirits, difficulty levels, and more.
 */

// =============================================================================
// Recipe Type Keywords
// =============================================================================

/**
 * Keywords for recipe types (food vs cocktail)
 */
export const RECIPE_TYPE_KEYWORDS = {
  cocktail: [
    "cocktail",
    "mixed drink",
    "alcoholic beverage",
    "bar drink",
    "mixer",
    "spirit-based",
    "drink recipe",
    "bartender",
    "mixology",
  ],
  food: [
    "food",
    "dish",
    "meal",
    "cooking",
    "cuisine",
    "culinary",
    "recipe",
    "homemade",
    "prepared",
    "cook",
  ],
} as const;

// =============================================================================
// Recipe Category Keywords (from recipe_group.category)
// =============================================================================

/**
 * Keywords for recipe categories
 */
export const CATEGORY_KEYWORDS = {
  cocktail: [
    "cocktail",
    "classic cocktail",
    "modern cocktail",
    "craft cocktail",
    "signature drink",
  ],
  mocktail: [
    "mocktail",
    "non-alcoholic",
    "virgin",
    "alcohol-free",
    "zero-proof",
    "NA drink",
    "sober curious",
  ],
  shot: ["shot", "shooter", "quick drink", "party drink", "layered shot"],
  punch: [
    "punch",
    "batch cocktail",
    "party drink",
    "bowl drink",
    "large format",
    "sharing drink",
  ],
  other: ["beverage", "drink", "refreshment"],
} as const;

// =============================================================================
// Base Spirit Keywords
// =============================================================================

/**
 * Keywords for base spirits (from recipe_group.base_spirit)
 */
export const BASE_SPIRIT_KEYWORDS: Record<string, readonly string[]> = {
  gin: [
    "gin",
    "juniper",
    "botanical",
    "london dry",
    "gin-based",
    "gin cocktail",
  ],
  vodka: [
    "vodka",
    "neutral spirit",
    "vodka-based",
    "clean spirit",
    "vodka cocktail",
  ],
  rum: [
    "rum",
    "molasses",
    "caribbean",
    "rum-based",
    "tropical",
    "tiki",
    "rum cocktail",
  ],
  tequila: [
    "tequila",
    "agave",
    "mexican",
    "tequila-based",
    "margarita family",
    "tequila cocktail",
  ],
  mezcal: [
    "mezcal",
    "smoky",
    "agave",
    "artisanal",
    "oaxacan",
    "mezcal cocktail",
  ],
  whiskey: [
    "whiskey",
    "whisky",
    "bourbon",
    "rye",
    "scotch",
    "whiskey-based",
    "whiskey cocktail",
  ],
  bourbon: [
    "bourbon",
    "american whiskey",
    "kentucky",
    "bourbon-based",
    "bourbon cocktail",
  ],
  rye: ["rye", "rye whiskey", "spicy whiskey", "rye-based", "rye cocktail"],
  scotch: [
    "scotch",
    "scotch whisky",
    "single malt",
    "blended scotch",
    "scotch cocktail",
  ],
  brandy: [
    "brandy",
    "cognac",
    "grape spirit",
    "brandy-based",
    "brandy cocktail",
  ],
  cognac: ["cognac", "french brandy", "VS", "VSOP", "XO", "cognac cocktail"],
  wine: ["wine", "wine-based", "fortified", "vermouth", "wine cocktail"],
  champagne: [
    "champagne",
    "sparkling wine",
    "bubbles",
    "celebration",
    "champagne cocktail",
  ],
  beer: ["beer", "beer cocktail", "shandy", "radler", "beer-based"],
  sake: ["sake", "nihonshu", "japanese rice wine", "sake cocktail"],
  liqueur: ["liqueur", "cordial", "sweet spirit", "flavored spirit"],
  aperitif: ["aperitif", "apéritif", "pre-dinner drink", "appetite opener"],
  digestif: ["digestif", "after-dinner drink", "amaro", "bitter"],
} as const;

// =============================================================================
// Difficulty Level Keywords
// =============================================================================

/**
 * Keywords for difficulty levels (1-5)
 */
export const DIFFICULTY_KEYWORDS: Record<number, readonly string[]> = {
  1: ["easy", "beginner", "simple", "quick", "basic", "straightforward"],
  2: ["easy-moderate", "intermediate beginner", "accessible", "approachable"],
  3: ["moderate", "intermediate", "some skill required", "medium difficulty"],
  4: ["challenging", "advanced", "skilled", "complex technique", "experienced"],
  5: [
    "expert",
    "professional",
    "master level",
    "highly complex",
    "bartender skill",
  ],
} as const;

// =============================================================================
// Instruction Type Keywords
// =============================================================================

/**
 * Keywords for instruction types
 */
export const INSTRUCTION_TYPE_KEYWORDS = {
  prep: ["preparation", "mise en place", "setup", "ingredient prep"],
  mix: ["mixing", "stirring", "shaking", "blending", "combining"],
  garnish: ["garnish", "decoration", "presentation", "finishing touch"],
  serve: ["serving", "presentation", "glassware", "pour"],
  cook: ["cooking", "heating", "infusing", "simmering"],
  chill: ["chilling", "ice", "cold", "frozen", "cooling"],
} as const;

// =============================================================================
// Generic Ingredient Category Keywords
// =============================================================================

/**
 * Keywords for generic ingredient categories
 */
export const INGREDIENT_CATEGORY_KEYWORDS: Record<string, readonly string[]> = {
  citrus: ["citrus", "sour", "acidic", "fresh", "bright", "tart"],
  sweetener: ["sweet", "sugar", "syrup", "honey", "agave", "simple syrup"],
  bitters: ["bitters", "aromatic", "bitter", "herbal", "angostura"],
  dairy: ["creamy", "milk", "cream", "rich", "velvety"],
  egg: ["frothy", "silky", "foam", "texture", "egg white"],
  herb: ["herbal", "fresh herbs", "botanical", "aromatic", "mint", "basil"],
  fruit: ["fruity", "fresh fruit", "juice", "puree", "berries"],
  spice: ["spicy", "warming", "aromatic spice", "cinnamon", "ginger"],
  garnish: ["garnish", "decoration", "visual", "aromatic garnish"],
  modifier: ["modifier", "vermouth", "liqueur", "amaro"],
  mixer: ["mixer", "soda", "tonic", "ginger beer", "sparkling"],
  ice: ["ice", "crushed ice", "ice sphere", "frozen"],
} as const;

// =============================================================================
// Spirit Type Keywords (for spirit ingredients)
// =============================================================================

/**
 * Keywords for spirit types found in ingredients
 */
export const SPIRIT_TYPE_KEYWORDS: Record<string, readonly string[]> = {
  WHISKEY: ["whiskey", "whisky", "american whiskey"],
  BOURBON: ["bourbon", "kentucky bourbon", "american whiskey"],
  SCOTCH: ["scotch", "scotch whisky", "single malt"],
  VODKA: ["vodka", "neutral spirit"],
  GIN: ["gin", "juniper", "botanical spirit"],
  RUM: ["rum", "white rum", "dark rum", "aged rum"],
  TEQUILA: ["tequila", "agave spirit", "blanco", "reposado", "añejo"],
  BRANDY_COGNAC: ["brandy", "cognac", "grape spirit"],
  MEZCAL: ["mezcal", "smoky agave"],
  BAIJIU: ["baijiu", "chinese spirit"],
  SOJU: ["soju", "korean spirit"],
  LIQUEURS: ["liqueur", "cordial", "flavored spirit"],
  AMARO_APERITIF_VERMOUTH: ["amaro", "aperitif", "vermouth", "bitter"],
  MOONSHINE: ["moonshine", "white whiskey"],
} as const;

// =============================================================================
// Wine Style Keywords (for wine ingredients)
// =============================================================================

/**
 * Keywords for wine styles found in ingredients
 */
export const WINE_STYLE_KEYWORDS: Record<string, readonly string[]> = {
  RED: ["red wine", "rouge"],
  WHITE: ["white wine", "blanc"],
  ROSE: ["rosé", "rose wine", "pink wine"],
  SPARKLING: ["sparkling wine", "champagne", "prosecco", "bubbles"],
  DESSERT: ["dessert wine", "sweet wine", "fortified"],
} as const;

// =============================================================================
// Beer Style Keywords (for beer ingredients)
// =============================================================================

/**
 * Keywords for beer styles found in ingredients (simplified)
 */
export const BEER_STYLE_KEYWORDS: Record<string, readonly string[]> = {
  INDIA_PALE_ALE: ["IPA", "hoppy beer"],
  STOUT: ["stout", "dark beer"],
  PORTER: ["porter", "dark beer"],
  PILSENER_PILSNER_PILS: ["pilsner", "lager"],
  PALE_ALE: ["pale ale"],
  WHEAT: ["wheat beer", "hefeweizen"],
  LAGER: ["lager", "crisp beer"],
  SOUR: ["sour beer", "tart"],
} as const;

// =============================================================================
// Prep Time Keywords
// =============================================================================

/**
 * Get keywords based on prep time in minutes
 */
export function getPrepTimeKeywords(minutes: number): string[] {
  if (minutes <= 5) {
    return ["quick", "fast", "5 minutes or less", "instant"];
  } else if (minutes <= 15) {
    return ["quick preparation", "under 15 minutes", "easy prep"];
  } else if (minutes <= 30) {
    return ["moderate time", "30 minutes", "some prep required"];
  } else {
    return ["time-intensive", "elaborate", "lengthy preparation"];
  }
}

// =============================================================================
// Serving Size Keywords
// =============================================================================

/**
 * Get keywords based on serving size
 */
export function getServingSizeKeywords(servings: number): string[] {
  if (servings === 1) {
    return ["single serving", "individual", "one drink"];
  } else if (servings <= 4) {
    return ["small batch", "few servings", "couple drinks"];
  } else {
    return ["batch recipe", "party size", "large batch", "crowd pleaser"];
  }
}

// =============================================================================
// Ingredient Count Keywords
// =============================================================================

/**
 * Get keywords based on number of ingredients
 */
export function getIngredientCountKeywords(count: number): string[] {
  if (count <= 3) {
    return ["simple ingredients", "few ingredients", "minimalist"];
  } else if (count <= 6) {
    return ["moderate ingredients", "balanced complexity"];
  } else {
    return ["many ingredients", "complex recipe", "elaborate"];
  }
}
