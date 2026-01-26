"use server";

import { createNhostClient } from "@/lib/nhost/server";
import { getServerUserId } from "@/utilities/auth-server";

export interface UploadLabelImagesResult {
  success: boolean;
  frontLabelFileId?: string;
  backLabelFileId?: string;
  error?: string;
}

/**
 * Server action to upload label images securely.
 * This keeps the access token entirely server-side (respects HTTP-only cookie security).
 */
export async function uploadLabelImagesAction(
  formData: FormData,
): Promise<UploadLabelImagesResult> {
  try {
    // Verify user is authenticated
    const userId = await getServerUserId();
    if (!userId) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    // Initialize server-side Nhost client (has proper auth from cookies)
    const nhost = await createNhostClient();

    let frontLabelFileId: string | undefined;
    let backLabelFileId: string | undefined;

    // Handle front label upload
    const frontLabelFile = formData.get("frontLabel") as File | null;
    if (frontLabelFile && frontLabelFile.size > 0) {
      console.log("📤 [UploadLabelImages] Uploading front label...");
      const result = await nhost.storage.uploadFiles({
        "file[]": [frontLabelFile],
        "bucket-id": "label_images",
      });

      const { body, status } = result;
      if (status >= 200 && status < 300 && body?.processedFiles?.[0]?.id) {
        frontLabelFileId = body.processedFiles[0].id;
        console.log(
          `✅ [UploadLabelImages] Front label uploaded: ${frontLabelFileId}`,
        );
      } else {
        console.error(
          "❌ [UploadLabelImages] Front label upload failed:",
          status,
          body,
        );
        return {
          success: false,
          error: `Front label upload failed with status ${status}`,
        };
      }
    }

    // Handle back label upload
    const backLabelFile = formData.get("backLabel") as File | null;
    if (backLabelFile && backLabelFile.size > 0) {
      console.log("📤 [UploadLabelImages] Uploading back label...");
      const result = await nhost.storage.uploadFiles({
        "file[]": [backLabelFile],
        "bucket-id": "label_images",
      });

      const { body, status } = result;
      if (status >= 200 && status < 300 && body?.processedFiles?.[0]?.id) {
        backLabelFileId = body.processedFiles[0].id;
        console.log(
          `✅ [UploadLabelImages] Back label uploaded: ${backLabelFileId}`,
        );
      } else {
        console.error(
          "❌ [UploadLabelImages] Back label upload failed:",
          status,
          body,
        );
        return {
          success: false,
          error: `Back label upload failed with status ${status}`,
        };
      }
    }

    return {
      success: true,
      frontLabelFileId,
      backLabelFileId,
    };
  } catch (error) {
    console.error("❌ [UploadLabelImages] Server error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown server error",
    };
  }
}
