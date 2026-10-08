import { fromPromise } from "xstate";
import { CloseItemOnboardingMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import type { CloseOnboardingInput } from "./types";

/**
 * The bottle filed was an item the catalogue already held (the quick-add, or
 * "+1 bottle"), so the onboarding `analyze` opened will never be confirmed:
 * close it as `MATCHED` instead of leaving it `COMPLETED` forever.
 *
 * Bookkeeping only — the bottle is already filed — so it never throws: a
 * failure resolves `false` and the wizard carries on.
 */
export const closeOnboarding = fromPromise(
  async ({
    input: { urqlClient, itemOnboardingId },
  }: {
    input: CloseOnboardingInput;
  }): Promise<boolean> => {
    try {
      const response = await urqlClient
        .mutation(CloseItemOnboardingMutation, {
          onboardingId: itemOnboardingId,
        })
        .toPromise();
      return unwrapResult(response.data?.closeItemOnboarding, "ItemOnboarding")
        .ok;
    } catch {
      return false;
    }
  },
);
