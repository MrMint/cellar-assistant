import {
  type Beer_Defaults_Result,
  type Coffee_Defaults_Result,
  getCountryEnumQuery,
  getSpiritTypeEnumQuery,
  getWineStyleEnumQuery,
  getWineVarietyEnumQuery,
  graphql,
  type Spirit_Defaults_Result,
  type Wine_Defaults_Result,
} from "@cellar-assistant/shared";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { extract } from "fuzzball";
import { defaultTo, filter, isNotNil, nth, pipe } from "ramda";
import { functionQuery, getAdminAuthHeaders } from "../_utils";
import type { JSONSchema7 } from "../_utils/ai-providers/types";
import { hasProperty, isRecord } from "../_utils/types";

// Initialize AJV with format support
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Type for GraphQL enum query response
type EnumQueryResponse = {
  __type?: {
    enumValues?: Array<{ name: string }>;
  };
};

// Enhanced cache for enum values with error handling
interface EnumCacheEntry {
  data: EnumValues;
  timestamp: number;
  errors: number; // Track consecutive errors for circuit breaker
}

let enumCacheEntry: EnumCacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ERRORS = 3; // Circuit breaker threshold
const ERROR_BACKOFF_MULTIPLIER = 2;

// Enum value container for passing to functions
export interface EnumValues {
  beerStyles: string[];
  wineStyles: string[];
  wineVarieties: string[];
  spiritTypes: string[];
  countries: string[];
  coffeeCultivars: string[];
  coffeeProcesses: string[];
  coffeeSpecies: string[];
  coffeeRoastLevels: string[];
}

/**
 * Helper function to create EnumValues from individual arrays
 */
export function createEnumValues(
  beerStyles: string[],
  wineStyles: string[],
  wineVarieties: string[],
  spiritTypes: string[],
  countries: string[],
  coffeeRoastLevels: string[],
  coffeeProcesses: string[],
  coffeeSpecies: string[],
  coffeeCultivars: string[],
): EnumValues {
  return {
    beerStyles,
    wineStyles,
    wineVarieties,
    spiritTypes,
    countries,
    coffeeCultivars,
    coffeeProcesses,
    coffeeSpecies,
    coffeeRoastLevels,
  };
}

/**
 * Fetch all enum values with caching for performance
 */
export async function getAllEnumValues(): Promise<EnumValues> {
  const now = Date.now();

  // Return cached values if still valid
  if (enumCacheEntry && now - enumCacheEntry.timestamp < CACHE_TTL) {
    return enumCacheEntry.data;
  }

  // Circuit breaker: if too many consecutive errors, extend cache TTL
  if (enumCacheEntry && enumCacheEntry.errors >= MAX_CACHE_ERRORS) {
    const backoffTime =
      CACHE_TTL *
      ERROR_BACKOFF_MULTIPLIER ** (enumCacheEntry.errors - MAX_CACHE_ERRORS);
    if (now - enumCacheEntry.timestamp < backoffTime) {
      console.warn(
        `Enum cache in circuit breaker mode, using stale data. Errors: ${enumCacheEntry.errors}`,
      );
      return enumCacheEntry.data;
    }
  }

  try {
    // Batch all enum queries for better performance
    const [
      beerStylesResult,
      countriesResult,
      wineVarietiesResult,
      wineStylesResult,
      spiritTypesResult,
      coffeeRoastLevelsResult,
      coffeeProcessesResult,
      coffeeSpeciesResult,
      coffeeCultivarsResult,
    ] = await Promise.all([
      fetchEnumValues("beer_style_enum"),
      fetchEnumValues("country_enum"),
      fetchEnumValues("wine_variety_enum"),
      fetchEnumValues("wine_style_enum"),
      fetchEnumValues("spirit_type_enum"),
      fetchEnumValues("coffee_roast_level_enum"),
      fetchEnumValues("coffee_process_enum"),
      fetchEnumValues("coffee_species_enum"),
      fetchEnumValues("coffee_cultivar_enum"),
    ]);

    const newEnumData = createEnumValues(
      beerStylesResult,
      wineStylesResult,
      wineVarietiesResult,
      spiritTypesResult,
      countriesResult,
      coffeeRoastLevelsResult,
      coffeeProcessesResult,
      coffeeSpeciesResult,
      coffeeCultivarsResult,
    );

    // Success: reset error count and update cache
    enumCacheEntry = {
      data: newEnumData,
      timestamp: now,
      errors: 0,
    };

    console.log("Successfully refreshed enum cache");
    return newEnumData;
  } catch (error) {
    console.error("Failed to fetch enum values:", error);

    // Update error count
    if (enumCacheEntry) {
      enumCacheEntry.errors += 1;
      console.warn(
        `Enum fetch failed ${enumCacheEntry.errors} times, returning stale data`,
      );
      return enumCacheEntry.data;
    }

    // No cached data available, return empty values as fallback
    console.error(
      "No cached enum data available, returning empty fallback values",
    );
    return createEnumValues([], [], [], [], [], [], [], [], []);
  }
}

