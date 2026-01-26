/**
 * Image fetching and processing utilities for recipe photo processing
 */

import { getFilePresignedURLWithAuth } from "../_utils/index";
import type { ProcessingSetup } from "./_validation";

export interface ImageData {
  buffer: ArrayBuffer;
  size: number;
}

/**
 * Fetch and validate image from storage
 */
export async function fetchImageFromStorage(
  setup: ProcessingSetup,
): Promise<ImageData> {
  const { request, nhostClient } = setup;
  const { photoId } = request;

  // Get image URL from storage
  console.log(`📁 [RecipeProcessor] Getting public URL for file: ${photoId}`);
  const presignedUrlResponse = await getFilePresignedURLWithAuth(
    nhostClient,
    photoId,
  );

  // Check the actual response structure from the logs
  console.log(
    "📁 [RecipeProcessor] Presigned URL response:",
    presignedUrlResponse,
  );

  // Use the actual response structure from the previous working code
  const {
    body: { url },
    status,
  } = presignedUrlResponse;
  if (status !== 200 || !url) {
    console.log(`❌ [RecipeProcessor] Failed to get presigned URL: ${status}`);
    throw new Error("File not found");
  }

  console.log(`📁 [RecipeProcessor] Image URL: ${url}`);

  // Download image buffer
  console.log("📥 [RecipeProcessor] Downloading image from storage");
  const imageResponse = await fetch(url);
  if (!imageResponse.ok) {
    console.log(
      `❌ [RecipeProcessor] Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`,
    );
    throw new Error("Failed to download image");
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  console.log(
    `📥 [RecipeProcessor] Image downloaded successfully: ${imageBuffer.byteLength} bytes`,
  );

  return {
    buffer: imageBuffer,
    size: imageBuffer.byteLength,
  };
}
