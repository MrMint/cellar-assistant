/**
 * AI processing and response parsing utilities for recipe photo processing
 */
import { createAIProvider } from "../_utils/ai-providers/factory";
import { GET_PLACE_CONTEXT_QUERY } from "../_utils/search-queries";
import { type AllEnumValues, standardizeUnit } from "../_utils/shared-enums";
import { functionQuery } from "../_utils/urql-client";
import type { ImageData } from "./_image-processing";
import {
  buildEnhancedRecipeExtractionPrompt,
  buildPlaceContext,
} from "./_prompts";
import type { EnhancedExtractedRecipe } from "./_schemas";
import type { ProcessingSetup } from "./_validation";

export interface PlaceData {
  name?: string;
  primary_category?: string;
  locality?: string;
  region?: string;
  street_address?: string;
}

export interface AIProcessingResult {
  recipes: EnhancedExtractedRecipe[];
  processingTime: number;
  confidence: number;
}

/**
 * Fetch place data for context
 */
export async function getPlaceData(placeId: string): Promise<PlaceData | null> {
  try {
    console.log(`🏢 [getPlaceData] Querying place data for ID: ${placeId}`);

    const data = await functionQuery(GET_PLACE_CONTEXT_QUERY, {
      placeId,
    });

    if (!data?.places_by_pk) {
      console.log("🏢 [getPlaceData] No place found for the given ID");
      return null;
    }

    console.log(`🏢 [getPlaceData] Place data retrieved successfully`);
    return data.places_by_pk;
  } catch (error) {
    console.error("❌ [getPlaceData] Error fetching place data:", error);
    return null;
  }
}

/**
 * Process AI analysis of recipe image
 */
export async function processAIAnalysis(
  setup: ProcessingSetup,
  imageData: ImageData,
  placeData: PlaceData | null,
): Promise<AIProcessingResult> {
  const { enumValues, schema } = setup;

  // Build enhanced context and prompt
  const placeContext = buildPlaceContext(placeData || undefined);
  const prompt = buildEnhancedRecipeExtractionPrompt(placeContext, enumValues);
  console.log(
    `🤖 [RecipeProcessor] Generated enhanced prompt (${prompt.length} chars)`,
  );

  // Initialize AI provider
  console.log("🤖 [RecipeProcessor] Initializing AI provider");
  const aiProvider = await createAIProvider();
  console.log("🤖 [RecipeProcessor] AI provider initialized successfully");

  console.log(
    "🤖 [RecipeProcessor] Starting AI content generation with enhanced schema",
  );
  const startTime = Date.now();
  const aiResult = await aiProvider.generateContent({
    prompt,
    images: [Buffer.from(imageData.buffer)],
    schema,
  });
  const processingTime = Date.now() - startTime;
  console.log(
    `🤖 [RecipeProcessor] AI processing completed in ${processingTime}ms`,
  );

  if (!aiResult.content) {
    console.log("❌ [RecipeProcessor] AI provider returned no content");
    console.log("❌ [RecipeProcessor] AI result metadata:", aiResult.metadata);
    throw new Error("Failed to analyze image - no content returned");
  }

  console.log(
    `🤖 [RecipeProcessor] AI returned content (${aiResult.content.length} chars)`,
  );
  if (aiResult.metadata) {
    console.log("🤖 [RecipeProcessor] AI metadata:", aiResult.metadata);
  }

  return parseAIResponse(aiResult.content, enumValues, processingTime);
}

/**
 * Parse and validate AI response
 */