/**
 * Fetch enum values for a specific enum type
 */
async function fetchEnumValues(enumType: string): Promise<string[]> {
  try {
    // Use existing queries where available
    let query: any;
    switch (enumType) {
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
      default:
        query = graphql(`
          query Get${enumType.charAt(0).toUpperCase() + enumType.slice(1)}Enum {
            __type(name: "${enumType}") {
              enumValues {
                name
              }
            }
          }
        `);
    }

    const data = await functionQuery(
      query,
      {},
      { headers: getAdminAuthHeaders() },
    );
    const enumData = data as EnumQueryResponse | undefined;
    const enumValues = enumData?.__type?.enumValues;
    return enumValues ? enumValues.map((e: { name: string }) => e.name) : [];
  } catch (error) {
    console.warn(`Failed to fetch enum values for ${enumType}:`, error);
    return [];
  }
}

export type ItemType = "BEER" | "WINE" | "SPIRIT" | "COFFEE" | "SAKE";

// Common brand fields extracted by AI for all item types
export interface AIBrandFields {
  brand_name?: string;
  brand_description?: string;
  brand_region?: string;
  brand_country?: string;
  brand_website?: string;
  parent_brand_name?: string;
}

// Typed AI prediction data based on JSON schemas
export interface BeerAIDefaults extends AIBrandFields {
  name: string;
  style?: string;
  vintage?: string;
  description?: string;
  alcohol_content_percentage?: number;
  international_bitterness_unit?: number;
  country?: string;
  barcode_code?: string;
  brewery?: string;
}

export interface WineAIDefaults extends AIBrandFields {
  name: string;
  vintage?: string;
  variety?: string;
  style?: string;
  region?: string;
  country?: string;
  alcohol_content_percentage?: number;
  description?: string;
  barcode_code?: string;
  winery?: string;
  special_designation?: string;
  vineyard_designation?: string;
}

export interface SpiritAIDefaults extends AIBrandFields {
  name: string;
  type?: string;
  style?: string;
  vintage?: string;
  description?: string;
  alcohol_content_percentage?: number;
  country?: string;
  barcode_code?: string;
  distillery?: string;
}

export interface CoffeeAIDefaults extends AIBrandFields {
  name: string;
  description: string;
  roast_level?: string;
  process?: string;
  species?: string;
  cultivar?: string;
  country?: string;
  barcode_code?: string;
  weight?: number;
  roaster?: string;
}

export type AIDefaults =
  | BeerAIDefaults
  | WineAIDefaults
  | SpiritAIDefaults
  | CoffeeAIDefaults;

// Type guards for AJV validation results
export function isBeerAIDefaults(data: unknown): data is BeerAIDefaults {
  return typeof data === "object" && data !== null && "name" in data;
}

export function isWineAIDefaults(data: unknown): data is WineAIDefaults {
  return typeof data === "object" && data !== null && "name" in data;
}

export function isSpiritAIDefaults(data: unknown): data is SpiritAIDefaults {
  return typeof data === "object" && data !== null && "name" in data;
}

export function isCoffeeAIDefaults(data: unknown): data is CoffeeAIDefaults {
  return (
    typeof data === "object" &&
    data !== null &&
    "name" in data &&
    "description" in data
  );
}

