"use server";

import { graphql } from "@cellar-assistant/shared";
import { createNhostClient } from "@/lib/nhost/server";
import { serverMutation } from "@/lib/urql/server";
import { getServerUserId } from "@/utilities/auth-server";

export interface RecipeProcessingResult {
  success: boolean;
  recipesCreated: number;
  totalIngredients: number;
  enhancementsApplied: number;
  results: Array<{
    recipeId?: string;
    recipeName: string;
    success: boolean;
    ingredientsCreated?: number;
    instructionsCreated?: number;
    error?: string;
  }>;
  menuAnalysis?: {
    restaurant_type?: string | null;
    recipes_extracted: number | null;
    extraction_method: string | null;
  } | null;
  error?: string;
}

export async function processRecipePhotoAction(
  formData: FormData,
): Promise<RecipeProcessingResult> {
  try {
    // Get the authenticated user ID from server-side session
    const userId = await getServerUserId();
    if (!userId) {
      return {
        success: false,
        error: "User not authenticated",
        recipesCreated: 0,
        totalIngredients: 0,
        enhancementsApplied: 0,
        results: [],
      };
    }

    // Initialize server-side Nhost client (this has proper auth)
    const nhost = await createNhostClient();

    // Get form data
    const file = formData.get("file") as File;
    const placeId = formData.get("placeId") as string | null;
    const menuItemId = formData.get("menuItemId") as string | null;

    if (!file) {
      return {
        success: false,
        error: "No file provided",
        recipesCreated: 0,
        totalIngredients: 0,
        enhancementsApplied: 0,
        results: [],
      };
    }

    // Upload file using server-side client (has proper authentication)
    console.log("📤 [ProcessRecipePhoto] Uploading file to storage");
    console.log(`📤 [ProcessRecipePhoto] File size: ${file.size} bytes`);
    console.log(`📤 [ProcessRecipePhoto] File type: ${file.type}`);
    console.log(`📤 [ProcessRecipePhoto] File name: ${file.name}`);

    const uploadResult = await nhost.storage.uploadFiles({
      "file[]": [file],
      "bucket-id": "default",
    });

    const {
      body: {
        processedFiles: [fileMetadata],
      },
      status,
    } = uploadResult;

    console.log(`📤 [ProcessRecipePhoto] Upload status: ${status}`);
    console.log(
      "📤 [ProcessRecipePhoto] Upload result body:",
      uploadResult.body,
    );

    if (status < 200 || status >= 300) {
      console.log(
        `❌ [ProcessRecipePhoto] Upload failed with status ${status}`,
      );
      return {
        success: false,
        error: `Upload failed with status ${status}`,
        recipesCreated: 0,
        totalIngredients: 0,
        enhancementsApplied: 0,
        results: [],
      };
    }

    if (!fileMetadata?.id) {
      console.log("❌ [ProcessRecipePhoto] No file metadata or ID returned");
      console.log("❌ [ProcessRecipePhoto] File metadata:", fileMetadata);
      return {
        success: false,
        error: "No file ID returned from upload",
        recipesCreated: 0,
        totalIngredients: 0,
        enhancementsApplied: 0,
        results: [],
      };
    }

    console.log(
      `✅ [ProcessRecipePhoto] File uploaded successfully with ID: ${fileMetadata.id}`,
    );
    console.log("✅ [ProcessRecipePhoto] File metadata:", fileMetadata);

    // Small delay to ensure file is available in storage
    console.log(
      "⏱️ [ProcessRecipePhoto] Waiting 1 second for file to be available...",
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Call the Nhost function via URQL
    const mutation = graphql(`
      mutation ProcessRecipePhoto($input: ProcessRecipePhotoInput!) {
        processRecipePhoto(input: $input) {
          success
          recipesCreated
          totalIngredients
          enhancementsApplied
          results {
            recipeId
            recipeName
            success
            ingredientsCreated
            instructionsCreated
            error
          }
          menuAnalysis {
            restaurant_type
            recipes_extracted
            extraction_method
          }
        }
      }
    `);

    const variables = {
      input: {
        photoId: fileMetadata.id,
        userId: userId,
        placeId: placeId,
        menuItemId: menuItemId,
      },
    };

    console.log("🔄 [ProcessRecipePhoto] Calling GraphQL mutation");
    const mutationResult = await serverMutation(mutation, variables);

    console.log("🔄 [ProcessRecipePhoto] Mutation result:", mutationResult);
    console.log(
      "🔄 [ProcessRecipePhoto] Direct processRecipePhoto access:",
      mutationResult.processRecipePhoto,
    );

    // serverMutation throws on error, so if we reach here, we have data
    // Try both possible locations for the result data
    const result = mutationResult.processRecipePhoto;
    console.log("🔄 [ProcessRecipePhoto] Extracted result:", result);

    if (!result) {
      console.log(
        "❌ [ProcessRecipePhoto] No result data returned from mutation",
      );
      return {
        success: false,
        error: "No data returned from processRecipePhoto mutation",
        recipesCreated: 0,
        totalIngredients: 0,
        enhancementsApplied: 0,
        results: [],
      };
    }

    return {
      success: result.success,
      recipesCreated: result.recipesCreated || 0,
      totalIngredients: result.totalIngredients || 0,
      enhancementsApplied: result.enhancementsApplied || 0,
      results:
        result.results?.map((r) => ({
          recipeId: r.recipeId ?? undefined,
          recipeName: r.recipeName || "Unknown Recipe",
          success: r.success,
          ingredientsCreated: r.ingredientsCreated ?? undefined,
          instructionsCreated: r.instructionsCreated ?? undefined,
          error: r.error ?? undefined,
        })) || [],
      menuAnalysis: result.menuAnalysis,
    };
  } catch (error) {
    console.error("Server-side recipe processing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown server error",
      recipesCreated: 0,
      totalIngredients: 0,
      enhancementsApplied: 0,
      results: [],
    };
  }
}
