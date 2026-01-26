/**
 * Configuration for generating rich embedding text from GraphQL schema types
 * This makes the embedding generation more maintainable and schema-driven
 */

// Import introspection types to access enumValues
import type { introspection } from "@cellar-assistant/shared/gql/graphql-env.d.ts";

// Extract actual enum values from GraphQL introspection
type Beer_Style_Enum = introspection["types"]["beer_style_enum"]["enumValues"];
type Wine_Variety_Enum =
  introspection["types"]["wine_variety_enum"]["enumValues"];
type Wine_Style_Enum = introspection["types"]["wine_style_enum"]["enumValues"];
type Spirit_Type_Enum =
  introspection["types"]["spirit_type_enum"]["enumValues"];
type Coffee_Roast_Level_Enum =
  introspection["types"]["coffee_roast_level_enum"]["enumValues"];

// Core field configuration interfaces (simplified for current usage)
interface BaseFieldConfig<T extends string = string> {
  field: T;
  weight?: number;
  synonyms?: string[];
}

// Type-specific configurations that map to GraphQL schema
export const EMBEDDING_CONFIGS = {
  beers: {
    // Core identifying fields
    primaryFields: [
      { field: "name" as const, weight: 10, synonyms: ["beer", "brew"] },
      { field: "style" as const, weight: 8, synonyms: ["type"] },
      {
        field: "brewery" as const,
        weight: 7,
        synonyms: ["brewer", "producer"],
      },
    ],

    // Search-enhancing fields
    enhancingFields: [
      {
        field: "alcohol_content_percentage" as const,
        weight: 5,
        formatter: (abv: number) => [`${abv}% ABV`, `${abv} percent alcohol`],
        includeUnits: true,
      },
      { field: "country" as const, weight: 6 },
      { field: "description" as const, weight: 4 },
    ],

    // Type-safe style-specific keyword mappings using actual GraphQL enum values
    styleKeywords: {
      INDIA_PALE_ALE: ["IPA", "hoppy", "bitter", "citrus", "pine", "floral"],
      STOUT: [
        "dark beer",
        "roasted",
        "coffee notes",
        "chocolate",
        "imperial",
        "dry",
      ],
      PORTER: [
        "dark beer",
        "roasted",
        "chocolate",
        "coffee",
        "smooth",
        "baltic",
      ],
      PILSENER_PILSNER_PILS: [
        "pilsner",
        "crisp",
        "hoppy",
        "clean",
        "golden",
        "czech",
        "german",
      ],
      PALE_ALE: ["hoppy", "citrus", "amber", "american"],
      AMBER_ALE: ["malty", "caramel", "balanced", "amber ale"],
      BROWN_ALE: ["nutty", "caramel", "english", "american brown"],
      BARLEY_WINE: [
        "barleywine",
        "strong ale",
        "high alcohol",
        "aged",
        "complex",
      ],
      HEFEWEIZEN: ["wheat beer", "weizen", "cloudy", "banana", "clove"],
      WEISSBIER: ["wheat beer", "white beer", "bavarian"],
      WITBIER: ["belgian white", "wheat beer", "orange peel", "coriander"],
      SAISON: ["farmhouse ale", "spicy", "fruity", "dry"],
      LAMBIC: ["sour", "wild fermentation", "belgian", "tart"],
      GOSE: ["sour", "salt", "coriander", "german"],
      BERLINER_WEISSE: ["sour", "tart", "light", "german"],
      BOCK: ["strong lager", "malty", "german"],
      DOPPELBOCK: ["strong bock", "rich", "malty"],
      OKTOBERFESTBIER_MARZENDBIER: [
        "oktoberfest",
        "märzen",
        "amber lager",
        "german",
      ],
      // Additional beer styles to complete Record<> requirement
      ALTBIER: ["altbier", "german ale", "düsseldorf", "copper colored"],
      BIERE_DE_GARDE: [
        "biere de garde",
        "french farmhouse",
        "bottle conditioned",
      ],
      BITTER: ["bitter", "english bitter", "hoppy", "session beer"],
      BLONDE_ALE: ["blonde ale", "golden ale", "light colored", "refreshing"],
      CREAM_ALE: ["cream ale", "american lager", "light bodied", "smooth"],
      DORTMUNDER_EXPORT: ["dortmunder", "export lager", "german", "balanced"],
      DUNKEL: ["dunkel", "dark lager", "malty", "bavarian"],
      DUNKELWEIZEN: ["dunkelweizen", "dark wheat beer", "banana", "clove"],
      EISBOCK: ["eisbock", "ice beer", "concentrated", "strong"],
      FLANDERS_RED_ALE: ["flanders red", "sour ale", "belgian", "tart"],
      FRUIT_BEER: ["fruit beer", "flavored beer", "sweet", "seasonal"],
      GEUZE: ["geuze", "lambic blend", "belgian", "wild fermentation"],
      GOLDEN_SUMMER_ALE: ["golden ale", "summer beer", "light", "crisp"],
      HELLES: ["helles", "light lager", "german", "malty"],
      HERB_AND_SPICED_BEER: [
        "spiced beer",
        "herbal beer",
        "seasonal",
        "flavored",
      ],
      HONEY_BEER: ["honey beer", "mead beer", "sweet", "floral"],
      KOLSCH: ["kölsch", "cologne beer", "delicate", "german"],
      LIGHT_ALE: ["light ale", "session ale", "low alcohol", "refreshing"],
      MAIBOCK_HELLES_BOCK: ["maibock", "helles bock", "spring beer", "golden"],
      MALT_LIQUOR: ["malt liquor", "high alcohol", "american", "strong"],
      MILD: ["mild ale", "english mild", "low hop", "dark"],
      OLD_ALE: ["old ale", "english strong ale", "aged", "complex"],
      OUD_BRUIN: ["oud bruin", "flemish brown", "sour", "belgian"],
      RED_ALE: ["red ale", "amber colored", "malty", "caramel"],
      ROGGENBIER: ["roggenbier", "rye beer", "german", "spicy"],
      RYE_BEER: ["rye beer", "spicy grain", "german", "distinctive"],
      SCHWARZBIER: ["schwarzbier", "black lager", "german", "dark"],
      SCOTCH_ALE: ["scotch ale", "scottish ale", "malty", "strong"],
      SMOKED_BEER: ["smoked beer", "rauchbier", "smoky", "german"],
      STEAM_BEER: ["steam beer", "california common", "american", "unique"],
      VEGETABLE_BEER: [
        "vegetable beer",
        "pumpkin beer",
        "seasonal",
        "flavored",
      ],
      VIENNA_LAGER: ["vienna lager", "amber lager", "malty", "smooth"],
      WEIZENBOCK: ["weizenbock", "wheat bock", "strong wheat", "german"],
      WILD_BEER: ["wild beer", "brett beer", "funky", "farmhouse"],
      WOOD_AGED_BEER: ["wood aged", "barrel aged", "bourbon barrel", "complex"],
    } as const satisfies Record<Beer_Style_Enum, readonly string[]>,

    // Base category terms
    baseTerms: ["beer", "brew", "brewery", "alcohol"],
  },

  wines: {
    primaryFields: [
      { field: "name" as const, weight: 10, synonyms: ["wine", "vino"] },
      { field: "variety" as const, weight: 9, synonyms: ["grape", "varietal"] },
      { field: "style" as const, weight: 8 },
      { field: "producer" as const, weight: 7, synonyms: ["winery", "estate"] },
      {
        field: "vintage" as const,
        weight: 8,
        formatter: (year: number) => [`${year}`, `vintage ${year}`],
      },
    ],

    enhancingFields: [
      { field: "region" as const, weight: 7, synonyms: ["appellation"] },
      { field: "appellation" as const, weight: 6 },
      {
        field: "alcohol_content_percentage" as const,
        weight: 4,
        formatter: (abv: number) => [`${abv}% alcohol`, `${abv}% ABV`],
      },
      { field: "country" as const, weight: 6 },
      { field: "description" as const, weight: 5 },
    ],

    // Type-safe variety-specific keyword mappings using actual GraphQL enum values
    varietyKeywords: {
      CABERNET_SAUVIGNON: [
        "cab",
        "cabernet",
        "red wine",
        "full-bodied",
        "tannic",
        "bordeaux",
      ],
      CHARDONNAY: [
        "chard",
        "white wine",
        "buttery",
        "oaked",
        "burgundy",
        "crisp",
      ],
      PINOT_NOIR: [
        "pinot",
        "burgundy",
        "light red",
        "silky",
        "earthy",
        "oregon",
      ],
      SAUVIGNON_BLANC: [
        "sauv blanc",
        "crisp white",
        "grassy",
        "herbaceous",
        "loire",
      ],
      MERLOT: ["red wine", "smooth", "plum", "soft tannins", "bordeaux"],
      RIESLING: [
        "white wine",
        "sweet",
        "aromatic",
        "floral",
        "german",
        "alsace",
      ],
      SYRAH_SHIRAZ: [
        "syrah",
        "shiraz",
        "red wine",
        "spicy",
        "peppery",
        "rhone",
        "australian",
      ],
      GEWURZTRAMINER: ["gewürz", "spicy", "aromatic", "alsace", "lychee"],
      TEMPRANILLO: ["spanish", "rioja", "garnacha", "medium-bodied"],
      SANGIOVESE: ["chianti", "italian", "cherry", "tuscany"],
      NEBBIOLO: ["barolo", "barbaresco", "italian", "tannic", "powerful"],
      BARBERA: ["italian", "high acidity", "food friendly", "piedmont"],
      ZINFANDEL: ["zin", "american", "jammy", "spicy", "california"],
      MALBEC: ["argentinian", "dark", "plum", "mendoza"],
      CABERNET_FRANC: ["cab franc", "herbaceous", "loire", "bordeaux blend"],
      GRENACHE: ["rhone", "fruity", "spanish garnacha", "warm climate"],
      PINOT_GRIGIO_PINOT_GRIS: [
        "pinot grigio",
        "pinot gris",
        "light white",
        "crisp",
      ],
      CHENIN_BLANC: ["versatile", "south african", "loire valley", "honey"],
      VIOGNIER: ["rhone white", "floral", "stone fruit", "full-bodied"],
      BLEND: ["blend", "cuvée", "mixed varieties", "winemaker's art"],
      RED_BLEND: ["red blend", "mixed red varieties", "complex"],
      // Additional wine varieties to complete Record<> requirement
      AGLIANICO: ["aglianico", "italian red", "southern italy", "tannic"],
      ALBARINO_ALVARINHO: [
        "albariño",
        "alvarinho",
        "spanish white",
        "portuguese",
      ],
      ARNEIS: ["arneis", "italian white", "piedmont", "floral"],
      ASTI: ["asti", "sparkling wine", "sweet", "italian"],
      BLAUFRANKISCH: ["blaufränkisch", "austrian red", "spicy", "medium body"],
      CARIGNAN: ["carignan", "mediterranean red", "rustic", "tannic"],
      CARMENERE: ["carmenère", "chilean red", "herbaceous", "dark fruit"],
      CAVA: ["cava", "spanish sparkling", "traditional method", "bubbles"],
      CHAMPAGNE: ["champagne", "french sparkling", "luxury", "celebration"],
      CINSAULT: ["cinsault", "french red", "light colored", "blending grape"],
      CORVINA: ["corvina", "italian red", "veneto", "amarone"],
      CREMANT: [
        "crémant",
        "french sparkling",
        "traditional method",
        "regional",
      ],
      DOLCETTO: ["dolcetto", "italian red", "piedmont", "soft tannins"],
      FURMINT: ["furmint", "hungarian white", "tokaj", "sweet wine"],
      GAMAY: ["gamay", "beaujolais", "light red", "fresh fruit"],
      GARGANEGA: ["garganega", "italian white", "soave", "mineral"],
      GRUNER_VELTLINER: [
        "grüner veltliner",
        "austrian white",
        "peppery",
        "crisp",
      ],
      LAMBRUSCO: ["lambrusco", "italian sparkling", "red bubbles", "frizzante"],
      MALVASIA: ["malvasia", "aromatic white", "mediterranean", "sweet"],
      MARSANNE: ["marsanne", "rhône white", "full bodied", "honeyed"],
      MOURVEDRE_MONASTRELL: [
        "mourvèdre",
        "monastrell",
        "spanish red",
        "earthy",
      ],
      MULLER_THURGAU: ["müller-thurgau", "german white", "crossing", "floral"],
      MUSCADET: ["muscadet", "french white", "loire valley", "oyster wine"],
      PETITE_SIRAH: ["petite sirah", "american red", "intense", "dark color"],
      PETIT_VERDOT: ["petit verdot", "bordeaux red", "blending grape", "spicy"],
      PINOTAGE: ["pinotage", "south african red", "unique", "smoky"],
      PINOT_BLANC: ["pinot blanc", "white pinot", "alsace", "clean"],
      PRIMITIVO: ["primitivo", "italian red", "puglia", "zinfandel relative"],
      PROSECCO: ["prosecco", "italian sparkling", "glera grape", "aperitif"],
      RHONE_BLENDS: ["rhône blend", "gsm blend", "southern rhône", "complex"],
      ROUSSANNE: ["roussanne", "rhône white", "perfumed", "age worthy"],
      SEMILLON: ["sémillon", "bordeaux white", "waxy", "sauternes"],
      TORRONTES: ["torrontés", "argentinian white", "aromatic", "floral"],
      VERDEJO: ["verdejo", "spanish white", "rueda", "herbaceous"],
    } as const satisfies Record<Wine_Variety_Enum, readonly string[]>,

    styleKeywords: {
      RED: ["red wine", "rouge"],
      WHITE: ["white wine", "blanc"],
      ROSE: ["rosé", "rose", "pink wine"],
      SPARKLING: ["champagne", "prosecco", "cava", "bubbles", "fizz"],
      DESSERT: ["sweet wine", "port", "late harvest"],
    } as const satisfies Record<Wine_Style_Enum, readonly string[]>,

    baseTerms: ["wine", "vino", "vintage", "winery"],
  },

  spirits: {
    primaryFields: [
      { field: "name" as const, weight: 10, synonyms: ["spirit", "liquor"] },
      { field: "type" as const, weight: 9 },
      {
        field: "distillery" as const,
        weight: 7,
        synonyms: ["producer", "maker"],
      },
    ],

    enhancingFields: [
      {
        field: "alcohol_content_percentage" as const,
        weight: 6,
        formatter: (abv: number) => [
          `${abv}% ABV`,
          `${abv} percent`,
          `${Math.round(abv * 2)} proof`,
        ],
      },
      {
        field: "age" as const,
        weight: 6,
        formatter: (age: number) => [
          `${age} year`,
          `${age} years old`,
          `aged ${age}`,
        ],
      },
      { field: "country" as const, weight: 5 },
      { field: "description" as const, weight: 4 },
    ],

    // Type-safe type-specific keyword mappings using actual GraphQL enum values
    typeKeywords: {
      WHISKEY: ["whiskey", "whisky", "american whiskey", "rye", "canadian"],
      BOURBON: ["bourbon", "whiskey", "american whiskey", "kentucky", "corn"],
      SCOTCH: ["scotch", "whisky", "scottish whisky", "single malt", "blended"],
      VODKA: ["vodka", "neutral spirit", "potato", "grain", "russian"],
      GIN: ["gin", "juniper", "botanical", "london dry", "distilled"],
      RUM: ["rum", "molasses", "caribbean", "aged", "white", "dark", "spiced"],
      TEQUILA: ["tequila", "agave", "mexico", "blanco", "reposado", "añejo"],
      BRANDY_COGNAC: [
        "brandy",
        "cognac",
        "armagnac",
        "grape",
        "french",
        "aged",
      ],
      MEZCAL: ["mezcal", "agave", "smoky", "mexico", "artisanal"],
      BAIJIU: ["baijiu", "chinese spirit", "sorghum", "rice wine"],
      SOJU: ["soju", "korean spirit", "rice", "distilled"],
      LIQUEURS: ["liqueur", "sweet spirit", "flavored", "herbal", "fruit"],
      AMARO_APERITIF_VERMOUTH: [
        "amaro",
        "aperitif",
        "vermouth",
        "herbal",
        "bitter",
        "italian",
      ],
      MOONSHINE: ["moonshine", "unaged whiskey", "white whiskey", "corn"],
    } as const satisfies Record<Spirit_Type_Enum, readonly string[]>,

    baseTerms: ["spirit", "liquor", "alcohol", "distilled"],
  },

  coffees: {
    primaryFields: [
      { field: "name" as const, weight: 10, synonyms: ["coffee", "beans"] },
      { field: "roast_level" as const, weight: 8, synonyms: ["roast"] },
      {
        field: "roaster" as const,
        weight: 7,
        synonyms: ["producer", "company"],
      },
    ],

    enhancingFields: [
      {
        field: "process" as const,
        weight: 6,
        synonyms: ["processing", "method"],
      },
      {
        field: "weight" as const,
        weight: 3,
        formatter: (weight: number) => [`${weight}g`, `${weight} grams`],
      },
      { field: "country" as const, weight: 6, synonyms: ["origin"] },
      { field: "description" as const, weight: 5 },
    ],

    // Type-safe roast level keyword mappings using actual GraphQL enum values
    roastKeywords: {
      LIGHT: ["light roast", "bright", "acidic", "fruity", "floral"],
      LIGHT_MEDIUM: ["light medium roast", "balanced acidity", "sweet"],
      MEDIUM: ["medium roast", "balanced", "smooth", "nutty"],
      MEDIUM_DARK: ["medium dark roast", "full body", "caramelized"],
      DARK: ["dark roast", "bold", "smoky", "bitter", "chocolatey"],
      EXTRA_DARK: ["extra dark roast", "french roast", "intense", "oily"],
    } as const satisfies Record<Coffee_Roast_Level_Enum, readonly string[]>,

    baseTerms: ["coffee", "beans", "roast", "caffeine"],
  },
} as const;

