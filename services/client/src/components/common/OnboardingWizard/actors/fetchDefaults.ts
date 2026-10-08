import { fromPromise } from "xstate";
import { aiOutcome } from "@/lib/ai/outcome";
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
 *   no AI provider, a spent allowance. The session row still exists and
 *   confirm works against it, so this resolves with empty defaults and
 *   `aiOutcome`'s words for the refusal (N07 — never the server's message,
 *   which is an operator's) rather than throwing: retrying cannot change it.
 * - No AI provider here at all (`AI_UNCONFIGURED`, the deployment
 *   `viewer.aiCapabilities.labelRead` reports false for, D25) — the form opens
 *   empty with nothing to apologise for: there was never anything to read
 *   with, so there is nothing to explain. `startItemOnboarding` is still
 *   called, and has to be: it is what writes the session row `confirm`
 *   reads (`ItemOnboardingActor.confirm` → `requireAggregate`), so skipping it
 *   would make every bottle on an AI-less deployment unsaveable.
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
        // N07/D25: no provider is not news to the person adding a bottle.
        ...(result.error.reason === "AI_UNCONFIGURED"
          ? {}
          : {
              extractionError: aiOutcome(result.error, {
                fallback: "fill in the details yourself below",
              }),
            }),
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
