import { isNotNil } from "ramda";
import { fromPromise } from "xstate";
import { uploadFile } from "@/lib/api/files";
import { dataUrlToFile } from "@/lib/items/data-url";
import type { UploadFilesInput, UploadFilesResult } from "./types";

/**
 * `82450ad1:…/actors/uploadFiles.ts`. The old actor compressed both captures
 * to 1400 px and posted them to a server action, because Vercel capped the
 * body at 4.5 MB (E2d/E2f: base64 through the server, unverified ids). Each
 * label now goes straight to the object store — `createUploadTarget` → PUT —
 * as its own `label-front`/`label-back` file, uncompressed, and
 * `startItemOnboarding` verifies both ids before it reads them.
 */
export const uploadFiles = fromPromise(
  async ({
    input: { urqlClient, frontLabel, backLabel },
  }: {
    input: UploadFilesInput;
  }): Promise<UploadFilesResult> => {
    const front = isNotNil(frontLabel)
      ? dataUrlToFile(frontLabel, "front-label.jpg")
      : null;
    const back = isNotNil(backLabel)
      ? dataUrlToFile(backLabel, "back-label.jpg")
      : null;

    const [frontLabelFileId, backLabelFileId] = await Promise.all([
      front === null ? undefined : uploadFile(urqlClient, front, "label-front"),
      back === null ? undefined : uploadFile(urqlClient, back, "label-back"),
    ]);
    return { frontLabelFileId, backLabelFileId };
  },
);
