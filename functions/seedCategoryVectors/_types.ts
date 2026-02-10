/**
 * Type definitions and label configuration for category vector seeding.
 *
 * This defines the ~200+ semantic labels that get embedded into the
 * category_vectors table. Each label maps to one or more place categories,
 * enabling natural language queries to resolve to structured category filters.
 *
 * KEY DESIGN PRINCIPLE: Each label has an `embeddingText` field — a rich,
 * descriptive sentence used as the actual text sent to the embedding model.
 * This produces dramatically better vectors than embedding the bare label,
 * because the model has more semantic context to work with. The `label`
 * field stays short for display and database matching.
 */

import { graphql } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// GraphQL Operations
// =============================================================================

export const UPSERT_CATEGORY_VECTOR = graphql(`
  mutation UpsertCategoryVector(
    $label: String!
    $labelType: String!
    $associatedCategories: [String!]!
    $vector: halfvec!
    $metadata: jsonb!
  ) {
    insert_category_vectors_one(
      object: {
        label: $label
        label_type: $labelType
        associated_categories: $associatedCategories
        vector: $vector
        metadata: $metadata
      }
      on_conflict: {
        constraint: category_vectors_label_key
        update_columns: [label_type, associated_categories, vector, metadata, updated_at]
      }
    ) {
      id
      label
    }
  }
`);

// =============================================================================
// Types
// =============================================================================

export type LabelType = "category" | "alias" | "item_type" | "descriptor";

/** Weight multipliers applied during category score aggregation. */
export const LABEL_TYPE_WEIGHTS: Record<LabelType, number> = {
  category: 1.0,
  item_type: 0.95,
  alias: 0.9,
  descriptor: 0.8,
};

