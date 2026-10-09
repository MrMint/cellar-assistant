import { fromPromise } from "xstate";
import { OpenCellarItemMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import type { OpenCellarItemInput } from "./types";

/**
 * N21's "Open it now" on the success sheet: the bottle just filed is opened
 * (`openCellarItem`, idempotent) before its page is shown. `false` on any
 * refusal — the bottle page has its own "Open it", so a failure here costs a
 * tap, never the bottle.
 */
export const openCellarItem = fromPromise(
  async ({
    input: { urqlClient, cellarId, cellarItemId },
  }: {
    input: OpenCellarItemInput;
  }): Promise<boolean> => {
    const response = await urqlClient
      .mutation(OpenCellarItemMutation, { cellarId, cellarItemId })
      .toPromise();
    return unwrapResult(response.data?.openCellarItem, "CellarItem").ok;
  },
);
