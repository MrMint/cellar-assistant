import { fromPromise } from "xstate";
import { captureDrafts } from "@/components/capture/drafts";
import { aiOutcome } from "@/lib/ai/outcome";
import { readFragment } from "@/lib/api/graphql";
import { ItemOnboardingFragment } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import {
  emptyDefaults,
  formDefaultsFromDraft,
  formDefaultsFromOnboarding,
} from "../adapter";
import { OnboardingStartMutation } from "../queries";
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
export const readDefaults = async ({
  urqlClient,
  itemType,
  itemOnboardingId,
  barcode,
  frontLabelFileId,
  backLabelFileId,
  resumed,
}: FetchDefaultsInput): Promise<DefaultValuesResult> => {
  const response = await urqlClient
    .mutation(OnboardingStartMutation, {
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
  const sent = frontLabelFileId !== undefined || backLabelFileId !== undefined;
  if (!result.ok) {
    if (result.error.code === "TRANSPORT")
      throw new Error(result.error.message);
    return {
      defaults: emptyDefaults(),
      itemOnboardingId,
      confidence: 0,
      labelSent: sent,
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
  const read = formDefaultsFromOnboarding(itemType, onboarding.defaults);
  // F-59: a saved draft reopens on what the person typed, in its own cellar.
  const draftCellarId = resumed === true ? result.data.cellarId : null;
  return {
    defaults:
      resumed === true
        ? formDefaultsFromDraft(itemType, read, result.data.draftFields)
        : read,
    ...(draftCellarId === null ? {} : { draftCellarId }),
    itemOnboardingId: onboarding.id,
    confidence: onboarding.confidence ?? 0,
    // A resumed draft sends no ids; the session remembers what it read.
    labelSent:
      sent ||
      onboarding.frontLabelImageId !== null ||
      onboarding.backLabelImageId !== null,
    ...(onboarding.frontLabelImageId === null
      ? {}
      : { frontLabelFileId: onboarding.frontLabelImageId }),
  };
};

/**
 * {@link readDefaults} as the machine's actor. With `draft`, the read is
 * tracked in `captureDrafts` (X05): a read already tracked under this session
 * id — still running, or settled while the person was away — is adopted
 * rather than asked again.
 */
export const fetchDefaults = fromPromise(
  ({ input }: { input: FetchDefaultsInput }): Promise<DefaultValuesResult> =>
    input.draft === undefined
      ? readDefaults(input)
      : captureDrafts.track(input.itemOnboardingId, input.draft, () =>
          readDefaults(input),
        ),
);