function parseAIResponse(
  content: string,
  enumValues: AllEnumValues,
  processingTime: number,
): AIProcessingResult {
  // Debug: Log raw AI response with truncation detection
  console.log("🔍 [RecipeProcessor] Raw AI response content:");
  console.log(
    `🔍 [RecipeProcessor] Response length: ${content.length} characters`,
  );
  console.log("=".repeat(80));
  console.log(content);
  console.log("=".repeat(80));

  // Check for common truncation indicators
  const lastChars = content.slice(-50);
  const hasIncompleteJSON =
    !content.trim().endsWith("}") && !content.trim().endsWith("]");
  console.log(`🔍 [RecipeProcessor] Last 50 chars: "${lastChars}"`);
  console.log(`🔍 [RecipeProcessor] Appears truncated: ${hasIncompleteJSON}`);

  if (hasIncompleteJSON) {
    console.log(
      "⚠️ [RecipeProcessor] WARNING: Response appears to be truncated!",
    );
    console.log(
      "⚠️ [RecipeProcessor] This may be due to model context limits or response length limits",
    );
  }

  // Parse and enhance AI response
  console.log("📋 [RecipeProcessor] Parsing and enhancing AI response");
  console.log(
    `📋 [RecipeProcessor] Attempting to parse JSON content of ${content.length} characters`,
  );

  let extractedData: { recipes: EnhancedExtractedRecipe[] };
  try {
    extractedData = JSON.parse(content);
    console.log("✅ [RecipeProcessor] JSON parsing successful");
    console.log(
      `📋 [RecipeProcessor] Parsed data structure: ${extractedData ? "valid object" : "null/undefined"}`,
    );
    console.log(
      `📋 [RecipeProcessor] Recipes array: ${Array.isArray(extractedData.recipes) ? "valid array" : "not an array or missing"}`,
    );
    console.log(
      `📋 [RecipeProcessor] Recipe count: ${extractedData.recipes?.length || 0}`,
    );
  } catch (error) {
    console.log("❌ [RecipeProcessor] Failed to parse AI response as JSON");
    console.log("❌ [RecipeProcessor] Full raw AI content:");
    console.log("-".repeat(80));
    console.log(content);
    console.log("-".repeat(80));
    console.log("❌ [RecipeProcessor] Parse error:", error);
    throw new Error("Failed to parse AI response");
  }

  if (!extractedData.recipes || extractedData.recipes.length === 0) {
    console.log("⚠️ [RecipeProcessor] No recipes found in parsed data");
    console.log("🔍 [RecipeProcessor] Full parsed object structure:");
    console.log(JSON.stringify(extractedData, null, 2));
    return { recipes: [], processingTime, confidence: 0 };
  }

  // Process and enhance recipes
  const enhancedRecipes = processEnhancedRecipes(
    extractedData.recipes,
    enumValues,
  );

  // Calculate overall confidence
  const confidenceScores = enhancedRecipes
    .map((r) => r.confidence)
    .filter(Boolean);
  const averageConfidence =
    confidenceScores.length > 0
      ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
      : 0;

  return {
    recipes: enhancedRecipes,
    processingTime,
    confidence: averageConfidence,
  };
}

/**
 * Process and enhance recipes with unit standardization and brand separation
 */
function processEnhancedRecipes(
  recipes: EnhancedExtractedRecipe[],
  _enumValues: AllEnumValues, // Reserved for future enum validation enhancements
): EnhancedExtractedRecipe[] {
  return recipes.map((recipe) => {
    // Process ingredients for enhancements
    const enhancedIngredients =
      recipe.ingredients?.map((ingredient) => {
        // Standardize units if both quantity and unit are present
        if (ingredient.quantity && ingredient.unit) {
          const standardized = standardizeUnit(
            ingredient.quantity,
            ingredient.unit,
          );

          // Only update if conversion occurred
          if (
            standardized.unit !== ingredient.unit ||
            standardized.quantity !== ingredient.quantity
          ) {
            ingredient.original_quantity = ingredient.quantity;
            ingredient.original_unit = ingredient.unit;
            ingredient.quantity = standardized.quantity;
            ingredient.unit = standardized.unit;
          }
        }

        return ingredient;
      }) || [];

    return {
      ...recipe,
      ingredients: enhancedIngredients,
      extraction_method: "ai_vision_enhanced",
    };
  });
}