// Fuzzy matching utilities for enum value matching
const MINIMUM_MATCH_SCORE = 70;

type ExtractionResult = [string, number, number][];
const getTopMatch = pipe(
  (input: ExtractionResult): ExtractionResult =>
    filter((x: [string, number, number]) => x[1] >= MINIMUM_MATCH_SCORE)(input),
  nth(0),
  defaultTo([]),
  nth(0),
);

function performEnumMatch(
  prediction: unknown,
  enumValues: string[],
): string | null {
  if (isNotNil(prediction) && typeof prediction === "string") {
    const match = getTopMatch(extract(prediction, enumValues)) as string | null;
    return match;
  }
  return null;
}

// AJV validator cache
const validatorCache = new Map<string, ValidateFunction<unknown>>();

/**
 * Sanitize AI response before validation
 * - Convert null values to undefined for optional string fields
 * - Pre-match enum values using fuzzy matching
 */
export function sanitizeAIResponse(
  data: unknown,
  itemType: ItemType,
  enumValues: EnumValues,
): unknown {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  const sanitized: Record<string, unknown> = {};
  const record = data as Record<string, unknown>;

  // Fields that are optional strings and should have null converted to undefined
  const optionalStringFields = [
    "vintage",
    "barcode_code",
    "region",
    "description",
    "style",
    "variety",
    "type",
    "process",
    "species",
    "cultivar",
    "roast_level",
    "distillery",
    "winery",
    "brewery",
    "roaster",
    "special_designation",
    "vineyard_designation",
    // Brand fields
    "brand_name",
    "brand_description",
    "brand_region",
    "brand_country",
    "brand_website",
    "parent_brand_name",
  ];

  // Get the appropriate enum list for country, style, and other enum fields
  const getEnumValues = (field: string): string[] => {
    switch (field) {
      case "country":
      case "brand_country":
        return enumValues.countries;
      case "style":
        return itemType === "BEER"
          ? enumValues.beerStyles
          : itemType === "WINE"
            ? enumValues.wineStyles
            : [];
      case "variety":
        return enumValues.wineVarieties;
      case "type":
        return enumValues.spiritTypes;
      case "roast_level":
        return enumValues.coffeeRoastLevels;
      case "process":
        return enumValues.coffeeProcesses;
      case "species":
        return enumValues.coffeeSpecies;
      case "cultivar":
        return enumValues.coffeeCultivars;
      default:
        return [];
    }
  };

  for (const [key, value] of Object.entries(record)) {
    // Handle null values for optional string fields
    if (value === null && optionalStringFields.includes(key)) {
      // Skip the field (don't include in sanitized) to let it be undefined
      continue;
    }

    // Pre-match enum values using fuzzy matching
    const enumList = getEnumValues(key);
    if (enumList.length > 0 && typeof value === "string" && value.length > 0) {
      const match = performEnumMatch(value, enumList);
      if (match) {
        sanitized[key] = match;
        continue;
      }
    }

    // Keep the value as-is
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Reset enum cache (useful for testing or when enum values change)
 */
export function resetEnumCache(): void {
  enumCacheEntry = null;
}

/**
 * Get enum cache statistics for monitoring
 */
export function getEnumCacheStats() {
  return {
    hasCache: !!enumCacheEntry,
    timestamp: enumCacheEntry?.timestamp || 0,
    errors: enumCacheEntry?.errors || 0,
    age: enumCacheEntry ? Date.now() - enumCacheEntry.timestamp : 0,
    isStale: enumCacheEntry
      ? Date.now() - enumCacheEntry.timestamp > CACHE_TTL
      : true,
    isInCircuitBreaker: enumCacheEntry
      ? enumCacheEntry.errors >= MAX_CACHE_ERRORS
      : false,
  };
}

/**
 * Create typed validators for each item type
 */
export function createItemValidators(schemas: {
  BEER: JSONSchema7;
  WINE: JSONSchema7;
  SPIRIT: JSONSchema7;
  COFFEE: JSONSchema7;
}) {
  return {
    validateBeer: createTypedValidator<BeerAIDefaults>(schemas.BEER, "BEER"),
    validateWine: createTypedValidator<WineAIDefaults>(schemas.WINE, "WINE"),
    validateSpirit: createTypedValidator<SpiritAIDefaults>(
      schemas.SPIRIT,
      "SPIRIT",
    ),
    validateCoffee: createTypedValidator<CoffeeAIDefaults>(
      schemas.COFFEE,
      "COFFEE",
    ),
  };
}

/**
 * Validate and narrow AI prediction data based on item type
 */
export function validateAndNarrowAIDefaults(
  data: unknown,
  itemType: ItemType,
  schema: JSONSchema7,
):
  | {
      valid: true;
      data: AIDefaults;
    }
  | {
      valid: false;
      errors: string[];
    } {
  const result = validateWithTypeNarrowing<AIDefaults>(data, schema, itemType);

  if (result.valid && result.data) {
    return { valid: true, data: result.data };
  }

  return { valid: false, errors: result.errors };
}

/**
 * Helper functions for building enhanced prompts
 */
function getClassificationGuidance(
  itemType: ItemType,
  enumValues?: EnumValues,
): string {
  switch (itemType) {
    case "WINE":
      return `## 🍷 WINE CLASSIFICATION GUIDANCE

**Style Categories:** ${enumValues?.wineStyles?.slice(0, 10).join(", ") || "RED, WHITE, ROSÉ, SPARKLING, DESSERT, FORTIFIED"}
**Variety Examples:** ${enumValues?.wineVarieties?.slice(0, 10).join(", ") || "CHARDONNAY, CABERNET_SAUVIGNON, PINOT_NOIR, MERLOT"}
**Country Codes:** ${enumValues?.countries?.slice(0, 8).join(", ") || "FRANCE, ITALY, USA, SPAIN, AUSTRALIA"}

**Professional Classification:**
- Identify grape varieties from label text or visual cues
- Determine style from color, bottle shape, and labeling
- Use regional knowledge for appellation/origin classification
- Apply vintage dating from visible year markings`;

    case "BEER":
      return `## 🍺 BEER CLASSIFICATION GUIDANCE

**Style Categories:** ${enumValues?.beerStyles?.slice(0, 10).join(", ") || "IPA, LAGER, STOUT, PILSNER, WHEAT, PORTER"}
**Country Origins:** ${enumValues?.countries?.slice(0, 8).join(", ") || "USA, GERMANY, BELGIUM, CZECH_REPUBLIC, UK"}

**Professional Classification:**
- Identify style from color, labeling, and brewery information
- Extract ABV% and IBU when visible
- Use brewery knowledge for style determination
- Consider package type (bottle, can) for context`;

    case "SPIRIT":
      return `## 🥃 SPIRIT CLASSIFICATION GUIDANCE

**Spirit Types:** ${enumValues?.spiritTypes?.slice(0, 10).join(", ") || "WHISKEY, VODKA, GIN, RUM, TEQUILA, BRANDY"}
**Country Origins:** ${enumValues?.countries?.slice(0, 8).join(", ") || "SCOTLAND, USA, FRANCE, MEXICO, JAMAICA"}

**Professional Classification:**
- Categorize by base spirit type and production method
- Identify age statements and proof/ABV
- Determine origin from distillery and labeling
- Classify style (single malt, bourbon, añejo, etc.)`;

    case "COFFEE":
      return `## ☕ COFFEE CLASSIFICATION GUIDANCE

**Roast Levels:** ${enumValues?.coffeeRoastLevels?.join(", ") || "LIGHT, MEDIUM, MEDIUM_DARK, DARK"}
**Species:** ${enumValues?.coffeeSpecies?.join(", ") || "ARABICA, ROBUSTA, LIBERICA"}
**Processes:** ${enumValues?.coffeeProcesses?.join(", ") || "WASHED, NATURAL, HONEY, PULPED_NATURAL"}
**Country Origins:** ${enumValues?.countries?.slice(0, 8).join(", ") || "ETHIOPIA, COLOMBIA, GUATEMALA, KENYA"}

**Professional Classification:**
- Identify roast level from bean color and packaging
- Extract origin farm/region information
- Determine processing method from labeling
- Note cultivar varieties when specified`;
  }
}

function getOutputExamples(itemType: ItemType): string {
  switch (itemType) {
    case "WINE":
      return `## 📝 WINE EXAMPLE OUTPUT

\`\`\`json
{
  "name": "Domaine de la Côte Pinot Noir",
  "vintage": "2019",
  "variety": "PINOT_NOIR", 
  "style": "RED",
  "region": "Sta. Rita Hills",
  "country": "USA",
  "alcohol_content_percentage": 13.5,
  "description": "Estate Pinot Noir from Sta. Rita Hills with notes of cherry, earth, and spice",
  "winery": "Domaine de la Côte"
}
\`\`\``;

    case "BEER":
      return `## 📝 BEER EXAMPLE OUTPUT

\`\`\`json
{
  "name": "Stone IPA",
  "style": "IPA",
  "country": "USA",
  "alcohol_content_percentage": 6.9,
  "international_bitterness_unit": 77,
  "description": "Bold West Coast IPA with citrus and pine hop character",
  "brewery": "Stone Brewing"
}
\`\`\``;

    case "SPIRIT":
      return `## 📝 SPIRIT EXAMPLE OUTPUT

\`\`\`json
{
  "name": "Macallan 18 Year Single Malt",
  "type": "WHISKEY",
  "style": "Single Malt Scotch",
  "vintage": "18",
  "country": "SCOTLAND",
  "alcohol_content_percentage": 43.0,
  "description": "Aged 18 years in sherry oak casks with rich dried fruit flavors",
  "distillery": "The Macallan"
}
\`\`\``;

    case "COFFEE":
      return `## 📝 COFFEE EXAMPLE OUTPUT

\`\`\`json
{
  "name": "Ethiopian Yirgacheffe",
  "roast_level": "MEDIUM",
  "process": "WASHED",
  "species": "ARABICA",
  "country": "ETHIOPIA",
  "description": "Bright floral coffee with citrus notes and tea-like body from Yirgacheffe region",
  "roaster": "Blue Bottle Coffee"
}
\`\`\``;
  }
}

/**
 * Build a comprehensive AI prompt for analyzing product images
 * @param itemType - The type of product being analyzed
 * @param schema - JSON schema defining the expected output structure
 * @param enumValues - Optional enum values for enhanced classification guidance
 * @returns Formatted prompt string for AI analysis
 */
export function buildItemAnalysisPrompt(
  itemType: ItemType,
  schema: JSONSchema7,
  enumValues?: EnumValues,
): string {
  const itemTypeDescriptions: Record<ItemType, string> = {
    WINE: "wine bottle",
    BEER: "beer bottle or can",
    SPIRIT: "spirit or liquor bottle",
    COFFEE: "coffee bag or package",
    SAKE: "sake bottle or container",
  };

  const sections = [
    // Header and expertise
    `You are a world-class expert at analyzing ${itemTypeDescriptions[itemType]} with deep knowledge of production, classification, and industry standards.

Extract comprehensive product information from the provided images with professional accuracy and completeness.`,

    // Core extraction methodology
    `## 🎯 CORE EXTRACTION METHODOLOGY

1. **Extract ALL visible information** from labels, text, and visual elements
2. **Use professional terminology** specific to ${itemType.toLowerCase()} industry
3. **Apply expert knowledge** of producers, regions, styles, and product characteristics
4. **Classify accurately** using established industry categories
5. **Provide realistic confidence** based on image clarity and data completeness`,

    // Classification guidance with enum values
    getClassificationGuidance(itemType, enumValues),

    // Quality standards
    `## 📊 QUALITY STANDARDS

**Completeness Requirements:**
- Extract all visible text, numbers, and identifiers
- Include producer/brand information when visible
- Provide detailed descriptions using professional terminology
- Use metric units when possible (alcohol %, weight, volume)

**Accuracy Standards:**
- Match enum values precisely when available
- Use established industry classifications
- Apply regional knowledge for origin/style determination
- Validate logical consistency (e.g., alcohol % ranges)`,

    // Output format and examples
    getOutputExamples(itemType),

    // Confidence scoring criteria
    `## 🎚️ CONFIDENCE SCORING (0.0-1.0)

**0.95-1.0:** Crystal clear labels, all key information visible, professional product
**0.85-0.94:** Most details clear, minor assumptions on style/classification  
**0.75-0.84:** Some details unclear, reasonable assumptions made
**0.65-0.74:** Significant assumptions, missing some key information
**Below 0.65:** High uncertainty, major elements unclear or illegible`,

    // Final instructions
    `## 🚀 FINAL INSTRUCTIONS

**CRITICAL: You MUST populate ALL fields in the schema below, not just required fields.**

Return valid JSON matching this exact schema:

${JSON.stringify(schema, null, 2)}

**MANDATORY FIELD REQUIREMENTS:**
- **name**: Product name only (exclude brand/producer name)
- **description**: Write 2-3 sentences as an enthusiastic connoisseur
- **vintage/year**: Extract any year visible on the label
- **country**: Use the country code that matches the product origin
- **style/type**: Classify using industry-standard categories
- **region**: Include any regional designation visible
- **alcohol_content_percentage**: Extract ABV if visible
- **producer field (winery/brewery/distillery/roaster)**: ONLY the name of the producer, NOT a description

**FIELD CONFUSION WARNING:**
- The "description" field should contain enthusiastic tasting notes and product information
- The producer field (winery/brewery/etc.) should contain ONLY the company/producer name (e.g., "Château Margaux", not a description)
- Do NOT put description text in the producer field

Focus on:
1. **FILL EVERY FIELD** - even if you need to make educated guesses based on label context
2. **Professional accuracy** - use industry-standard terminology
3. **Logical validation** - ensure all values make sense together
4. **Distinct field purposes** - each field has a specific purpose, don't mix them

Translate all text to English and return only the JSON response.`,
  ];

  return sections.join("\n\n");
}

/**
 * Calculate confidence score based on data completeness against schema
 * @param data - The extracted data from AI analysis
 * @param schema - The expected JSON schema
 * @returns Confidence score between 0 and 1
 */
export function calculateConfidence(
  data: AIDefaults,
  schema: JSONSchema7,
): number {
  const requiredFields = schema.required || [];
  const totalFields = Object.keys(schema.properties || {}).length;
  const dataKeys = isRecord(data) ? Object.keys(data) : [];
  const providedFields = dataKeys.filter((key) => {
    if (!isRecord(data) || !hasProperty(data, key)) return false;
    const value = data[key];
    return value !== null && value !== undefined && value !== "";
  }).length;

  const requiredFieldsProvided = requiredFields.filter((field: string) => {
    if (!isRecord(data) || !hasProperty(data, field)) return false;
    const value = data[field];
    return value !== null && value !== undefined && value !== "";
  }).length;

  const requiredScore =
    requiredFields.length > 0
      ? requiredFieldsProvided / requiredFields.length
      : 1;
  const completenessScore = totalFields > 0 ? providedFields / totalFields : 0;

  // Weight required fields more heavily
  return (
    Math.round((requiredScore * 0.7 + completenessScore * 0.3) * 100) / 100
  );
}

/**
 * Validate and narrow types using AJV with type narrowing
 * @param data - Data to validate
 * @param schema - JSON schema for validation
 * @param schemaKey - Cache key for the validator
 * @returns Validation result with type narrowing
 */
export function validateWithTypeNarrowing<T>(
  data: unknown,
  schema: JSONSchema7,
  schemaKey: string,
): {
  valid: boolean;
  data?: T;
  errors: string[];
} {
  // Get or create validator
  let validate = validatorCache.get(schemaKey);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schemaKey, validate);
  }

  const isValid = validate(data);

  if (!isValid) {
    const errors =
      validate.errors?.map((err) => {
        const instancePath =
          typeof err.instancePath === "string" ? err.instancePath : "";
        const message =
          typeof err.message === "string" ? err.message : "Validation error";
        return `${instancePath} ${message}`;
      }) || [];

    console.warn("Schema validation errors:", errors);
    return { valid: false, errors };
  }

  // Type assertion is safe here because AJV has validated the data
  return { valid: true, data: data as T, errors: [] };
}

