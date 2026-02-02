import {
  getCountryEnumQuery,
  getSakeCategoryEnumQuery,
  getSakeRiceVarietyEnumQuery,
  getSakeServingTemperatureEnumQuery,
  getSakeTypeEnumQuery,
  getSpiritTypeEnumQuery,
  getWineStyleEnumQuery,
  getWineVarietyEnumQuery,
  graphql,
} from "@cellar-assistant/shared";
import type { EnumQueryResponse } from "./types";
import { functionQuery, getAdminAuthHeaders } from "./urql-client";

/**
 * Brand types as defined by the database constraint
 */
export const BRAND_TYPES = {
  BREWERY: "brewery",
  DISTILLERY: "distillery",
  WINERY: "winery",
  ROASTERY: "roastery",
  KURA: "kura", // Japanese sake brewery
  RESTAURANT_CHAIN: "restaurant_chain",
  MANUFACTURER: "manufacturer",
  OTHER: "other",
} as const;

export type BrandType = (typeof BRAND_TYPES)[keyof typeof BRAND_TYPES];

/**
 * Comprehensive enum values for both item defaults and recipe extraction
 */
export interface AllEnumValues {
  // Core item categorization
  spiritTypes: string[];
  wineStyles: string[];
  wineVarieties: string[];
  beerStyles: string[];
  countries: string[];

  // Coffee specific
  coffeeRoastLevels: string[];
  coffeeProcesses: string[];
  coffeeSpecies: string[];
  coffeeCultivars: string[];

  // Sake specific
  sakeCategories: string[];
  sakeTypes: string[];
  sakeServingTemperatures: string[];
  sakeRiceVarieties: string[];
}

/**
 * Cache for enum values to avoid repeated database queries
 */
let enumCache: AllEnumValues | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch enum values dynamically from GraphQL with fallback handling
 */
async function getEnumValues(enumTypeName: string): Promise<string[]> {
  try {
    let query: any;
    switch (enumTypeName) {
      case "country_enum":
        query = getCountryEnumQuery;
        break;
      case "wine_style_enum":
        query = getWineStyleEnumQuery;
        break;
      case "wine_variety_enum":
        query = getWineVarietyEnumQuery;
        break;
      case "spirit_type_enum":
        query = getSpiritTypeEnumQuery;
        break;
      case "beer_style_enum":
        query = graphql(`
          query GetBeerStyleEnum {
            __type(name: "beer_style_enum") {
              enumValues {
                name
              }
            }
          }
        `);
        break;
      case "coffee_roast_level_enum":
        query = graphql(`
          query GetCoffeeRoastLevelEnum {
            __type(name: "coffee_roast_level_enum") {
              enumValues {
                name
              }
            }
          }
        `);
        break;
      case "coffee_process_enum":
        query = graphql(`
          query GetCoffeeProcessEnum {
            __type(name: "coffee_process_enum") {
              enumValues {
                name
              }
            }
          }
        `);
        break;
      case "coffee_species_enum":
        query = graphql(`
          query GetCoffeeSpeciesEnum {
            __type(name: "coffee_species_enum") {
              enumValues {
                name
              }
            }
          }
        `);
        break;
      case "coffee_cultivar_enum":
        query = graphql(`
          query GetCoffeeCultivarEnum {
            __type(name: "coffee_cultivar_enum") {
              enumValues {
                name
              }
            }
          }
        `);
        break;
      case "sake_category_enum":
        query = getSakeCategoryEnumQuery;
        break;
      case "sake_type_enum":
        query = getSakeTypeEnumQuery;
        break;
      case "sake_serving_temperature_enum":
        query = getSakeServingTemperatureEnumQuery;
        break;
      case "sake_rice_variety_enum":
        query = getSakeRiceVarietyEnumQuery;
        break;
      default:
        console.warn(`Unknown enum type: ${enumTypeName}`);
        return [];
    }

    const data = await functionQuery(
      query,
      {},
      { headers: getAdminAuthHeaders() },
    );
    const enumData = data as EnumQueryResponse | undefined;
    const values = enumData?.__type?.enumValues?.map((e) => e.name) || [];

    if (values.length === 0) {
      console.warn(`No enum values found for ${enumTypeName}`);
    }

    return values;
  } catch (error) {
    console.warn(`Failed to fetch enum values for ${enumTypeName}:`, error);
    return [];
  }
}

