import type { Client } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { ItemFormValues } from "@/components/item/ItemForm";
import {
  ConfirmItemOnboardingMutation,
  EnsureBarcodeMutation,
  ItemSummaryQuery,
  LinkBarcodeItemMutation,
} from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { barcodeProblem, normalizeBarcode } from "@/lib/items/barcode";
import { confirmInputFrom } from "../adapter";

/**
 * How long to wait for the confirmed item to become readable, and how often to
 * ask. `confirmItemOnboarding` names ids for rows the outbox has not written
 * yet (§8.5); locally the row lands in about two seconds, and thirty covers a
 * retried outbox row or two.
 */
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

export type CreateOnboardedItemInput = {
  urqlClient: Client;
  type: ApiItemType;
  onboardingId: string;
  values: ItemFormValues;
  brandName: string;
  /** What the form's Barcode field holds when it is submitted. */
  barcode: string;
  /** The code the session was opened with (scanned), if any. */
  sessionBarcode?: string;
};

/**
 * The old `{T}Form` create path (`insert_{type}s_one`, barcode `on_conflict`,
 * then `ensureAndLinkBrand` in the background) as the new API does it:
 *
 * 1. `confirmItemOnboarding` — the item, its brand (`brandName`, resolved
 *    find-or-create server-side) and, for a scanned code, its barcode. Safe to
 *    re-send: the ids are derived from the onboarding id.
 * 2. Poll `item(type:, id:)` until the outbox has written the row — the next
 *    step (`addItemToCellar`, `attachItemImage`) needs it to exist, and a
 *    redirect straight to it lands on "not found" half the time.
 * 3. A code typed into the Barcode field that is not the scanned one goes
 *    through `ensureBarcode` + `linkBarcodeItem` with no type (X11) — after
 *    the poll, because `linkItem` authorises against the item's creator.
 *
 * Throws with a message for the form's root error. Every step is idempotent,
 * so submitting again after a failure resumes rather than duplicates.
 */
export const createOnboardedItem = async ({
  urqlClient,
  type,
  onboardingId,
  values,
  brandName,
  barcode,
  sessionBarcode,
}: CreateOnboardedItemInput): Promise<string> => {
  const typed = normalizeBarcode(barcode);
  const problem = typed === "" ? null : barcodeProblem(typed);
  if (problem !== null) {
    throw new Error(`${problem} Clear the barcode field to save without one.`);
  }

  const confirmed = unwrapResult(
    (
      await urqlClient
        .mutation(ConfirmItemOnboardingMutation, {
          onboardingId,
          input: confirmInputFrom(type, values, brandName),
        })
        .toPromise()
    ).data?.confirmItemOnboarding,
    "ConfirmedItemOnboarding",
  );
  if (!confirmed.ok) {
    throw new Error(
      confirmed.error.code === "VALIDATION" ||
        confirmed.error.code === "FORBIDDEN"
        ? confirmed.error.message
        : "Something went wrong please try again...",
    );
  }
  const { itemId } = confirmed.data;

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const found = unwrapResult(
      (
        await urqlClient
          .query(
            ItemSummaryQuery,
            { itemId, type },
            { requestPolicy: "network-only" },
          )
          .toPromise()
      ).data?.item,
      "QueryItemSuccess",
    );
    if (found.ok) break;
    if (Date.now() >= deadline) {
      throw new Error(
        "Saved, but the item is still being written. Press Add again in a moment — it will pick up where it left off.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (typed !== "" && typed !== normalizeBarcode(sessionBarcode ?? "")) {
    const ensured = unwrapResult(
      (
        await urqlClient
          .mutation(EnsureBarcodeMutation, { code: typed, type: null })
          .toPromise()
      ).data?.ensureBarcode,
      "Barcode",
    );
    if (!ensured.ok) {
      throw new Error(
        `The item was saved; the barcode was not: ${ensured.error.message}`,
      );
    }
    const linked = unwrapResult(
      (
        await urqlClient
          .mutation(LinkBarcodeItemMutation, {
            code: typed,
            itemId,
            itemType: type,
          })
          .toPromise()
      ).data?.linkBarcodeItem,
      "LinkedBarcodeItem",
    );
    if (!linked.ok) {
      throw new Error(
        `The item was saved; the barcode was not: ${linked.error.message}`,
      );
    }
  }

  return itemId;
};
