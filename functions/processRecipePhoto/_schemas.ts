import { ITEM_TYPES, type ItemTypeValue } from "@cellar-assistant/shared";
import type { JSONSchema7 } from "json-schema";
import type { AllEnumValues } from "../_utils/shared-enums";

// Lowercase version of item types for schema enum (legacy format)
const ITEM_TYPES_LOWERCASE = ITEM_TYPES.map((t) =>
  t.toLowerCase(),
) as readonly string[];

/**
 * Enhanced ingredient interface that supports both database enums and custom values
 */
export interface EnhancedRecipeIngredient {
  name: string;

  // Brand/product separation for better matching
  brand_name?: string; // "Nikka", "Tanteo", "Giffard"
  product_name?: string; // "Coffey Malt Whisky", "Blanco"
  generic_name?: string; // "Japanese Whisky", "Blanco Tequila"

  // Standardized measurements (converted to metric)
  quantity?: number;
  unit?: string; // Standardized units (ml, g, etc.)
  original_quantity?: number; // Preserve original for reference
  original_unit?: string;

  is_optional: boolean;
  item_type: Lowercase<ItemTypeValue> | "ingredient";

  // Database enum fields (preferred values)
  spirit_type?: string; // From spirit_type_enum
  wine_style?: string; // From wine_style_enum
  wine_variety?: string; // From wine_variety_enum
  beer_style?: string; // From beer_style_enum
  coffee_roast_level?: string; // From coffee_roast_level_enum
  coffee_process?: string; // From coffee_process_enum
  coffee_species?: string; // From coffee_species_enum
  coffee_cultivar?: string; // From coffee_cultivar_enum

  // Fallback categorization for non-standard or missing enum values
  category?: string; // "Liqueur", "Bitters", "Garnish", etc.
  subcategory?: string; // "Fruit Liqueur", "Aromatic Bitters", etc.

  // Custom enum suggestions (when AI thinks we're missing enum values)
  suggested_spirit_type?: string;
  suggested_wine_style?: string;
  suggested_wine_variety?: string;
  suggested_beer_style?: string;
  suggested_coffee_roast_level?: string;

  // Additional metadata for matching and substitution
  country?: string; // From country_enum
  region?: string; // Specific region/appellation
  alcohol_content_percentage?: number;
  substitution_notes?: string; // "Any Japanese whisky works"
  flavor_profile?: string[]; // ["smoky", "citrus", "herbal"]

  // NEW: Direct classification fields from AI (Phase 2)
  should_be_specific: boolean; // Should this be a specific item or generic?
  database_item_type: Lowercase<ItemTypeValue> | "generic";
  matching_priority: "exact_brand" | "category_match" | "generic_fallback";
  creation_confidence: number; // AI confidence for creating this item (0.0-1.0)
  brand_importance: "critical" | "preferred" | "optional";
  substitution_flexibility: "none" | "similar_brand" | "any_category";

  // Legacy fields (keeping for backward compatibility)
  cellar_search_terms?: string[];
  substitution_category?: string; // For flexible matching
}

/**
 * Enhanced recipe structure with better instruction typing
 */
export interface EnhancedRecipeInstruction {
  step_number: number;
  instruction_text: string;
  instruction_type:
    | "PREPARE"
    | "MIX"
    | "SHAKE"
    | "STIR"
    | "STRAIN"
    | "FINISH"
    | "GARNISH"
    | "SERVE"
    | "BUILD"
    | "POUR"
    | "ADD";
  equipment_needed?: string;
  time_minutes?: number;
  temperature?: string; // "chilled", "room temperature", etc.
  technique_notes?: string; // "dry shake then wet shake", "double strain"
}

/**
 * Complete enhanced recipe structure
 */
export interface EnhancedExtractedRecipe {
  name: string;
  description?: string;
  type: "food" | "cocktail";
  difficulty_level: number; // 1-5 scale with calibrated examples
  prep_time_minutes?: number;
  serving_size?: number;

  // Enhanced instruction set
  instructions: EnhancedRecipeInstruction[];

  // Enhanced ingredient list
  ingredients: EnhancedRecipeIngredient[];

