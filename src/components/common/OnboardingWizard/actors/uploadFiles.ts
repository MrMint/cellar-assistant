import { isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { uploadLabelImagesAction } from "@/app/actions/uploadLabelImages";
import { dataUrlToFile } from "@/utilities";
import type { UploadFilesInput, UploadFilesResult } from "./types";

export const uploadFiles = fromPromise(
  async ({
    input: { frontLabel, backLabel },
  }: {
    input: UploadFilesInput;
  }): Promise<UploadFilesResult> => {
    // Create FormData with the label files
    const formData = new FormData();

    if (isNotNil(frontLabel)) {
      const file = dataUrlToFile(frontLabel, "front-label.jpg");
      if (isNotNil(file)) {
        formData.append("frontLabel", file);
      }
    }

    if (isNotNil(backLabel)) {
      const file = dataUrlToFile(backLabel, "back-label.jpg");
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
