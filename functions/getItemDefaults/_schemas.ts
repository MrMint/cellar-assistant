import type { JSONSchema7 } from "../_utils/ai-providers/types";
import {
  type AllEnumValues,
  getAllEnumValues,
  onEnumCacheRefresh,
} from "../_utils/shared-enums";

// Generate schemas at runtime with caching
let cachedSchemas: Record<string, JSONSchema7> | null = null;

// Clear schema cache when enum values refresh so schemas are rebuilt with fresh enums.
onEnumCacheRefresh(() => {
  if (cachedSchemas) {
    console.log("[_schemas] Clearing schema cache after enum refresh");
    cachedSchemas = null;
  }
});

/**
 * Generate JSON Schema for a specific table using shared enum values
 */
function generateJsonSchemaForTable(
  tableName: "beers" | "wines" | "spirits" | "coffees",
  enumValues: AllEnumValues,
): JSONSchema7 {
  const {
    beerStyles,
    countries,
    wineVarieties,
    wineStyles,
    spiritTypes,
    coffeeRoastLevels,
    coffeeProcesses,
    coffeeSpecies,
    coffeeCultivars,
  } = enumValues;

  // Helper function to add enum if values exist
  const enumOrUndefined = (values: string[]) =>
    values.length > 0 ? values : undefined;

  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  // Common brand fields shared across all item types
  const commonBrandFields: Record<string, JSONSchema7> = {
    brand_name: {
      type: "string",
      description:
        "Official name of the producer/brand (e.g., 'Stone Brewing', 'Château Margaux', 'Buffalo Trace'). This is the primary brand identity.",
    },
    brand_description: {
      type: "string",
      description:
        "Brief description of the brand - include history, specialties, reputation, and location. Write 2-3 informative sentences about what makes this producer notable.",
    },
    brand_region: {
      type: "string",
      description:
        "Region or city where the brand is headquartered or primarily operates (e.g., 'Escondido, California', 'Bordeaux', 'Frankfort, Kentucky')",
    },
    brand_country: {
      type: "string",
      enum: enumOrUndefined(countries),
      description:
        "Country where the brand is based (may differ from the item's country of origin)",
    },
    brand_website: {
      type: "string",
      description:
        "Brand website URL if visible on the label or packaging (e.g., 'www.stonebrewing.com')",
    },
    parent_brand_name: {
      type: "string",
      description:
        "Parent company or holding company name if the brand is owned by a larger entity (e.g., 'Diageo' for Johnnie Walker, 'Constellation Brands' for Corona)",
    },
  };

  // Only truly required fields — the AI must provide these for a valid result.
  // All other fields in `properties` are optional; the prompt and Gemini 3.x
  // models reliably attempt every property without needing the `required` hint.
  const requiredFields: Record<string, string[]> = {
    beers: ["name", "description"],
    wines: ["name", "description"],
    spirits: ["name", "type", "description"],
    coffees: ["name", "description"],
  };

  // Define all fields for each table with dynamic enum values
  const tableFields: Record<string, Record<string, JSONSchema7>> = {
    beers: {
      name: {
        type: "string",
        description:
          'Product name only, excluding brand/brewery name (e.g., "IPA" not "Stone IPA")',
      },
      ...commonBrandFields,
      style: {
        type: "string",
        enum: enumOrUndefined(beerStyles),
        description: "Beer style category",
      },
      vintage: {
        type: "string",
        pattern: "^(19|20)\\d{2}$",
        description: "Production year (YYYY format)",
      },
      description: {
        type: "string",
        description:
          "Write as an enthusiastic connoisseur who appreciates the craftsmanship and unique qualities of this product. Draw from both visible label information and your knowledge of what makes this product special, interesting, or noteworthy - whether it's the producer's reputation, the region's characteristics, unique production methods, or notable flavor profiles.",
      },
      alcohol_content_percentage: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description:
          "Alcohol content as decimal percentage between 0-100 (e.g. 13.5 for 13.5% ABV)",
      },
      international_bitterness_unit: {
        type: "integer",
        minimum: 0,
        maximum: 120,
        description:
          "International Bitterness Units (IBU) - typically ranges from 5-100+ for most beers, with higher numbers indicating more bitterness",
      },
      country: {
        type: "string",
        enum: enumOrUndefined(countries),
        description: "Country of origin",
      },
      barcode_code: {
        type: "string",
        pattern: "^[0-9]{8,14}$",
        description: "EAN or UPC barcode if visible",
      },
      brewery: {
        type: "string",
        description:
          "Name of the brewery, brewpub, or brewing company that produced this beer",
      },
    },
    wines: {
      name: {
        type: "string",
        description:
          'Product name only, excluding winery/producer name (e.g., "Cabernet Sauvignon" not "Kendall-Jackson Cabernet Sauvignon")',
      },
      ...commonBrandFields,
      vintage: {
        type: "string",
        pattern: "^(19|20)\\d{2}$",
        description: "Vintage year (YYYY format)",
      },
      variety: {
        type: "string",
        enum: enumOrUndefined(wineVarieties),
        description:
          "Primary grape variety or blend (e.g., Cabernet Sauvignon, Chardonnay, Pinot Noir)",
      },
      style: {
        type: "string",
        enum: enumOrUndefined(wineStyles),
        description:
          "Wine style classification (e.g., Red, White, Rosé, Sparkling, Dessert, Fortified)",
      },
      region: {
        type: "string",
        description:
          "Specific wine region, appellation, or geographic designation (e.g., Napa Valley, Bordeaux, Tuscany)",
      },
      country: {
        type: "string",
        enum: enumOrUndefined(countries),
        description: "Country where the wine was produced",
      },
      alcohol_content_percentage: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description:
          "Alcohol content as decimal percentage between 0-100 (e.g. 13.5 for 13.5% ABV)",
      },
      description: {
        type: "string",
        description:
          "Write as an enthusiastic connoisseur who appreciates the craftsmanship and unique qualities of this product. Draw from both visible label information and your knowledge of what makes this product special, interesting, or noteworthy - whether it's the producer's reputation, the region's characteristics, unique production methods, or notable flavor profiles.",
      },
      barcode_code: {
        type: "string",
        pattern: "^[0-9]{8,14}$",
        description: "EAN or UPC barcode",
      },
      winery: {
        type: "string",
        description: "Name of the winery, estate, or wine producer",
      },
    },
    spirits: {
      name: {
        type: "string",
        description:
          'Product name only, excluding brand/distillery name (e.g., "Single Malt" not "Macallan Single Malt")',
      },
      ...commonBrandFields,
      type: {
        type: "string",
        enum: enumOrUndefined(spiritTypes),
        description:
          "Type of spirit (e.g., Whiskey, Rum, Vodka, Gin, Tequila, Brandy)",
      },
      style: {
        type: "string",
        description:
          "Specific style or subcategory within the spirit type (e.g., Añejo vs Blanco for tequila, Single Malt vs Blended for whiskey)",
      },
      vintage: {
        type: "string",
        pattern: "^(19|20)\\d{2}$",
        description:
          "Year of distillation or bottling (YYYY format) - not all spirits have meaningful vintage dates",
      },
      description: {
        type: "string",
        description:
          "Write as an enthusiastic connoisseur who appreciates the craftsmanship and unique qualities of this product. Draw from both visible label information and your knowledge of what makes this product special, interesting, or noteworthy - whether it's the producer's reputation, the region's characteristics, unique production methods, or notable flavor profiles.",
      },
      alcohol_content_percentage: {
        type: "number",
        minimum: 0,
        maximum: 100,
        description:
          "Alcohol content as decimal percentage between 0-100 (e.g. 13.5 for 13.5% ABV)",
      },
      country: {
        type: "string",
        enum: enumOrUndefined(countries),
        description: "Country where the spirit was distilled or produced",
      },
      barcode_code: {
        type: "string",
        pattern: "^[0-9]{8,14}$",
        description: "EAN or UPC barcode number if visible on the bottle",
      },
      distillery: {
        type: "string",
        description:
          "Name of the distillery or production facility where the spirit was made",
      },
    },
    coffees: {
      name: {
        type: "string",
        description:
          'Product name only, excluding brand/roaster name (e.g., "Ethiopian Single Origin" not "Blue Bottle Ethiopian Single Origin")',
      },
      ...commonBrandFields,
      description: {
        type: "string",
        description:
          "Write as an enthusiastic connoisseur who appreciates the craftsmanship and unique qualities of this product. Draw from both visible label information and your knowledge of what makes this product special, interesting, or noteworthy - whether it's the producer's reputation, the region's characteristics, unique production methods, or notable flavor profiles.",
      },
      roast_level: {
        type: "string",
        enum: enumOrUndefined(coffeeRoastLevels),
        description:
          "Coffee roast level (e.g., Light, Medium, Medium-Dark, Dark, French Roast)",
      },
      process: {
        type: "string",
        enum: enumOrUndefined(coffeeProcesses),
        description:
          "Processing method used to prepare the coffee beans (e.g., Washed, Natural, Honey, Semi-washed)",
      },
      species: {
        type: "string",
        enum: enumOrUndefined(coffeeSpecies),
        description: "Coffee plant species (e.g., Arabica, Robusta, Liberica)",
      },
      cultivar: {
        type: "string",
        enum: enumOrUndefined(coffeeCultivars),
        description:
          "Specific coffee variety or cultivar (e.g., Bourbon, Typica, Geisha, SL28)",
      },
      country: {
        type: "string",
        enum: enumOrUndefined(countries),
        description: "Country where the coffee was grown and produced",
      },
      barcode_code: {
        type: "string",
        pattern: "^[0-9]{8,14}$",
        description: "EAN or UPC barcode number if visible on packaging",
      },
      weight: {
        type: "integer",
        description: "Weight in grams",
        minimum: 1,
        maximum: 10000,
      },
      roaster: {
        type: "string",
        description:
          "Name of the coffee roastery or company that roasted the beans",
      },
    },
  };

  // Add properties for the specified table
  const fieldsForTable = tableFields[tableName] || {};
  Object.assign(properties, fieldsForTable);

  // Add required fields
  if (requiredFields[tableName]) {
    required.push(...requiredFields[tableName]);
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    title: `${tableName.charAt(0).toUpperCase() + tableName.slice(1)} Item Defaults`,
    properties,
    required,
    additionalProperties: false,
  };
}

export async function getItemSchemas(): Promise<Record<string, JSONSchema7>> {
  if (!cachedSchemas) {
    // Fetch enum values once from the shared cache, then build all schemas synchronously
    const enumValues = await getAllEnumValues();

    cachedSchemas = {
      WINE: generateJsonSchemaForTable("wines", enumValues),
      BEER: generateJsonSchemaForTable("beers", enumValues),
      SPIRIT: generateJsonSchemaForTable("spirits", enumValues),
      COFFEE: generateJsonSchemaForTable("coffees", enumValues),
    };
  }

  return cachedSchemas;
}

/**
 * Reset the schema cache (useful for testing or if schema changes)
 */
export function resetSchemaCache(): void {
  cachedSchemas = null;
}

/**
 * Get schema for a specific item type
 */
export async function getSchemaForItemType(
  itemType: string,
): Promise<JSONSchema7 | null> {
  const schemas = await getItemSchemas();
  return schemas[itemType] || null;
}
