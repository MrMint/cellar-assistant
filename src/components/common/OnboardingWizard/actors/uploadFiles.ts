import { isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { dataUrlToFile } from "@/utilities";
import { UploadFilesInput, UploadFilesResult } from "./types";

export const uploadFiles = fromPromise(
  async ({
    input: { frontLabel, backLabel, nhostClient },
  }: {
    input: UploadFilesInput;
  }): Promise<UploadFilesResult> => {
    let frontLabelFileId: string | undefined;
    let backLabelFileId: string | undefined;

    nhostClient.storage.setAccessToken(nhostClient.auth.getAccessToken());

    if (isNotNil(frontLabel)) {
      const file = dataUrlToFile(frontLabel, "front-label.jpg");
      if (isNotNil(file)) {
        const { fileMetadata } = await nhostClient.storage.upload({
          file,
          bucketId: "label_images",
        });
        frontLabelFileId = fileMetadata?.id;
      }
    }
    if (isNotNil(backLabel)) {
      const file = dataUrlToFile(backLabel, "back-label.jpg");
      if (isNotNil(file)) {
        const { fileMetadata } = await nhostClient.storage.upload({
          file,
          bucketId: "label_images",
        });
        backLabelFileId = fileMetadata?.id;
      }
    }
    return { frontLabelFileId, backLabelFileId };
  },
);
