import { isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { uploadLabelImagesAction } from "@/app/actions/uploadLabelImages";
import { compressImage, dataUrlToFile } from "@/utilities";
import type { UploadFilesInput, UploadFilesResult } from "./types";

// Compression settings optimized for AI text recognition while staying under Vercel's 4.5MB limit
// Higher quality (0.92) preserves fine text on labels; 1400px maintains detail
const MAX_IMAGE_DIMENSION = 1400;
const IMAGE_QUALITY = 0.92;

export const uploadFiles = fromPromise(
  async ({
    input: { frontLabel, backLabel },
  }: {
    input: UploadFilesInput;
  }): Promise<UploadFilesResult> => {
    // Create FormData with the label files
    const formData = new FormData();

    if (isNotNil(frontLabel)) {
      // Compress image before upload to avoid payload size limits
      const compressedFrontLabel = await compressImage(
        frontLabel,
        MAX_IMAGE_DIMENSION,
        IMAGE_QUALITY,
      );
      const file = dataUrlToFile(compressedFrontLabel, "front-label.jpg");
      if (isNotNil(file)) {
        formData.append("frontLabel", file);
      }
    }

    if (isNotNil(backLabel)) {
      // Compress image before upload to avoid payload size limits
      const compressedBackLabel = await compressImage(
        backLabel,
        MAX_IMAGE_DIMENSION,
        IMAGE_QUALITY,
      );
      const file = dataUrlToFile(compressedBackLabel, "back-label.jpg");
      if (isNotNil(file)) {
        formData.append("backLabel", file);
      }
    }

    // Call the server action to upload files securely
    const result = await uploadLabelImagesAction(formData);

    if (!result.success) {
      throw new Error(result.error || "Upload failed");
    }

    return {
      frontLabelFileId: result.frontLabelFileId,
      backLabelFileId: result.backLabelFileId,
    };
  },
);