/**
 * Create a typed validation function for a specific item type
 */
export function createTypedValidator<T>(
  schema: JSONSchema7,
  schemaKey: string,
): (
  data: unknown,
) => { valid: true; data: T } | { valid: false; errors: string[] } {
  return (data: unknown) => {
    const result = validateWithTypeNarrowing<T>(data, schema, schemaKey);
    if (result.valid && result.data) {
      return { valid: true, data: result.data };
    }
    return { valid: false, errors: result.errors };
  };
}

/**
 * Map validated AI defaults to return type with proper type narrowing
 */
export function mapValidatedDataToReturnType(
  itemType: ItemType,
  validatedData: AIDefaults,
  enumValues: EnumValues,
):
  | Beer_Defaults_Result
  | Wine_Defaults_Result
  | Spirit_Defaults_Result
  | Coffee_Defaults_Result {
  // Helper function to safely get country from different data types
  const getCountry = (data: AIDefaults): string | undefined => {
    if ("country" in data) {
      return data.country;
    }
    return undefined;
  };

  const country = performEnumMatch(
    getCountry(validatedData),
    enumValues.countries,
  );

  switch (itemType) {
    case "WINE": {
      if (!("vintage" in validatedData) && !("region" in validatedData)) {
        throw new Error("Invalid wine data structure");
      }
      const wineData = validatedData as WineAIDefaults;
      const style = performEnumMatch(wineData.style, enumValues.wineStyles);
      const variety = performEnumMatch(
        wineData.variety,
        enumValues.wineVarieties,
      );

      return {
        __typename: "wine_defaults_result",
        name: wineData.name,
        description: wineData.description,
        vintage: wineData.vintage,
        region: wineData.region,
        alcohol_content_percentage: wineData.alcohol_content_percentage,
        barcode_code: wineData.barcode_code,
        special_designation: wineData.special_designation,
        vineyard_designation: wineData.vineyard_designation,
        style,
        variety,
        country,
      } as Wine_Defaults_Result;
    }
    case "BEER": {
      if (!("international_bitterness_unit" in validatedData)) {
        throw new Error("Invalid beer data structure");
      }
      const beerData = validatedData as BeerAIDefaults;
      const style = performEnumMatch(beerData.style, enumValues.beerStyles);

      return {
        __typename: "beer_defaults_result",
        name: beerData.name,
        description: beerData.description,
        vintage: beerData.vintage,
        country,
        alcohol_content_percentage: beerData.alcohol_content_percentage,
        barcode_code: beerData.barcode_code,
        style,
        international_bitterness_unit: beerData.international_bitterness_unit,
      } as Beer_Defaults_Result;
    }
    case "SPIRIT": {
      if (!("distillery" in validatedData)) {
        throw new Error("Invalid spirit data structure");
      }
      const spiritData = validatedData as SpiritAIDefaults;
      const type = performEnumMatch(spiritData.type, enumValues.spiritTypes);

      return {
        __typename: "spirit_defaults_result",
        name: spiritData.name,
        description: spiritData.description,
        type,
        style: spiritData.style,
        vintage: spiritData.vintage,
        country,
        alcohol_content_percentage: spiritData.alcohol_content_percentage,
        barcode_code: spiritData.barcode_code,
        distillery: spiritData.distillery,
      } as Spirit_Defaults_Result;
    }
    case "COFFEE": {
      if (!("roast_level" in validatedData)) {
        throw new Error("Invalid coffee data structure");
      }
      const coffeeData = validatedData as CoffeeAIDefaults;
      const roast_level = performEnumMatch(
        coffeeData.roast_level,
        enumValues.coffeeRoastLevels,
      );
      const species = performEnumMatch(
        coffeeData.species,
        enumValues.coffeeSpecies,
      );
      const cultivar = performEnumMatch(
        coffeeData.cultivar,
        enumValues.coffeeCultivars,
      );
      const process = performEnumMatch(
        coffeeData.process,
        enumValues.coffeeProcesses,
      );

      return {
        __typename: "coffee_defaults_result",
        name: coffeeData.name,
        description: coffeeData.description,
        country,
        roast_level,
        species,
        cultivar,
        process,
        barcode_code: coffeeData.barcode_code,
      } as Coffee_Defaults_Result;
    }
    default:
      throw new Error(`Unknown item type: ${itemType}`);
  }
}
