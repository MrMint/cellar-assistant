/**
 * Request validation and setup utilities for recipe photo processing
 */
import type { Request } from "express";
import { createFunctionNhostClient } from "../_utils/index";
import { getAllEnumValues } from "../_utils/shared-enums";
import { generateFlexibleRecipeSchema } from "./_schemas";
import {
  isProcessRecipePhotoInput,
  type RecipePhotoRequest,
  validateFunctionInput,
} from "./_types";

// Use function-specific type from local types module
export type { RecipePhotoRequest } from "./_types";

export interface ProcessingSetup {
  request: RecipePhotoRequest;
  nhostClient: ReturnType<typeof createFunctionNhostClient>;
  enumValues: Awaited<ReturnType<typeof getAllEnumValues>>;
  schema: ReturnType<typeof generateFlexibleRecipeSchema>;
}

/**
 * Validate and parse request body using centralized validation
 */
export function validateRecipePhotoRequest(req: Request): RecipePhotoRequest {
  if (req.method !== "POST") {
    throw new Error("Method not allowed");
  }

  // Use centralized validation with better error messages
  const input = validateFunctionInput(
    req.body,
    isProcessRecipePhotoInput,
    "processRecipePhoto",
  );

  console.log("📝 [RecipeProcessor] Request body validated successfully:");
  console.log(`📝 [RecipeProcessor] - photoId: ${input.photoId}`);
  console.log(`📝 [RecipeProcessor] - userId: ${input.userId}`);
  console.log(
    `📝 [RecipeProcessor] - placeId: ${input.placeId || "not provided"}`,
  );
  console.log(
    `📝 [RecipeProcessor] - menuItemId: ${input.menuItemId || "not provided"}`,
  );

  return input;
}

/**
 * Initialize processing setup with database connections and schemas
 */
export async function initializeProcessingSetup(
  request: RecipePhotoRequest,
): Promise<ProcessingSetup> {
  console.log(
    "🔐 [RecipeProcessor] Initializing Nhost client with admin access",
  );
  const nhostClient = createFunctionNhostClient();
  console.log("✅ [RecipeProcessor] Nhost client initialized successfully");

  // Fetch enum values for enhanced categorization
  console.log("📋 [RecipeProcessor] Fetching database enum values");
  const enumValues = await getAllEnumValues();
  console.log("✅ [RecipeProcessor] Enum values fetched successfully");

  // Generate dynamic schema with enum values
  const schema = generateFlexibleRecipeSchema(enumValues);
  console.log(
    "✅ [RecipeProcessor] Dynamic schema generated with enum guidance",
  );

  return {
    request,
    nhostClient,
    enumValues,
    schema,
  };
}
