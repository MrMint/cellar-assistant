import {
  getCountryEnumQuery,
  getSpiritTypeEnumQuery,
  getWineStyleEnumQuery,
  getWineVarietyEnumQuery,
  graphql,
} from "@cellar-assistant/shared";
import type { TadaDocumentNode } from "gql.tada";
import { functionQuery, getAdminAuthHeaders } from "../_utils";
import type { JSONSchema7 } from "../_utils/ai-providers/types";
import type { EnumQueryResponse } from "../_utils/types";

// Generate schemas at runtime with caching
let cachedSchemas: Record<string, JSONSchema7> | null = null;

async function getEnumValues(enumTypeName: string): Promise<string[]> {
  try {
    // Use TadaDocumentNode to properly type the dynamic query selection
    let query: TadaDocumentNode<EnumQueryResponse, Record<string, never>>;
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
      default:
        return [];
    }

    const data = await functionQuery(
      query,
      {},
      { headers: getAdminAuthHeaders() },
    );
    return data?.__type?.enumValues?.map((e: { name: string }) => e.name) || [];
  } catch (error) {
    console.warn(`Failed to fetch enum values for ${enumTypeName}:`, error);
    return [];
  }
}

/**
 * Generate JSON Schema for a specific table with dynamic enum values
 */
async function generateJsonSchemaFromIntrospection(
  tableName: "beers" | "wines" | "spirits" | "coffees",
): Promise<JSONSchema7> {
  // Fetch all enum values upfront
  const [
    beerStyles,
    countries,
    wineVarieties,
    wineStyles,
    spiritTypes,
    coffeeRoastLevels,
    coffeeProcesses,
    coffeeSpecies,
    coffeeCultivars,
  ] = await Promise.all([
    getEnumValues("beer_style_enum"),
    getEnumValues("country_enum"),
    getEnumValues("wine_variety_enum"),
    getEnumValues("wine_style_enum"),
    getEnumValues("spirit_type_enum"),
    getEnumValues("coffee_roast_level_enum"),
    getEnumValues("coffee_process_enum"),
    getEnumValues("coffee_species_enum"),
    getEnumValues("coffee_cultivar_enum"),
  ]);

  // Helper function to add enum if values exist
  const enumOrUndefined = (values: string[]) =>
    values.length > 0 ? values : undefined;

  const properties: Record<string, JSONSchema7> = {};
  const required: string[] = [];

  // Define which fields are required for each table
  // IMPORTANT: Vertex AI only populates fields in the 'required' array by default
  // Fields not listed here will be skipped by the model
  // All fields are marked nullable: true in schema conversion, so AI can return null if not visible
  const requiredFields: Record<string, string[]> = {
    beers: [
      "name",
      "style",
      "vintage",
      "description",
      "alcohol_content_percentage",
      "international_bitterness_unit",
      "country",
      "barcode_code",
      "brewery",
    ],
    wines: [
      "name",
      "vintage",
      "variety",
      "style",
      "region",
      "country",
      "alcohol_content_percentage",
      "description",
      "barcode_code",
      "winery",
    ],
    spirits: [
      "name",
      "type",
      "style",
      "vintage",
      "description",
      "alcohol_content_percentage",
      "country",
      "barcode_code",
      "distillery",
    ],
    coffees: [
      "name",
      "description",
      "roast_level",
      "process",
      "species",
      "cultivar",
      "country",
      "barcode_code",
      "weight",
      "roaster",
    ],
  };

  // Define all fields for each table with dynamic enum values
  const tableFields: Record<string, Record<string, JSONSchema7>> = {
    beers: {
      name: {
        type: "string",
        description:
          'Product name only, excluding brand/brewery name (e.g., "IPA" not "Stone IPA")',
      },
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

/**
 * Generate all item schemas with dynamic enum values
 */
async function generateAllItemSchemasFromIntrospection(): Promise<
  Record<string, JSONSchema7>
> {
  const [wine, beer, spirit, coffee] = await Promise.all([
    generateJsonSchemaFromIntrospection("wines"),
    generateJsonSchemaFromIntrospection("beers"),
    generateJsonSchemaFromIntrospection("spirits"),
    generateJsonSchemaFromIntrospection("coffees"),
  ]);

  return {
    WINE: wine,
    BEER: beer,
    SPIRIT: spirit,
    COFFEE: coffee,
  };
}

export async function getItemSchemas(): Promise<Record<string, JSONSchema7>> {
  if (!cachedSchemas) {
    cachedSchemas = await generateAllItemSchemasFromIntrospection();

    // Apply any runtime overrides or extensions
    cachedSchemas = applySchemaOverrides(cachedSchemas);
  }

  return cachedSchemas;
}

/**
 * Apply any custom overrides to generated schemas
 */
function applySchemaOverrides(
  schemas: Record<string, JSONSchema7>,
): Record<string, JSONSchema7> {
  // Apply any runtime overrides that can't be handled in the schema generation
  // Currently no overrides needed since descriptions are handled directly in schema generation
  return schemas;
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