/**
 * Fetch all enum values needed for recipe extraction and item defaults
 */
export async function getAllEnumValues(
  useCache: boolean = true,
): Promise<AllEnumValues> {
  // Check cache first
  const now = Date.now();
  if (useCache && enumCache && now - cacheTimestamp < CACHE_DURATION_MS) {
    return enumCache;
  }

  console.log("Fetching fresh enum values from database...");

  try {
    const [
      spiritTypes,
      wineStyles,
      wineVarieties,
      beerStyles,
      countries,
      coffeeRoastLevels,
      coffeeProcesses,
      coffeeSpecies,
      coffeeCultivars,
      sakeCategories,
      sakeTypes,
      sakeServingTemperatures,
      sakeRiceVarieties,
    ] = await Promise.all([
      getEnumValues("spirit_type_enum"),
      getEnumValues("wine_style_enum"),
      getEnumValues("wine_variety_enum"),
      getEnumValues("beer_style_enum"),
      getEnumValues("country_enum"),
      getEnumValues("coffee_roast_level_enum"),
      getEnumValues("coffee_process_enum"),
      getEnumValues("coffee_species_enum"),
      getEnumValues("coffee_cultivar_enum"),
      getEnumValues("sake_category_enum"),
      getEnumValues("sake_type_enum"),
      getEnumValues("sake_serving_temperature_enum"),
      getEnumValues("sake_rice_variety_enum"),
    ]);

    const allEnums: AllEnumValues = {
      spiritTypes,
      wineStyles,
      wineVarieties,
      beerStyles,
      countries,
      coffeeRoastLevels,
      coffeeProcesses,
      coffeeSpecies,
      coffeeCultivars,
      sakeCategories,
      sakeTypes,
      sakeServingTemperatures,
      sakeRiceVarieties,
    };

    // Cache the results
    enumCache = allEnums;
    cacheTimestamp = now;

    console.log("Successfully fetched enum values:", {
      spiritTypes: spiritTypes.length,
      wineStyles: wineStyles.length,
      wineVarieties: wineVarieties.length,
      beerStyles: beerStyles.length,
      countries: countries.length,
      coffeeRoastLevels: coffeeRoastLevels.length,
      coffeeProcesses: coffeeProcesses.length,
      coffeeSpecies: coffeeSpecies.length,
      coffeeCultivars: coffeeCultivars.length,
      sakeCategories: sakeCategories.length,
      sakeTypes: sakeTypes.length,
      sakeServingTemperatures: sakeServingTemperatures.length,
      sakeRiceVarieties: sakeRiceVarieties.length,
    });

    return allEnums;
  } catch (error) {
    console.error(
      "Failed to fetch enum values, returning empty arrays:",
      error,
    );

    // Return empty arrays as fallback
    const fallbackEnums: AllEnumValues = {
      spiritTypes: [],
      wineStyles: [],
      wineVarieties: [],
      beerStyles: [],
      countries: [],
      coffeeRoastLevels: [],
      coffeeProcesses: [],
      coffeeSpecies: [],
      coffeeCultivars: [],
      sakeCategories: [],
      sakeTypes: [],
      sakeServingTemperatures: [],
      sakeRiceVarieties: [],
    };

    return fallbackEnums;
  }
}

/**
 * Reset the enum cache (useful for testing or forcing refresh)
 */
export function resetEnumCache(): void {
  enumCache = null;
  cacheTimestamp = 0;
  console.log("Enum cache reset");
}

/**
 * Check if cached enums are still valid
 */
