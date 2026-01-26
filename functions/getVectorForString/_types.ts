/**
 * Type definitions for getVectorForString function
 *
 * This function generates vector embeddings for text or image content using AI services.
 * It's called as a Hasura action and can process either text or image inputs.
 */

// =============================================================================
// Input Types
// =============================================================================

/**
 * Input for getVectorForString function
 * Used as a Hasura action to generate embeddings
 */
export interface VectorInput {
  input: {
    text?: string;
    image?: string;
  };
  session_variables?: {
    "x-hasura-user-id"?: string;
  };
}

// =============================================================================
// Output Types
// =============================================================================

/**
 * Response from getVectorForString function
 */
export interface VectorOutput {
  success: boolean;
  vector: number[];
}

/**
 * Input type for processVectorGeneration
 */
export type VectorGenerationInput = {
  text?: string;
  image?: string;
  inputType: "text" | "image";
};

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to validate VectorInput
 */
export function isVectorInput(value: unknown): value is VectorInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;

  // Check input structure
  if (!data.input || typeof data.input !== "object") {
    return false;
  }

  const input = data.input as Record<string, unknown>;
  const { text, image } = input;

  // Validate that exactly one of text or image is provided
  const hasText = text !== undefined && text !== null;
  const hasImage = image !== undefined && image !== null;

  if (!hasText && !hasImage) {
    return false;
  }

  if (hasText && hasImage) {
    return false;
  }

  // Validate text if provided
  if (
    hasText &&
    (typeof text !== "string" || (text as string).trim().length === 0)
  ) {
    return false;
  }

  // Validate image if provided
  if (
    hasImage &&
    (typeof image !== "string" || !(image as string).startsWith("data:"))
  ) {
    return false;
  }

  // Validate session variables if present
  if (data.session_variables && typeof data.session_variables === "object") {
    const sessionVars = data.session_variables as Record<string, unknown>;
    const userId = sessionVars["x-hasura-user-id"];
    if (userId !== undefined && userId !== null && typeof userId !== "string") {
      return false;
    }
  }

  return true;
}

/**
 * Validates VectorInput and throws descriptive errors
 */
export function validateVectorInput(value: unknown): VectorInput {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid request body format");
  }

  const data = value as Record<string, unknown>;

  if (!data.input) {
    throw new Error("Missing input field");
  }

  if (typeof data.input !== "object") {
    throw new Error("Invalid input field type");
  }

  const input = data.input as Record<string, unknown>;
  const { text, image } = input;

  // Validate that exactly one of text or image is provided
  const hasText = text !== undefined && text !== null;
  const hasImage = image !== undefined && image !== null;

  if (!hasText && !hasImage) {
    throw new Error("Either text or image must be provided");
  }

  if (hasText && hasImage) {
    throw new Error("Cannot provide both text and image - choose one");
  }

  // Validate text if provided
  if (
    hasText &&
    (typeof text !== "string" || (text as string).trim().length === 0)
  ) {
    throw new Error("Text must be a non-empty string");
  }

  // Validate image if provided
  if (
    hasImage &&
    (typeof image !== "string" || !(image as string).startsWith("data:"))
  ) {
    throw new Error("Image must be a valid data URL string");
  }

  // Validate session variables if present
  if (data.session_variables && typeof data.session_variables === "object") {
    const sessionVars = data.session_variables as Record<string, unknown>;
    const userId = sessionVars["x-hasura-user-id"];
    if (userId !== undefined && userId !== null && typeof userId !== "string") {
      throw new Error("Invalid user ID format");
    }
  }

  return value as VectorInput;
}
