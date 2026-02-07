/**
 * AI prompts and schemas for menu extraction.
 *
 * Single-pass vision extraction: the AI receives the menu image directly
 * and returns structured JSON, preserving visual context (layout, sections,
 * formatting) that would be lost in a two-step OCR-then-parse approach.
 */

import type { JSONSchema7 } from "../_utils/ai-providers/types";

/**
 * JSON Schema enforcing structured output from the vision extraction call.
 * Passed as the `schema` parameter to `generateContent()` so the AI provider
 * returns guaranteed-valid JSON matching this shape.
 */
export const MENU_EXTRACTION_SCHEMA: JSONSchema7 = {
  type: "array",
  maxItems: 50,
  items: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Item name exactly as it appears on the menu",
      },
      search_name: {
        type: "string",
        description:
          'Normalized, expanded name optimized for database search. Expand abbreviations (Ch. -> Chateau, Dom. -> Domaine, Cab -> Cabernet Sauvignon, IPA -> India Pale Ale). Include producer/brand if identifiable from context. Separate vintage year. Example: menu says "Ch. Margaux \'15" -> search_name "Chateau Margaux 2015"',
      },
      description: {
        type: "string",
        description: "Any description text from the menu for this item",
      },
      price: {
        type: "string",
        description:
          "Price as shown on the menu, including currency symbol if present",
      },
      category: {
        type: "string",
        description:
          "Menu section or category this item appears under (e.g., Red Wines, Draft Beer, Cocktails)",
      },
      itemType: {
        type: "string",
        enum: [
          "wine",
          "beer",
          "spirit",
          "coffee",
          "sake",
          "cocktail",
          "unknown",
        ],
        description: "Beverage type detected from the menu",
      },
      confidence: {
        type: "number",
        description:
          "Confidence 0.0-1.0 that this item is correctly extracted and categorized",
      },
      attributes: {
        type: "object",
        description: "Type-specific attributes extracted from the menu",
        properties: {
          // Wine attributes
          vintage: {
            type: "integer",
            description: "Vintage year as 4-digit integer",
          },
          variety: {
            type: "string",
            description:
              "Grape variety or rice variety (e.g., Pinot Noir, Chardonnay)",
          },
          region: {
            type: "string",
            description: "Production region or appellation (e.g., Napa Valley)",
          },
          winery: {
            type: "string",
            description: "Winery or estate name",
          },
          country: {
            type: "string",
            description: "Country of origin",
          },
          producer: {
            type: "string",
            description: "General producer or brand name",
          },
          // Beer attributes
          brewery: {
            type: "string",
            description: "Brewery name",
          },
          style: {
            type: "string",
            description:
              "Style (e.g., IPA, Stout, Pinot Noir, Single Malt, Latte)",
          },
          abv: {
            type: "number",
            description: "Alcohol by volume percentage",
          },
          ibu: {
            type: "integer",
            description: "International bitterness units (beer)",
          },
          // Spirit attributes
          distillery: {
            type: "string",
            description: "Distillery name",
          },
          type: {
            type: "string",
            description:
              "Spirit type (whiskey, rum, vodka, gin, tequila, etc.)",
          },
          age: {
            type: "integer",
            description: "Age statement in years",
          },
          proof: {
            type: "number",
            description: "Proof (alcohol content x 2)",
          },
          // Coffee attributes
          roaster: {
            type: "string",
            description: "Coffee roaster name",
          },
          origin: {
            type: "string",
            description: "Country or region of origin",
          },
          roastLevel: {
            type: "string",
            description: "Roast level (light, medium, dark, etc.)",
          },
          processingMethod: {
            type: "string",
            description: "Processing method (washed, natural, honey, etc.)",
          },
          // Cocktail attributes
          base_spirit: {
            type: "string",
            description:
              "Primary spirit in the cocktail (vodka, gin, rum, whiskey, tequila, etc.)",
          },
          ingredients: {
            type: "string",
            description:
              "Key ingredients as comma-separated list (e.g., lime juice, simple syrup, mint)",
          },
          cocktail_style: {
            type: "string",
            description:
              "Cocktail category or style (classic, tiki, sour, highball, martini, etc.)",
          },
        },
      },
    },
    required: [
      "name",
      "search_name",
      "category",
      "itemType",
      "confidence",
      "attributes",
    ],
  },
};

/**
 * Build the extraction prompt for single-pass vision analysis.
 * The AI receives this prompt along with the menu image and the schema
 * for structured output.
 */
export function buildMenuExtractionPrompt(
  placeName?: string,
  placeCategories?: string[],
): string {
  const contextLines: string[] = [];
  if (placeName) {
    contextLines.push(`Restaurant: ${placeName}`);
  }
  if (placeCategories && placeCategories.length > 0) {
    contextLines.push(`Categories: ${placeCategories.join(", ")}`);
  }
  const contextBlock =
    contextLines.length > 0 ? `\n${contextLines.join("\n")}\n` : "";

  return `You are a specialized menu analysis AI with expert beverage knowledge.
Analyze this restaurant menu image and extract all beverage items directly.
${contextBlock}
INSTRUCTIONS:
1. Extract items directly from the visual layout. Use section headers, formatting, and positioning to determine context (item type, category, etc.).
2. Focus on these beverage types:
   - WINES: Extract name, vintage, variety/grape, region, winery, price
   - BEERS: Extract name, brewery, style, ABV, IBU, price
   - SPIRITS: Extract name, distillery, type (whiskey/rum/vodka/gin/etc), age, proof, price
   - COFFEES: Extract name, roaster, origin, roast level, processing method, price
   - SAKE: Extract name, variety, region, style, vintage, price
   - COCKTAILS/MIXED DRINKS: Extract name, base spirit, key ingredients, style/category, price
3. Skip food items, soft drinks, juices, and water.
4. For search_name: ALWAYS expand abbreviations and normalize for database matching:
   - "Ch." -> "Chateau", "Dom." -> "Domaine", "Cab" -> "Cabernet Sauvignon"
   - "IPA" -> "India Pale Ale" in search_name
   - Include the producer/brand if identifiable from context
   - Separate vintage year from the name
   - For cocktails, use the full canonical name (e.g., "Old Fashioned" not "OF")
5. Only include items you are confident about (confidence >= 0.7).
6. Maximum 50 items.`;
}