export interface CategoryLabel {
  label: string;
  /** Rich description used as the text to embed. Produces better vectors. */
  embeddingText: string;
  labelType: LabelType;
  associatedCategories: string[];
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Category Label Definitions
// =============================================================================

/**
 * All primary categories from the places table.
 * Each maps to itself as the associated category.
 * The embeddingText provides rich context for the embedding model.
 */
const CATEGORY_LABELS: CategoryLabel[] = [
  {
    label: "bar",
    embeddingText:
      "A bar is a drinking establishment that serves alcoholic beverages including cocktails, beer, wine, and spirits in a social setting",
    labelType: "category",
    associatedCategories: ["bar"],
  },
  {
    label: "beer bar",
    embeddingText:
      "A beer bar is a drinking establishment specializing in a wide selection of craft beers, ales, lagers, and stouts on tap and in bottles",
    labelType: "category",
    associatedCategories: ["beer_bar"],
  },
  {
    label: "beer garden",
    embeddingText:
      "A beer garden is an outdoor drinking area where guests enjoy beer and food at communal tables, often with a casual, festive atmosphere",
    labelType: "category",
    associatedCategories: ["beer_garden"],
  },
  {
    label: "beer wine and spirits",
    embeddingText:
      "A beer, wine, and spirits shop is a retail store selling a broad selection of alcoholic beverages including beer, wine, and liquor for off-premise consumption",
    labelType: "category",
    associatedCategories: ["beer_wine_and_spirits"],
  },
  {
    label: "beverage store",
    embeddingText:
      "A beverage store is a retail shop selling a variety of drinks including sodas, juices, water, and sometimes beer, wine, or spirits",
    labelType: "category",
    associatedCategories: ["beverage_store"],
  },
  {
    label: "brewery",
    embeddingText:
      "A brewery is a facility that brews beer on-site, often with a taproom where visitors can sample and purchase fresh craft beers",
    labelType: "category",
    associatedCategories: ["brewery"],
  },
  {
    label: "cafe",
    embeddingText:
      "A cafe is a casual eatery serving coffee, tea, pastries, and light meals in a relaxed atmosphere suited for conversation or working",
    labelType: "category",
    associatedCategories: ["cafe"],
  },
  {
    label: "casino",
    embeddingText:
      "A casino is an entertainment venue with gambling facilities that typically also offers bars, restaurants, and cocktail service",
    labelType: "category",
    associatedCategories: ["casino"],
  },
  {
    label: "chinese restaurant",
    embeddingText:
      "A Chinese restaurant serves traditional and regional Chinese cuisine, often with options for dim sum, noodles, stir-fry, and Chinese tea",
    labelType: "category",
    associatedCategories: ["chinese_restaurant"],
  },
  {
    label: "cocktail bar",
    embeddingText:
      "A cocktail bar is a drinking establishment focused on expertly crafted mixed drinks, creative cocktails, and high-quality spirits in a sophisticated setting",
    labelType: "category",
    associatedCategories: ["cocktail_bar"],
  },
  {
    label: "coffee roastery",
    embeddingText:
      "A coffee roastery is a specialty establishment that roasts coffee beans on-site and typically offers single-origin coffees, pour-over methods, and espresso drinks",
    labelType: "category",
    associatedCategories: ["coffee_roastery"],
  },
  {
    label: "coffee shop",
    embeddingText:
      "A coffee shop is an establishment serving brewed coffee, espresso drinks, lattes, and tea along with pastries and light snacks",
    labelType: "category",
    associatedCategories: ["coffee_shop"],
  },
  {
    label: "distillery",
    embeddingText:
      "A distillery is a facility that produces spirits such as whiskey, gin, vodka, or rum, often with tastings and tours for visitors",
    labelType: "category",
    associatedCategories: ["distillery"],
  },
  {
    label: "french restaurant",
    embeddingText:
      "A French restaurant serves classic French cuisine with emphasis on wine pairings, refined cooking techniques, and elegant dining atmosphere",
    labelType: "category",
    associatedCategories: ["french_restaurant"],
  },
  {
    label: "gastropub",
    embeddingText:
      "A gastropub combines pub-style drinking with elevated, restaurant-quality food in a casual atmosphere, typically with a strong craft beer and cocktail selection",
    labelType: "category",
    associatedCategories: ["gastropub"],
  },
  {
    label: "grocery store",
    embeddingText:
      "A grocery store is a retail shop selling food, beverages, and household items, often including a selection of beer, wine, and spirits",
    labelType: "category",
    associatedCategories: ["grocery_store"],
  },
  {
    label: "hotel",
    embeddingText:
      "A hotel is a lodging establishment that often includes bars, restaurants, and lounges serving cocktails, wine, and other beverages to guests",
    labelType: "category",
    associatedCategories: ["hotel"],
  },
  {
    label: "italian restaurant",
    embeddingText:
      "An Italian restaurant serves Italian cuisine including pasta, pizza, and traditional dishes, typically with an Italian wine list and aperitivo options",
    labelType: "category",
    associatedCategories: ["italian_restaurant"],
  },
  {
    label: "japanese restaurant",
    embeddingText:
      "A Japanese restaurant serves Japanese cuisine including sushi, ramen, tempura, and izakaya-style dishes, often with sake, Japanese whiskey, and beer",
    labelType: "category",
    associatedCategories: ["japanese_restaurant"],
  },
  {
    label: "liquor store",
    embeddingText:
      "A liquor store is a retail shop primarily selling spirits, wine, beer, and other alcoholic beverages for off-premise consumption and home enjoyment",
    labelType: "category",
    associatedCategories: ["liquor_store"],
  },
  {
    label: "lounge",
    embeddingText:
      "A lounge is an upscale drinking venue with comfortable seating, ambient lighting, and a cocktail-focused menu in a relaxed, sophisticated atmosphere",
    labelType: "category",
    associatedCategories: ["lounge"],
  },
  {
    label: "mexican restaurant",
    embeddingText:
      "A Mexican restaurant serves Mexican cuisine including tacos, enchiladas, and mole, often with a selection of tequila, mezcal, margaritas, and Mexican beer",
    labelType: "category",
    associatedCategories: ["mexican_restaurant"],
  },
  {
    label: "music venue",
    embeddingText:
      "A music venue is an entertainment space hosting live performances and concerts, typically with a bar serving beer, cocktails, and other drinks",
    labelType: "category",
    associatedCategories: ["music_venue"],
  },
  {
    label: "organic grocery store",
    embeddingText:
      "An organic grocery store specializes in natural, organic, and health-conscious food and beverages, often carrying organic wines and craft beers",
    labelType: "category",
    associatedCategories: ["organic_grocery_store"],
  },
  {
    label: "pub",
    embeddingText:
      "A pub is a traditional drinking establishment serving beer, cider, and pub food in a warm, communal atmosphere with a neighborhood feel",
    labelType: "category",
    associatedCategories: ["pub"],
  },
  {
    label: "resort",
    embeddingText:
      "A resort is a vacation destination with accommodations, dining, bars, and recreational facilities, often including wine tasting and cocktail bars",
    labelType: "category",
    associatedCategories: ["resort"],
  },
  {
    label: "restaurant",
    embeddingText:
      "A restaurant is a dining establishment serving prepared meals, often with a curated beverage program including wine, beer, and cocktails",
    labelType: "category",
    associatedCategories: ["restaurant"],
  },
  {
    label: "sake bar",
    embeddingText:
      "A sake bar specializes in serving Japanese rice wine (sake) in various styles — junmai, ginjo, daiginjo — along with Japanese small plates",
    labelType: "category",
    associatedCategories: ["sake_bar"],
  },
  {
    label: "specialty grocery store",
    embeddingText:
      "A specialty grocery store offers gourmet, artisanal, and hard-to-find food and beverage items, often including fine wines, craft spirits, and imported beers",
    labelType: "category",
    associatedCategories: ["specialty_grocery_store"],
  },
  {
    label: "sports bar",
    embeddingText:
      "A sports bar is a drinking establishment with televisions showing live sports, serving beer, wings, and bar food in a lively, casual atmosphere",
    labelType: "category",
    associatedCategories: ["sports_bar"],
  },
  {
    label: "steakhouse",
    embeddingText:
      "A steakhouse is an upscale restaurant specializing in grilled meats and steaks, typically with an extensive wine list featuring bold red wines and classic cocktails",
    labelType: "category",
    associatedCategories: ["steakhouse"],
  },
  {
    label: "supermarket",
    embeddingText:
      "A supermarket is a large retail store selling groceries, household items, and typically a selection of beer, wine, and sometimes spirits",
    labelType: "category",
    associatedCategories: ["supermarket"],
  },
  {
    label: "sushi restaurant",
    embeddingText:
      "A sushi restaurant specializes in fresh sushi, sashimi, and Japanese seafood dishes, often paired with sake, Japanese beer, and green tea",
    labelType: "category",
    associatedCategories: ["sushi_restaurant"],
  },
  {
    label: "tapas bar",
    embeddingText:
      "A tapas bar serves small Spanish-style sharing plates alongside Spanish wines, sherry, sangria, and cocktails in a social atmosphere",
    labelType: "category",
    associatedCategories: ["tapas_bar"],
  },
  {
    label: "thai restaurant",
    embeddingText:
      "A Thai restaurant serves Thai cuisine including curries, pad thai, and stir-fry dishes, often with Thai beer, cocktails, and tea options",
    labelType: "category",
    associatedCategories: ["thai_restaurant"],
  },
  {
    label: "whiskey bar",
    embeddingText:
      "A whiskey bar specializes in an extensive collection of whiskeys, bourbons, scotches, and rye, often offering flights and tastings in a refined setting",
    labelType: "category",
    associatedCategories: ["whiskey_bar"],
  },
  {
    label: "wine bar",
    embeddingText:
      "A wine bar is a dedicated establishment focused primarily on serving wine by the glass and bottle, with knowledgeable staff and curated wine lists",
    labelType: "category",
    associatedCategories: ["wine_bar"],
  },
  {
    label: "wine tasting room",
    embeddingText:
      "A wine tasting room is a venue where visitors sample and purchase wines, typically at or near a winery, with guided tastings and education",
    labelType: "category",
    associatedCategories: ["wine_tasting_room"],
  },
  {
    label: "wine wholesaler",
    embeddingText:
      "A wine wholesaler is a business that sells wine in bulk or by the case, often to restaurants and retailers, sometimes with a retail storefront",
    labelType: "category",
    associatedCategories: ["wine_wholesaler"],
  },
  {
    label: "winery",
    embeddingText:
      "A winery is an estate or facility that grows grapes and produces wine, often open to visitors for tours, tastings, and bottle purchases",
    labelType: "category",
    associatedCategories: ["winery"],
  },
];

// =============================================================================
// Item Type Label Definitions
// =============================================================================

/**
 * Item type labels — the 5 core item types tracked by the app.
 */
const ITEM_TYPE_LABELS: CategoryLabel[] = [
  {
    label: "wine",
    embeddingText:
      "Wine is a fermented grape beverage available in red, white, rose, and sparkling varieties, enjoyed at wineries, wine bars, restaurants, and purchased at wine shops",
    labelType: "item_type",
    associatedCategories: [
      "winery",
      "wine_bar",
      "wine_tasting_room",
      "wine_wholesaler",
      "beer_wine_and_spirits",
      "liquor_store",
    ],
    metadata: { itemType: "wine" },
  },
  {
    label: "beer",
    embeddingText:
      "Beer is a brewed alcoholic beverage made from grain, hops, and yeast, available in styles like IPA, stout, lager, and pilsner at breweries, pubs, and beer bars",
    labelType: "item_type",
    associatedCategories: [
      "brewery",
      "beer_bar",
      "beer_garden",
      "pub",
      "sports_bar",
      "beer_wine_and_spirits",
    ],
    metadata: { itemType: "beer" },
  },
  {
    label: "spirit",
    embeddingText:
      "Spirits are distilled alcoholic beverages including whiskey, gin, vodka, rum, tequila, and mezcal, served at cocktail bars, distilleries, and lounges",
    labelType: "item_type",
    associatedCategories: [
      "distillery",
      "cocktail_bar",
      "whiskey_bar",
      "bar",
      "lounge",
      "liquor_store",
      "beer_wine_and_spirits",
    ],
    metadata: { itemType: "spirit" },
  },
  {
    label: "coffee",
    embeddingText:
      "Coffee is a brewed beverage made from roasted coffee beans, available as espresso, pour-over, cold brew, and lattes at coffee shops, cafes, and roasteries",
    labelType: "item_type",
    associatedCategories: ["coffee_shop", "cafe", "coffee_roastery"],
    metadata: { itemType: "coffee" },
  },
  {
    label: "sake",
    embeddingText:
      "Sake is a Japanese rice wine available in styles like junmai, ginjo, and daiginjo, enjoyed at sake bars, Japanese restaurants, and sushi restaurants",
    labelType: "item_type",
    associatedCategories: [
      "sake_bar",
      "japanese_restaurant",
      "sushi_restaurant",
    ],
    metadata: { itemType: "sake" },
  },
];

// =============================================================================
// Alias Label Definitions
// =============================================================================

/**
 * Natural language aliases — alternative names and terms users search for.
 */
const ALIAS_LABELS: CategoryLabel[] = [
  // Wine aliases
  {
    label: "wine tasting",
    embeddingText:
      "Wine tasting is the experience of sampling and evaluating different wines, typically at a winery tasting room or wine bar with a sommelier or guide",
    labelType: "alias",
    associatedCategories: ["wine_tasting_room", "winery", "wine_bar"],
  },
  {
    label: "good wine selection",
    embeddingText:
      "A place with a good wine selection offers an extensive, well-curated wine list with diverse regions, varietals, and price points",
    labelType: "alias",
    associatedCategories: [
      "wine_bar",
      "steakhouse",
      "french_restaurant",
      "italian_restaurant",
    ],
  },
  {
    label: "natural wine",
    embeddingText:
      "Natural wine is minimally processed wine made with organic grapes and little to no additives, popular at trendy wine bars and gastropubs",
    labelType: "alias",
    associatedCategories: ["wine_bar", "wine_tasting_room", "gastropub"],
  },
  {
    label: "wine by the glass",
    embeddingText:
      "Wine by the glass means a venue offers individual pours from their wine list without requiring a full bottle purchase, common at wine bars and fine restaurants",
    labelType: "alias",
    associatedCategories: [
      "wine_bar",
      "restaurant",
      "french_restaurant",
      "italian_restaurant",
    ],
  },
  {
    label: "wine shop",
    embeddingText:
      "A wine shop is a retail store specializing in selling wine bottles for takeaway, with knowledgeable staff to help with selection",
    labelType: "alias",
    associatedCategories: [
      "wine_wholesaler",
      "liquor_store",
      "beer_wine_and_spirits",
    ],
  },
  {
    label: "vineyard",
    embeddingText:
      "A vineyard is a plantation of grapevines for winemaking, often open to visitors for tours, tastings, and enjoying the scenic grounds",
    labelType: "alias",
    associatedCategories: ["winery", "wine_tasting_room"],
  },
  {
    label: "sommelier",
    embeddingText:
      "A sommelier is a trained wine professional at upscale restaurants and wine bars who curates the wine list and guides diners on pairings",
    labelType: "alias",
    associatedCategories: [
      "wine_bar",
      "french_restaurant",
      "steakhouse",
      "italian_restaurant",
    ],
  },

  // Beer aliases
  {
    label: "craft beer",
    embeddingText:
      "Craft beer is artisanal, small-batch beer brewed with quality ingredients and creative recipes, found at independent breweries, beer bars, and taprooms",
    labelType: "alias",
    associatedCategories: ["brewery", "beer_bar", "beer_garden", "gastropub"],
  },
  {
    label: "craft brewery",
    embeddingText:
      "A craft brewery is a small, independent brewery producing limited-batch beers with distinctive flavors, usually with a taproom for on-site tasting",
    labelType: "alias",
    associatedCategories: ["brewery", "beer_bar"],
  },
  {
    label: "beer on tap",
    embeddingText:
      "Beer on tap means draft beer served fresh from kegs through taps, offering a rotating selection of local and craft beers at bars and breweries",
    labelType: "alias",
    associatedCategories: [
      "brewery",
      "beer_bar",
      "pub",
      "sports_bar",
      "gastropub",
    ],
  },
  {
    label: "microbrewery",
    embeddingText:
      "A microbrewery is a small-scale brewery producing limited quantities of specialty beer, often experimental or locally inspired, with a taproom",
    labelType: "alias",
    associatedCategories: ["brewery", "beer_bar"],
  },
  {
    label: "beer flight",
    embeddingText:
      "A beer flight is a tasting set of small pours of different beers, allowing you to sample multiple styles at a brewery or beer bar",
    labelType: "alias",
    associatedCategories: ["brewery", "beer_bar", "beer_garden"],
  },
  {
    label: "IPA",
    embeddingText:
      "IPA (India Pale Ale) is a hoppy, bitter beer style popular at craft breweries and beer bars, available in variations like hazy, double, and session IPA",
    labelType: "alias",
    associatedCategories: ["brewery", "beer_bar", "pub"],
  },
  {
    label: "taproom",
    embeddingText:
      "A taproom is the on-site bar at a brewery where visitors can drink freshly brewed beers straight from the source, often with brewery tours",
    labelType: "alias",
    associatedCategories: ["brewery", "beer_bar"],
  },

  // Spirit/cocktail aliases
  {
    label: "cocktails",
    embeddingText:
      "Cocktails are mixed alcoholic drinks combining spirits, mixers, and garnishes, crafted by bartenders at cocktail bars, lounges, and upscale bars",
    labelType: "alias",
    associatedCategories: ["cocktail_bar", "bar", "lounge"],
  },
  {
    label: "cocktail bar",
    embeddingText:
      "A cocktail bar is an establishment dedicated to the art of mixology, serving creative and classic cocktails with quality spirits and fresh ingredients",
    labelType: "alias",
    associatedCategories: ["cocktail_bar", "bar", "lounge"],
  },
  {
    label: "whiskey tasting",
    embeddingText:
      "Whiskey tasting is the experience of sampling different whiskeys, bourbons, and scotches, often guided at distilleries and whiskey bars",
    labelType: "alias",
    associatedCategories: ["whiskey_bar", "distillery"],
  },
  {
    label: "craft cocktails",
    embeddingText:
      "Craft cocktails are artfully prepared mixed drinks using premium spirits, house-made syrups, fresh ingredients, and creative flavor combinations",
    labelType: "alias",
    associatedCategories: ["cocktail_bar", "bar", "lounge", "gastropub"],
  },
  {
    label: "mixology",
    embeddingText:
      "Mixology is the art and science of crafting cocktails, practiced by skilled bartenders at cocktail bars and upscale lounges using innovative techniques",
    labelType: "alias",
    associatedCategories: ["cocktail_bar", "bar", "lounge"],
  },
  {
    label: "gin bar",
    embeddingText:
      "A gin bar specializes in gin-based cocktails and an extensive selection of gin varieties, including botanical and craft gins with unique tonic pairings",
    labelType: "alias",
    associatedCategories: ["bar", "cocktail_bar", "distillery"],
  },
  {
    label: "tequila bar",
    embeddingText:
      "A tequila bar features an extensive collection of tequilas and mezcals, often serving margaritas, palomas, and Mexican-inspired cocktails",
    labelType: "alias",
    associatedCategories: ["bar", "cocktail_bar", "mexican_restaurant"],
  },
  {
    label: "bourbon bar",
    embeddingText:
      "A bourbon bar specializes in American bourbon whiskey, offering flights, neat pours, and bourbon-based cocktails like old fashioneds and mint juleps",
    labelType: "alias",
    associatedCategories: ["whiskey_bar", "bar", "distillery"],
  },

  // Coffee aliases
  {
    label: "specialty coffee",
    embeddingText:
      "Specialty coffee is high-quality, single-origin or carefully blended coffee, expertly roasted and brewed at dedicated coffee shops and roasteries",
    labelType: "alias",
    associatedCategories: ["coffee_shop", "cafe", "coffee_roastery"],
  },
  {
    label: "espresso bar",
    embeddingText:
      "An espresso bar is a coffee counter focused on espresso-based drinks like cappuccinos, cortados, and flat whites, made with precision and quality beans",
    labelType: "alias",
    associatedCategories: ["coffee_shop", "cafe", "coffee_roastery"],
  },
  {
    label: "third wave coffee",
    embeddingText:
      "Third wave coffee treats coffee as an artisanal product with attention to sourcing, roasting, and brewing methods like pour-over and AeroPress",
    labelType: "alias",
    associatedCategories: ["coffee_shop", "coffee_roastery"],
  },
  {
    label: "coffee roaster",
    embeddingText:
      "A coffee roaster is a business that roasts raw green coffee beans into finished product, often with a retail cafe showcasing their roasts",
    labelType: "alias",
    associatedCategories: ["coffee_roastery", "coffee_shop"],
  },
  {
    label: "pour over coffee",
    embeddingText:
      "Pour over coffee is a manual brewing method where hot water is poured over ground coffee in a filter, producing a clean, nuanced cup at specialty cafes",
    labelType: "alias",
    associatedCategories: ["coffee_shop", "coffee_roastery", "cafe"],
  },
  {
    label: "cold brew",
    embeddingText:
      "Cold brew is coffee brewed by steeping grounds in cold water for extended hours, producing a smooth, less acidic concentrate popular at coffee shops",
    labelType: "alias",
    associatedCategories: ["coffee_shop", "cafe"],
  },
  {
    label: "latte",
    embeddingText:
      "A latte is an espresso-based coffee drink with steamed milk and a thin layer of foam, available in many flavored variations at cafes and coffee shops",
    labelType: "alias",
    associatedCategories: ["coffee_shop", "cafe"],
  },

  // Sake aliases
  {
    label: "sake tasting",
    embeddingText:
      "Sake tasting is the experience of sampling different Japanese rice wines, learning about brewing regions, rice polishing ratios, and flavor profiles",
    labelType: "alias",
    associatedCategories: ["sake_bar", "japanese_restaurant"],
  },
  {
    label: "izakaya",
    embeddingText:
      "An izakaya is an informal Japanese gastropub serving small plates, yakitori, and snacks alongside sake, shochu, beer, and Japanese highballs",
    labelType: "alias",
    associatedCategories: ["japanese_restaurant", "sake_bar", "bar"],
  },
  {
    label: "Japanese spirits",
    embeddingText:
      "Japanese spirits include sake, shochu, and Japanese whiskey, enjoyed at sake bars, Japanese restaurants, and whiskey bars with Japanese collections",
    labelType: "alias",
    associatedCategories: ["sake_bar", "japanese_restaurant", "whiskey_bar"],
  },

  // General venue aliases
  {
    label: "liquor store",
    embeddingText:
      "A liquor store is a retail shop selling beer, wine, spirits, and other alcoholic beverages for purchase and home consumption",
    labelType: "alias",
    associatedCategories: [
      "liquor_store",
      "beer_wine_and_spirits",
      "beverage_store",
    ],
  },
  {
    label: "bottle shop",
    embeddingText:
      "A bottle shop is a curated retail store selling craft beer, wine, and spirits by the bottle, often with knowledgeable staff and tasting events",
    labelType: "alias",
    associatedCategories: [
      "liquor_store",
      "beer_wine_and_spirits",
      "wine_wholesaler",
    ],
  },
  {
    label: "dive bar",
    embeddingText:
      "A dive bar is a no-frills, unpretentious neighborhood drinking spot with cheap drinks, a casual vibe, and a loyal local crowd",
    labelType: "alias",
    associatedCategories: ["bar", "pub"],
  },
  {
    label: "sports bar",
    embeddingText:
      "A sports bar is a bar with multiple TVs showing live games, serving beer, wings, nachos, and bar food in a lively game-day atmosphere",
    labelType: "alias",
    associatedCategories: ["sports_bar", "bar", "pub"],
  },
  {
    label: "gastropub",
    embeddingText:
      "A gastropub is an upscale pub combining quality craft drinks with elevated, chef-driven food in a casual but refined atmosphere",
    labelType: "alias",
    associatedCategories: ["gastropub", "pub", "restaurant"],
  },

  // Style/theme venue aliases (NEW)
  {
    label: "speakeasy",
    embeddingText:
      "A speakeasy is a hidden or secretive cocktail bar inspired by Prohibition-era drinking establishments, known for craft cocktails, dim lighting, and a mysterious entrance",
    labelType: "alias",
    associatedCategories: ["cocktail_bar", "bar", "lounge"],
  },
  {
    label: "tiki bar",
    embeddingText:
      "A tiki bar is a tropical-themed drinking establishment serving rum-based cocktails, mai tais, pina coladas, and exotic punches with elaborate garnishes",
    labelType: "alias",
    associatedCategories: ["cocktail_bar", "bar", "lounge"],
  },
  {
    label: "wine cave",
    embeddingText:
      "A wine cave or wine cellar is an underground or cave-like venue for storing and tasting wine, offering an intimate atmosphere for wine enthusiasts",
    labelType: "alias",
    associatedCategories: ["wine_tasting_room", "winery", "wine_bar"],
  },
  {
    label: "beer hall",
    embeddingText:
      "A beer hall is a large, communal drinking venue inspired by German Bierhallen, serving lagers, wheat beers, and pretzels at long shared tables",
    labelType: "alias",
    associatedCategories: ["beer_bar", "beer_garden", "brewery", "pub"],
  },
  {
    label: "tavern",
    embeddingText:
      "A tavern is a traditional neighborhood drinking establishment serving beer, spirits, and hearty pub food in a historic or old-fashioned atmosphere",
    labelType: "alias",
    associatedCategories: ["pub", "bar", "gastropub"],
  },
  {
    label: "wine lounge",
    embeddingText:
      "A wine lounge is a relaxed, upscale venue focused on wine service with comfortable seating, curated wine flights, and small bites",
    labelType: "alias",
    associatedCategories: ["wine_bar", "lounge", "wine_tasting_room"],
  },
  {
    label: "mezcal bar",
    embeddingText:
      "A mezcal bar specializes in mezcal and artisanal Mexican spirits, offering smoky cocktails, flights, and education about agave varieties and production",
    labelType: "alias",
    associatedCategories: [
      "bar",
      "cocktail_bar",
      "mexican_restaurant",
      "distillery",
    ],
  },
  {
    label: "rum bar",
    embeddingText:
      "A rum bar features an extensive collection of rums from the Caribbean and beyond, serving tropical cocktails, daiquiris, and rum punches",
    labelType: "alias",
    associatedCategories: ["bar", "cocktail_bar", "lounge"],
  },
  {
    label: "homebrew supply",
    embeddingText:
      "A homebrew supply shop sells equipment and ingredients for home brewing beer, wine, and cider, often staffed by experienced brewers",
    labelType: "alias",
    associatedCategories: [
      "beverage_store",
      "specialty_grocery_store",
      "brewery",
    ],
  },
];

// =============================================================================
// Descriptor Label Definitions
// =============================================================================

/**
 * Natural language descriptor phrases that capture how users actually search.
 * These are experiential, occasion-based, and atmosphere-based queries.
 */
const DESCRIPTOR_LABELS: CategoryLabel[] = [
  // Occasion-based descriptors
  {
    label: "date night spot",
    embeddingText:
      "A romantic date night spot with intimate atmosphere, dim lighting, great cocktails or wine, and a sophisticated vibe perfect for couples",
    labelType: "descriptor",
    associatedCategories: [
      "wine_bar",
      "cocktail_bar",
      "french_restaurant",
      "italian_restaurant",
      "lounge",
    ],
  },
  {
    label: "happy hour drinks",
    embeddingText:
      "Happy hour is the time when bars and restaurants offer discounted drinks and appetizers, typically in the late afternoon and early evening",
    labelType: "descriptor",
    associatedCategories: ["bar", "cocktail_bar", "pub", "gastropub", "lounge"],
  },
  {
    label: "brunch spot",
    embeddingText:
      "A brunch spot serves late-morning meals combining breakfast and lunch with drinks like mimosas, bloody marys, coffee, and fresh juice",
    labelType: "descriptor",
    associatedCategories: ["cafe", "restaurant", "gastropub", "coffee_shop"],
  },
  {
    label: "late night drinks",
    embeddingText:
      "A place for late night drinks that stays open past midnight, serving cocktails, beer, and bar snacks for the after-hours crowd",
    labelType: "descriptor",
    associatedCategories: [
      "bar",
      "cocktail_bar",
      "lounge",
      "pub",
      "music_venue",
    ],
  },
  {
    label: "business lunch",
    embeddingText:
      "A business lunch venue with professional atmosphere, good wine list, quiet conversation-friendly dining, and efficient service",
    labelType: "descriptor",
    associatedCategories: [
      "restaurant",
      "steakhouse",
      "french_restaurant",
      "italian_restaurant",
    ],
  },
  {
    label: "group dinner",
    embeddingText:
      "A place for group dinner that accommodates large parties, with shared plates, communal tables, or private dining rooms and group-friendly drinks",
    labelType: "descriptor",
    associatedCategories: [
      "restaurant",
      "italian_restaurant",
      "gastropub",
      "tapas_bar",
      "beer_garden",
    ],
  },
  {
    label: "celebration venue",
    embeddingText:
      "A celebration venue for birthdays, anniversaries, or special occasions, with champagne, cocktails, party atmosphere, and festive drinks",
    labelType: "descriptor",
    associatedCategories: [
      "cocktail_bar",
      "lounge",
      "wine_bar",
      "restaurant",
      "bar",
    ],
  },
  {
    label: "after work drinks",
    embeddingText:
      "A place for after-work drinks where professionals unwind with colleagues over beer, cocktails, and bar snacks in a relaxed setting",
    labelType: "descriptor",
    associatedCategories: ["bar", "pub", "cocktail_bar", "gastropub", "lounge"],
  },

  // Atmosphere-based descriptors
  {
    label: "cozy bar",
    embeddingText:
      "A cozy bar is a small, warm, and intimate drinking spot with dim lighting, comfortable seating, and a quiet atmosphere for conversation",
    labelType: "descriptor",
    associatedCategories: ["bar", "wine_bar", "pub", "lounge"],
  },
  {
    label: "rooftop bar",
    embeddingText:
      "A rooftop bar is an open-air drinking venue on top of a building with panoramic city views, serving cocktails and small plates",
    labelType: "descriptor",
    associatedCategories: ["bar", "cocktail_bar", "lounge", "hotel"],
  },
  {
    label: "neighborhood bar",
    embeddingText:
      "A neighborhood bar is a friendly local hangout where regulars gather for affordable drinks, good conversation, and a community feel",
    labelType: "descriptor",
    associatedCategories: ["bar", "pub", "gastropub"],
  },
  {
    label: "live music and drinks",
    embeddingText:
      "A venue with live music and drinks where you can enjoy performances from bands, DJs, or solo artists while sipping cocktails or beer",
    labelType: "descriptor",
    associatedCategories: ["music_venue", "bar", "pub", "lounge"],
  },
  {
    label: "outdoor drinking",
    embeddingText:
      "An outdoor drinking spot with a patio, terrace, beer garden, or courtyard where you can enjoy drinks in the fresh air and sunshine",
    labelType: "descriptor",
    associatedCategories: ["beer_garden", "winery", "brewery", "resort"],
  },
  {
    label: "quiet bar",
    embeddingText:
      "A quiet bar with a calm, low-key atmosphere, no loud music, ideal for intimate conversation over wine, cocktails, or whiskey",
    labelType: "descriptor",
    associatedCategories: ["wine_bar", "lounge", "whiskey_bar", "bar"],
  },
  {
    label: "lively bar",
    embeddingText:
      "A lively, energetic bar with a bustling crowd, upbeat music, and a fun party atmosphere for socializing and celebrating",
    labelType: "descriptor",
    associatedCategories: [
      "bar",
      "cocktail_bar",
      "sports_bar",
      "music_venue",
      "pub",
    ],
  },
  {
    label: "outdoor patio",
    embeddingText:
      "A venue with an outdoor patio or deck where guests can enjoy food and drinks al fresco, perfect for warm weather socializing",
    labelType: "descriptor",
    associatedCategories: [
      "restaurant",
      "bar",
      "gastropub",
      "beer_garden",
      "cafe",
    ],
  },

  // Food + drink pairing descriptors
  {
    label: "upscale dining with wine",
    embeddingText:
      "An upscale dining experience with an extensive wine list, sommelier service, and refined food pairings at a fine-dining restaurant",
    labelType: "descriptor",
    associatedCategories: [
      "steakhouse",
      "french_restaurant",
      "italian_restaurant",
      "wine_bar",
    ],
  },
  {
    label: "fine dining",
    embeddingText:
      "Fine dining is an upscale restaurant experience with multi-course menus, premium ingredients, elegant atmosphere, and exceptional wine and cocktail programs",
    labelType: "descriptor",
    associatedCategories: [
      "steakhouse",
      "french_restaurant",
      "italian_restaurant",
      "japanese_restaurant",
    ],
  },
  {
    label: "wine and cheese",
    embeddingText:
      "A wine and cheese experience pairing curated wines with artisanal cheeses, charcuterie, and accompaniments at wine bars and specialty shops",
    labelType: "descriptor",
    associatedCategories: [
      "wine_bar",
      "wine_tasting_room",
      "french_restaurant",
      "specialty_grocery_store",
    ],
  },
  {
    label: "brewery with food",
    embeddingText:
      "A brewery that also serves food, combining fresh craft beer with a kitchen offering pub fare, pizza, or elevated bar food",
    labelType: "descriptor",
    associatedCategories: ["brewery", "gastropub", "beer_bar", "beer_garden"],
  },
  {
    label: "Italian food and wine",
    embeddingText:
      "Italian food and wine at a restaurant serving pasta, pizza, and traditional Italian dishes paired with Italian reds, whites, and prosecco",
    labelType: "descriptor",
    associatedCategories: [
      "italian_restaurant",
      "wine_bar",
      "restaurant",
      "gastropub",
    ],
  },
  {
    label: "Mexican food and tequila",
    embeddingText:
      "Mexican food and tequila at a restaurant serving tacos, enchiladas, and guacamole paired with tequila, mezcal, and margaritas",
    labelType: "descriptor",
    associatedCategories: ["mexican_restaurant", "bar", "cocktail_bar"],
  },
  {
    label: "Japanese food and sake",
    embeddingText:
      "Japanese food and sake at a restaurant serving sushi, ramen, and izakaya dishes paired with premium sake, shochu, and Japanese whiskey",
    labelType: "descriptor",
    associatedCategories: [
      "japanese_restaurant",
      "sake_bar",
      "sushi_restaurant",
    ],
  },

  // Natural language search phrases
  {
    label: "place to get a nice glass of wine",
    embeddingText:
      "A place to get a nice glass of wine means a relaxing venue with a quality wine selection, good by-the-glass options, and a pleasant atmosphere",
    labelType: "descriptor",
    associatedCategories: [
      "wine_bar",
      "wine_tasting_room",
      "french_restaurant",
      "italian_restaurant",
      "steakhouse",
    ],
  },
  {
    label: "somewhere for craft beer",
    embeddingText:
      "Somewhere for craft beer means a place focused on artisanal, small-batch beers with rotating taps, knowledgeable staff, and a beer-lover atmosphere",
    labelType: "descriptor",
    associatedCategories: [
      "brewery",
      "beer_bar",
      "beer_garden",
      "pub",
      "gastropub",
    ],
  },
  {
    label: "good coffee nearby",
    embeddingText:
      "Good coffee nearby means a quality coffee shop or cafe serving well-brewed espresso, pour-over, or specialty coffee drinks close to your location",
    labelType: "descriptor",
    associatedCategories: ["coffee_shop", "cafe", "coffee_roastery"],
  },
  {
    label: "cocktail spot",
    embeddingText:
      "A cocktail spot is a bar or lounge known for well-made mixed drinks, creative cocktails, and a curated spirits selection",
    labelType: "descriptor",
    associatedCategories: ["cocktail_bar", "bar", "lounge"],
  },
  {
    label: "grab a drink",
    embeddingText:
      "Grab a drink means finding a nearby bar, pub, or casual venue for a quick beer, cocktail, or glass of wine in a relaxed setting",
    labelType: "descriptor",
    associatedCategories: ["bar", "pub", "cocktail_bar", "wine_bar", "lounge"],
  },
  {
    label: "nightcap",
    embeddingText:
      "A nightcap is a late-evening drink enjoyed at the end of the night at a quiet bar, hotel lounge, or wine bar before heading home",
    labelType: "descriptor",
    associatedCategories: ["bar", "lounge", "wine_bar", "whiskey_bar", "hotel"],
  },
  {
    label: "pregame drinks",
    embeddingText:
      "Pregame drinks means getting drinks before an event, game, or night out at a nearby bar, sports bar, or pub with a fun group atmosphere",
    labelType: "descriptor",
    associatedCategories: ["sports_bar", "bar", "pub", "beer_bar"],
  },

  // Shopping/retail descriptors
  {
    label: "buy wine",
    embeddingText:
      "Buy wine means purchasing wine bottles to take home from a wine shop, liquor store, or specialty retailer with a good wine selection",
    labelType: "descriptor",
    associatedCategories: [
      "wine_wholesaler",
      "liquor_store",
      "beer_wine_and_spirits",
      "specialty_grocery_store",
    ],
  },
  {
    label: "buy beer",
    embeddingText:
      "Buy beer means purchasing beer to take home from a liquor store, bottle shop, or grocery store with a good craft beer selection",
    labelType: "descriptor",
    associatedCategories: [
      "beer_wine_and_spirits",
      "liquor_store",
      "beverage_store",
      "grocery_store",
    ],
  },
  {
    label: "buy spirits",
    embeddingText:
      "Buy spirits means purchasing liquor, whiskey, vodka, gin, or other spirits from a liquor store or beverage retailer for home consumption",
    labelType: "descriptor",
    associatedCategories: [
      "liquor_store",
      "beer_wine_and_spirits",
      "beverage_store",
    ],
  },

  // Experience-based descriptors
  {
    label: "tasting room",
    embeddingText:
      "A tasting room is a dedicated space for sampling beverages before purchase — wine at wineries, beer at breweries, or spirits at distilleries",
    labelType: "descriptor",
    associatedCategories: [
      "wine_tasting_room",
      "winery",
      "distillery",
      "brewery",
    ],
  },
  {
    label: "wine and dine",
    embeddingText:
      "Wine and dine means a full dining experience with excellent food paired with a quality wine program at an upscale restaurant",
    labelType: "descriptor",
    associatedCategories: [
      "french_restaurant",
      "italian_restaurant",
      "steakhouse",
      "wine_bar",
      "restaurant",
    ],
  },
  {
    label: "dog friendly bar",
    embeddingText:
      "A dog-friendly bar or patio that welcomes pets, letting you bring your dog while enjoying drinks at an outdoor beer garden, bar, or cafe",
    labelType: "descriptor",
    associatedCategories: ["beer_garden", "bar", "pub", "brewery", "cafe"],
  },
  {
    label: "family friendly brewery",
    embeddingText:
      "A family-friendly brewery or restaurant that welcomes children with a kid-friendly menu, outdoor space, and a relaxed atmosphere for parents",
    labelType: "descriptor",
    associatedCategories: ["brewery", "beer_garden", "gastropub", "restaurant"],
  },
  {
    label: "work from cafe",
    embeddingText:
      "A cafe or coffee shop suitable for working remotely, with Wi-Fi, power outlets, good coffee, and a quiet atmosphere for laptop work",
    labelType: "descriptor",
    associatedCategories: ["coffee_shop", "cafe", "coffee_roastery"],
  },
];

// =============================================================================
// Export
// =============================================================================

/**
 * All labels combined, ready for embedding.
 */
export const ALL_CATEGORY_LABELS: CategoryLabel[] = [
  ...CATEGORY_LABELS,
  ...ITEM_TYPE_LABELS,
  ...ALIAS_LABELS,
  ...DESCRIPTOR_LABELS,
];
