import { fromPromise } from "xstate";
import { readFragment } from "@/lib/api/graphql";
import {
  ItemOnboardingFragment,
  StartItemOnboardingMutation,
} from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { emptyDefaults, formDefaultsFromOnboarding } from "../adapter";
import type { DefaultValuesResult, FetchDefaultsInput } from "./types";

/**
 * The six `82450ad1:src/components/{type}/actors/fetchDefaults.ts`, as one:
 * `{type}_defaults(hint)` → `startItemOnboarding`.
 *
 * Two outcomes are answers, and one is a failure:
 *
 * - `ItemOnboarding` — the model read a label. Its `defaults` go through the
 *   E2c merge into the restored form's values (`formDefaultsFromOnboarding`).
 * - A typed refusal — no label photographed, a photograph that is not a label,
 *   no AI provider. The session row still exists and confirm works against
 *   it, so this resolves with empty defaults and the server's message rather
 *   than throwing: retrying cannot change it.
 * - No answer at all (transport) — throws, and the machine's old
 *   `retryAnalyze` tries twice more before falling back to an empty form.
 *   `itemOnboardingId` is minted once, so a retry reuses the session rather
 *   than buying a second model call.
 *
 * The scanned barcode rides along: `confirm` registers it through
 * `BarcodeActor` and the item is created carrying it. Its type is the
 * scanner's detected symbology — EAN/UPC only, all GTINs, which
 * `BarcodeActor.ensure` never refuses on a type difference
 * (`lib/items/barcode.ts` §2). A typed code takes the other path.
 */
export const fetchDefaults = fromPromise(
  async ({
    input: {
      urqlClient,
      itemType,
      itemOnboardingId,
      barcode,
      frontLabelFileId,
      backLabelFileId,
    },
  }: {
    input: FetchDefaultsInput;
  }): Promise<DefaultValuesResult> => {
    const response = await urqlClient
      .mutation(StartItemOnboardingMutation, {
        onboardingId: itemOnboardingId,
        input: {
          itemType,
          barcode: barcode?.text ?? null,
          barcodeType: barcode?.type ?? null,
          frontLabelImageId: frontLabelFileId ?? null,
          backLabelImageId: backLabelFileId ?? null,
        },
      })
      .toPromise();
    const result = unwrapResult(
      response.data?.startItemOnboarding,
      "ItemOnboarding",
    );
    if (!result.ok) {
      if (result.error.code === "TRANSPORT")
        throw new Error(result.error.message);
      return {
        defaults: emptyDefaults(),
        itemOnboardingId,
        confidence: 0,
        extractionError: result.error.message,
      };
    }
    const onboarding = readFragment(ItemOnboardingFragment, result.data);
    return {
      defaults: formDefaultsFromOnboarding(itemType, onboarding.defaults),
      itemOnboardingId: onboarding.id,
      confidence: onboarding.confidence ?? 0,
    };
  },
);