// Description keyword patterns organized by relevance to item types
export const DESCRIPTION_KEYWORDS = {
  // Universal patterns (apply to all item types)
  universal: [
    {
      triggers: ["organic", "natural"],
      keywords: ["organic", "natural", "sustainable"],
    },
    {
      triggers: ["limited edition", "reserve", "special"],
      keywords: ["limited edition", "reserve", "special release", "rare"],
    },
  ],

  // Patterns specific to alcoholic beverages (beers, wines, spirits)
  alcoholic: [
    {
      triggers: ["barrel aged", "oak", "wood aged"],
      keywords: ["barrel aged", "oak aged", "wood aged", "cask aged"],
    },
    {
      triggers: ["small batch", "craft", "artisan"],
      keywords: ["small batch", "craft", "artisan", "handmade"],
    },
    {
      triggers: ["vintage", "aged"],
      keywords: ["vintage", "aged", "matured", "cellared"],
    },
  ],

  // Coffee-specific patterns
  coffee: [
    {
      triggers: ["single origin", "farm direct"],
      keywords: ["single origin", "farm direct", "estate grown"],
    },
    {
      triggers: ["fair trade", "direct trade"],
      keywords: ["fair trade", "direct trade", "ethical sourcing"],
    },
    {
      triggers: ["honey process", "washed", "natural process"],
      keywords: ["processing method", "fermentation"],
    },
  ],
} as const;

// Type-safe accessor for item types
export type ItemTypeKey = keyof typeof EMBEDDING_CONFIGS;
export type ItemTypeConfig = (typeof EMBEDDING_CONFIGS)[ItemTypeKey];