  // Confidence and analysis metadata
  confidence: number; // 0.0-1.0 with structured criteria
  extraction_method: string; // "ai_vision", "menu_parsing", etc.
  complexity_notes?: string; // Why this difficulty level

  // Optional contextual information
  cuisine_style?: string;
  origin_notes?: string;
  pairing_suggestions?: string[];

  // Enum gap detection
  missing_enum_suggestions?: {
    spirit_types?: string[];
    wine_styles?: string[];
    wine_varieties?: string[];
    beer_styles?: string[];
    coffee_roast_levels?: string[];
  };
}

/**
 * Generate flexible JSON schema that guides toward database enums but allows alternatives
 */
export function generateFlexibleRecipeSchema(
  enumValues: AllEnumValues,
): JSONSchema7 {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    title: "Enhanced Recipe Extraction",
    properties: {
      recipes: {
        type: "array",
        description: "Array of extracted recipes from the image",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Recipe name as shown in the menu/image",
            },
            description: {
              type: "string",
              description:
                "Brief description including flavor profile and style notes",
            },
            type: {
              type: "string",
              enum: ["food", "cocktail"],
              description: "Type of recipe",
            },
            difficulty_level: {
              type: "integer",
              minimum: 1,
              maximum: 5,
              description:
                "Difficulty: 1=Simple (spirit+mixer), 2=Basic cocktail, 3=Complex cocktail, 4=Advanced techniques, 5=Professional techniques",
            },
            prep_time_minutes: {
              type: "integer",
              description: "Estimated preparation time in minutes",
            },
            serving_size: {
              type: "integer",
              description: "Number of servings this recipe makes",
            },
            instructions: {
              type: "array",
              description: "Step-by-step preparation instructions",
              items: {
                type: "object",
                properties: {
                  step_number: { type: "integer" },
                  instruction_text: { type: "string" },
                  instruction_type: {
                    type: "string",
                    enum: [
                      "PREPARE",
                      "MIX",
                      "SHAKE",
                      "STIR",
                      "STRAIN",
                      "FINISH",
                      "GARNISH",
                      "SERVE",
                      "BUILD",
                      "POUR",
                      "ADD",
                    ],
                    description:
                      "Type of instruction step - use exact enum values from ai-pro-2.json model",
                  },
                  equipment_needed: { type: "string" },
                  time_minutes: { type: "integer" },
                  temperature: { type: "string" },
                  technique_notes: {
                    type: "string",
                    description:
                      "Special technique notes like 'dry shake then wet shake', 'double strain', 'smoke with apple wood'",
                  },
                },
                required: [
                  "step_number",
                  "instruction_text",
                  "instruction_type",
                ],
              },
            },
            ingredients: {
              type: "array",
              description: "List of ingredients with enhanced categorization",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Full ingredient name as it appears",
                  },
                  brand_name: {
                    type: "string",
                    description:
                      "Brand or producer name (e.g., 'Nikka', 'Tanteo', 'Giffard')",
                  },
                  product_name: {
                    type: "string",
                    description:
                      "Specific product name (e.g., 'Coffey Malt Whisky', 'Blanco')",
                  },
                  generic_name: {
                    type: "string",
                    description:
                      "Generic equivalent for substitution (e.g., 'Japanese Whisky', 'Blanco Tequila')",
                  },
                  quantity: { type: "number" },
                  unit: {
                    type: "string",
                    description:
                      "Measurement unit, prefer metric (ml, g) when possible",
                  },
                  original_quantity: { type: "number" },
                  original_unit: { type: "string" },
                  is_optional: { type: "boolean" },
                  item_type: {
                    type: "string",
                    enum: [...ITEM_TYPES_LOWERCASE, "ingredient"],
                    description:
                      "CRITICAL: wine=wine/champagne, beer=all beer styles, spirit=whiskey/gin/vodka/rum/tequila/liqueurs, coffee=coffee products, sake=Japanese rice wine, ingredient=everything else",
                  },

                  // Preferred database enum fields
                  spirit_type: {
                    type: "string",
                    description: `Preferred spirit type from database. Options include: ${enumValues.spiritTypes.length > 0 ? enumValues.spiritTypes.slice(0, 10).join(", ") + (enumValues.spiritTypes.length > 10 ? "..." : "") : "WHISKEY, GIN, VODKA, RUM, TEQUILA, etc."}`,
                  },
                  wine_style: {
                    type: "string",
                    description: `Preferred wine style from database. Options include: ${enumValues.wineStyles.length > 0 ? enumValues.wineStyles.slice(0, 10).join(", ") + (enumValues.wineStyles.length > 10 ? "..." : "") : "RED, WHITE, SPARKLING, SAKE, etc."}`,
                  },
                  wine_variety: {
                    type: "string",
                    description: `Preferred wine variety from database. Options include: ${enumValues.wineVarieties.length > 0 ? enumValues.wineVarieties.slice(0, 10).join(", ") + (enumValues.wineVarieties.length > 10 ? "..." : "") : "CABERNET_SAUVIGNON, CHARDONNAY, PINOT_NOIR, etc."}`,
                  },
                  beer_style: {
                    type: "string",
                    description: `Preferred beer style from database. Options include: ${enumValues.beerStyles.length > 0 ? enumValues.beerStyles.slice(0, 10).join(", ") + (enumValues.beerStyles.length > 10 ? "..." : "") : "IPA, LAGER, STOUT, etc."}`,
                  },
                  coffee_roast_level: {
                    type: "string",
                    description: `Coffee roast level from database. Options include: ${enumValues.coffeeRoastLevels.length > 0 ? enumValues.coffeeRoastLevels.join(", ") : "LIGHT, MEDIUM, DARK, etc."}`,
                  },

                  // Fallback categorization
                  category: {
                    type: "string",
                    description:
                      "General category if not covered by enum fields (e.g., 'Liqueur', 'Bitters', 'Garnish', 'Mixer')",
                  },
                  subcategory: {
                    type: "string",
                    description:
                      "Specific subcategory (e.g., 'Fruit Liqueur', 'Aromatic Bitters', 'Citrus')",
                  },

                  // Custom suggestions for enum gaps
                  suggested_spirit_type: {
                    type: "string",
                    description:
                      "If you think this spirit type is missing from our database, suggest it here",
                  },
                  suggested_wine_style: {
                    type: "string",
                    description:
                      "If you think this wine style is missing from our database, suggest it here",
                  },
                  suggested_wine_variety: {
                    type: "string",
                    description:
                      "If you think this wine variety is missing from our database, suggest it here",
                  },
                  suggested_beer_style: {
                    type: "string",
                    description:
                      "If you think this beer style is missing from our database, suggest it here",
                  },

                  // Additional metadata
                  country: {
                    type: "string",
                    description: `Country of origin. Prefer these values: ${enumValues.countries.length > 0 ? enumValues.countries.slice(0, 15).join(", ") + (enumValues.countries.length > 15 ? "..." : "") : "USA, France, Italy, Japan, etc."}`,
                  },
                  region: { type: "string" },
                  alcohol_content_percentage: {
                    type: "number",
                    minimum: 0,
                    maximum: 100,
                  },
                  substitution_notes: { type: "string" },
                  flavor_profile: {
                    type: "array",
                    items: { type: "string" },
                    description:
                      "Flavor descriptors like ['smoky', 'citrus', 'herbal', 'sweet', 'bitter']",
                  },

                  // NEW: Item classification fields for database matching
                  should_be_specific: {
                    type: "boolean",
                    description:
                      "REQUIRED: True if this should be a specific branded item, false for generic ingredients",
                  },
                  database_item_type: {
                    type: "string",
                    enum: [...ITEM_TYPES_LOWERCASE, "generic"],
                    description:
                      "REQUIRED: Target database table - wine/beer/spirit/coffee/sake for specific items, generic for everything else",
                  },
                  matching_priority: {
                    type: "string",
                    enum: ["exact_brand", "category_match", "generic_fallback"],
                    description:
                      "REQUIRED: How to prioritize matching - exact_brand for specific products, category_match for similar items, generic_fallback for basic ingredients",
                  },
                  creation_confidence: {
                    type: "number",
                    minimum: 0.5,
                    maximum: 1,
                    description:
                      "Confidence for creating this item: 0.9-1.0=very confident (clear brand+product), 0.8-0.89=confident (good recognition), 0.7-0.79=moderate (some uncertainty), 0.6-0.69=low confidence (unclear details), 0.5-0.59=very uncertain but extractable",
                  },
                  brand_importance: {
                    type: "string",
                    enum: ["critical", "preferred", "optional"],
                    description:
                      "REQUIRED: critical=brand essential to recipe, preferred=brand matters but substitutable, optional=any brand works",
                  },
                  substitution_flexibility: {
                    type: "string",
                    enum: ["none", "similar_brand", "any_category"],
                    description:
                      "REQUIRED: none=no substitutions, similar_brand=same style different brand, any_category=any item in category",
                  },
                },
                required: [
                  "name",
                  "is_optional",
                  "item_type",
                  "should_be_specific",
                  "database_item_type",
                  "matching_priority",
                  "creation_confidence",
                  "brand_importance",
                  "substitution_flexibility",
                ],
              },
            },
            confidence: {
              type: "number",
              minimum: 0.5,
              maximum: 1,
              description:
                "Recipe confidence score: 0.9-1.0=very clear, 0.8-0.89=mostly clear, 0.7-0.79=some unclear, 0.6-0.69=significant assumptions, 0.5-0.59=high uncertainty but extractable",
            },
            extraction_method: { type: "string" },
            complexity_notes: { type: "string" },
            cuisine_style: { type: "string" },
            origin_notes: { type: "string" },
            pairing_suggestions: {
              type: "array",
              items: { type: "string" },
            },
            missing_enum_suggestions: {
              type: "object",
              properties: {
                spirit_types: { type: "array", items: { type: "string" } },
                wine_styles: { type: "array", items: { type: "string" } },
                wine_varieties: { type: "array", items: { type: "string" } },
                beer_styles: { type: "array", items: { type: "string" } },
                coffee_roast_levels: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
          required: [
            "name",
            "type",
            "difficulty_level",
            "instructions",
            "ingredients",
            "confidence",
          ],
        },
      },
    },
    required: ["recipes"],
  };
}

