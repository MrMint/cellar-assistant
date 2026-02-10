import type { ItemType } from "../types";

// Enhanced name-based keyword detection (non-brand keywords only)
export const NAME_KEYWORDS: Record<ItemType, string[]> = {
  wine: ["wine", "vino", "cellar", "vineyard", "tasting", "sommelier"],
  beer: ["beer", "brewery", "brewing", "ale", "lager", "hops", "tap", "draft"],
  spirit: [
    "cocktail",
    "whiskey",
    "bourbon",
    "gin",
    "vodka",
    "rum",
    "tequila",
    "spirit",
    "distillery",
    "lounge",
  ],
  coffee: [
    "coffee",
    "cafe",
    "espresso",
    "latte",
    "cappuccino",
    "roastery",
    "beans",
  ],
  sake: [
    "sake",
    "saki", // Common misspelling
    "junmai",
    "daiginjo",
    "ginjo",
    "nigori",
    "izakaya",
    "japanese",
    "sushi",
  ],
};