export function isEnumCacheValid(): boolean {
  const now = Date.now();
  return enumCache !== null && now - cacheTimestamp < CACHE_DURATION_MS;
}

// Re-export unit conversion utilities from shared lib
// Note: We import directly here since this is a functions file that can't use src/ imports
import { convert } from "convert";

/**
 * Unit mappings for convert.js compatibility
 * Maps recipe units to convert.js unit names
 */
const UNIT_MAPPINGS = {
  // Volume units
  oz: "fl oz",
  "fl oz": "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  cup: "cup",
  cups: "cup",
  pint: "pint",
  pints: "pint",
  quart: "quart",
  quarts: "quart",
  gallon: "gallon",
  gallons: "gallon",
  liter: "liter",
  liters: "liter",
  l: "liter",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tablespoon: "tablespoon",
  tablespoons: "tablespoon",

  // Weight units
  lb: "lb",
  lbs: "lb",
  pound: "pound",
  pounds: "pound",
  kg: "kg",
  kilogram: "kilogram",
  kilograms: "kilogram",
  g: "g",
  gram: "gram",
  grams: "gram",
  mg: "mg",
  milligram: "milligram",
  milligrams: "milligram",
} as const;

/**
 * Custom conversions for units not supported by convert.js
 */
const CUSTOM_CONVERSIONS = {
  dash: { value: 0.6, unit: "ml" },
  dashes: { value: 0.6, unit: "ml" },
  splash: { value: 5, unit: "ml" },
  drop: { value: 0.05, unit: "ml" },
  drops: { value: 0.05, unit: "ml" },
} as const;

/**
 * Convert quantity and unit to metric standard using convert.js
 */
export function standardizeUnit(
  quantity: number,
  unit: string,
): { quantity: number; unit: string } {
  const normalizedUnit = unit.toLowerCase().trim();

  // Handle special cases that don't convert
  const nonConvertibleUnits = [
    "piece",
    "pieces",
    "pc",
    "pcs",
    "slice",
    "slices",
    "wheel",
    "wheels",
    "twist",
    "twists",
    "sprig",
    "sprigs",
    "leaf",
    "leaves",
    "layer",
    "layers",
    "garnish",
    "garnishes",
    "pinch",
    "pinches",
    "each",
    "whole",
    "dollop",
    "dollops",
    "sprinkle",
    "sprinkles",
    "dropper",
    "droppers",
  ];

  if (nonConvertibleUnits.includes(normalizedUnit)) {
    return { quantity, unit: normalizedUnit };
  }

  // Handle custom conversions first
  const customConversion =
    CUSTOM_CONVERSIONS[normalizedUnit as keyof typeof CUSTOM_CONVERSIONS];
  if (customConversion) {
    return {
      quantity: Math.round(quantity * customConversion.value * 100) / 100,
      unit: customConversion.unit,
    };
  }

  // Try convert.js for standard units
  const convertUnit =
    UNIT_MAPPINGS[normalizedUnit as keyof typeof UNIT_MAPPINGS];
  if (convertUnit) {
    try {
      // Determine target unit based on whether it's volume or mass
      const volumeUnits = [
        "fl oz",
        "cup",
        "pint",
        "quart",
        "gallon",
        "liter",
        "ml",
        "tsp",
        "tbsp",
        "tablespoon",
      ];
      const isVolume = volumeUnits.includes(convertUnit);
      const targetUnit = isVolume ? "ml" : "g";

      const convertedQuantity = convert(quantity, convertUnit).to(targetUnit);

      return {
        quantity: Math.round(convertedQuantity * 100) / 100, // Round to 2 decimal places
        unit: targetUnit,
      };
    } catch (error) {
      console.warn(
        `Failed to convert ${quantity} ${unit} using convert.js:`,
        error,
      );
    }
  }

  // Return original if no conversion found
  console.warn(`No conversion found for unit: ${unit}`);
  return { quantity, unit: normalizedUnit };
}