/**
 * Controlled vocabularies for consistency while allowing flexibility
 */
export const CONTROLLED_VOCABULARIES = {
  instruction_types: [
    "PREPARE",
    "MIX",
    "SHAKE",
    "STIR",
    "STRAIN",
    "FINISH",
    "GARNISH",
    "SERVE",
    "BUILD",
    "POUR",
    "ADD",
  ],

  common_categories: [
    "Spirits",
    "Liqueurs",
    "Bitters & Tinctures",
    "Mixers",
    "Garnish",
    "Sweeteners",
    "Produce",
    "Dairy & Alternatives",
    "Spices & Seasonings",
  ],

  common_subcategories: [
    // Spirits
    "Whiskey",
    "Gin",
    "Vodka",
    "Rum",
    "Tequila",
    "Brandy",

    // Liqueurs
    "Fruit Liqueur",
    "Herbal Liqueur",
    "Coffee Liqueur",
    "Cream Liqueur",

    // Wine & Beer
    "Red Wine",
    "White Wine",
    "Sparkling Wine",
    "Sake",
    "IPA",
    "Lager",
    "Stout",

    // Other
    "Citrus",
    "Syrup",
    "Juice",
    "Soda",
    "Bitters",
    "Garnish",
    "Spice",
  ],

  standard_units: [
    "ml",
    "g",
    "oz",
    "dash",
    "splash",
    "pinch",
    "sprig",
    "wheel",
    "twist",
    "slice",
    "piece",
    "layer",
    "dollop",
  ],

  flavor_profiles: [
    "sweet",
    "bitter",
    "sour",
    "salty",
    "umami",
    "smoky",
    "citrus",
    "floral",
    "herbal",
    "spicy",
    "nutty",
    "fruity",
    "earthy",
    "creamy",
    "crisp",
    "rich",
    "light",
    "bold",
  ],
} as const;
