import { fromPromise } from "xstate";
import { uploadFile } from "@/lib/api/files";
import { dataUrlToFile } from "@/lib/items/data-url";
import { readDefaults } from "./fetchDefaults";
import type { RereadLabelsInput, RereadLabelsResult } from "./types";

/**
 * N21's optional "Add back label", after the snap-once read (X05).
 *
 * `startItemOnboarding` is idempotent per session — asked again under the
 * same id it answers with the stored read — so reading the back label means
 * a **new** session, sent the front label already uploaded at the shutter
 * and the back one uploaded here. It is one more model call, and only ever
 * because the person asked for it. The draft card then fills the answer into
 * the fields they have not touched (fill-empty-only, `extraction-merge.ts`).
 */
export const rereadLabels = fromPromise(
  async ({
    input: { urqlClient, itemType, barcode, frontLabelFileId, backLabel },
  }: {
    input: RereadLabelsInput;
  }): Promise<RereadLabelsResult> => {
    const file = dataUrlToFile(backLabel, "back-label.jpg");
    if (file === null)
      throw new Error("The back label photo could not be read.");
    const backLabelFileId = await uploadFile(urqlClient, file, "label-back");
    const read = await readDefaults({
      urqlClient,
      itemType,
      itemOnboardingId: crypto.randomUUID(),
      barcode,
      frontLabelFileId,
      backLabelFileId,
    });
    return { ...read, backLabelFileId };
  },
);
