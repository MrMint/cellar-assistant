import type { Request, Response } from "express";
import { AUTH_ERROR_RESPONSE, validateAuth } from "../_utils/auth-middleware";
import { getPlaceData, processAIAnalysis } from "./_ai-processing";
import { saveRecipesToDatabase } from "./_database-operations";
import { fetchImageFromStorage } from "./_image-processing";
import {
  initializeProcessingSetup,
  validateRecipePhotoRequest,
} from "./_validation";

// Validate environment configuration
console.log(
  "🔧 [RecipeProcessor] Initializing with environment configuration...",
);

/**
 * Main recipe photo processing endpoint - refactored for maintainability
 *
 * This function has been broken down into logical modules:
 * - _validation.ts: Request validation and setup
 * - _image-processing.ts: Image fetching and processing
 * - _ai-processing.ts: AI analysis and response parsing
 * - _database-operations.ts: Database operations and result generation
 */
export default async (req: Request, res: Response) => {
  console.log("🔄 [RecipeProcessor] Starting enhanced recipe photo processing");
  console.log(`🔄 [RecipeProcessor] Method: ${req.method}`);

  // Validate authentication
  if (!validateAuth(req)) {
    console.warn("⚠️ [RecipeProcessor] Authentication failed");
    return res.status(401).json(AUTH_ERROR_RESPONSE);
  }

  // Validate HTTP method
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are supported",
    });
  }

  try {
    // 1. Validate request and initialize setup
    const request = validateRecipePhotoRequest(req);
    const setup = await initializeProcessingSetup(request);

    // 2. Fetch and process image
    const imageData = await fetchImageFromStorage(setup);

    // 3. Get place context if available
    let placeData = null;
    if (request.placeId) {
      console.log(
        `🏢 [RecipeProcessor] Fetching place data for: ${request.placeId}`,
      );
      placeData = await getPlaceData(request.placeId);
      console.log(
        `🏢 [RecipeProcessor] Place data: ${placeData ? "fetched successfully" : "none found"}`,
      );
    } else {
      console.log(
        "🏢 [RecipeProcessor] No place ID provided, skipping place context",
      );
    }

    // 4. Process AI analysis
    const aiResult = await processAIAnalysis(setup, imageData, placeData);

    // 5. Save to database and generate response
    const databaseResult = await saveRecipesToDatabase(
      setup,
      aiResult,
      placeData,
    );

    console.log(
      "✅ [RecipeProcessor] Enhanced processing with recipe grouping completed successfully",
    );
    console.log(
      `✅ [RecipeProcessor] Results: ${databaseResult.recipesCreated} recipes saved, ${databaseResult.groupingStats.newGroupsCreated} new groups created, ${databaseResult.groupingStats.recipesAutoGrouped} auto-grouped, ${databaseResult.totalIngredients} ingredients, ${databaseResult.totalInstructions} instructions, ${databaseResult.totalItemsCreated} items created, ${databaseResult.totalBrandsCreated} brands created`,
    );

    return res.status(200).json(databaseResult);
  } catch (error) {
    console.error(
      "❌ [RecipeProcessor] Unexpected error during enhanced processing:",
    );
    console.error("❌ [RecipeProcessor] Error details:", error);

    if (error instanceof Error) {
      console.error("❌ [RecipeProcessor] Error message:", error.message);
      console.error("❌ [RecipeProcessor] Error stack:", error.stack);

      // Handle specific error types with appropriate status codes
      if (error.message === "Method not allowed") {
        return res.status(405).json({ error: "Method not allowed" });
      }
      if (error.message.includes("required")) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message === "File not found") {
        return res.status(404).json({
          error: "File not found",
          details: "Could not get presigned URL for file",
        });
      }
      if (error.message.includes("Failed to download")) {
        return res.status(400).json({ error: "Failed to download image" });
      }
    }

    return res.status(500).json({
      error: "Internal server error",
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
};
