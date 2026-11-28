/**
 * X19 / D8 — changing an item's brand, for the edit form's BrandPicker and the
 * item page's "Wrong brand? Change it". Both go through here so they cannot
 * disagree about what a change *is*:
 *
 * - a new name is `resolveBrand` (find-or-create — the only brand creation a
 *   client has) and then `replaceItemBrand`, which makes it the primary and
 *   unlinks the brand the page showed **in one actor turn**;
 * - a cleared name unlinks the brand that was shown;
 * - the same name (any case) is no change at all.
 *
 * `undo` puts the previous brand back the same way, so the toast's Undo is one
 * more call, not a confirm. Every call is urql's `useMutation` (no hand-rolled
 * `.toPromise()` in components — `no-to-promise.test.ts`); the sequence is
 * only ever run by a tap, so there is no newer request for it to race.
 */
import { useMutation } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  ReplaceItemBrandMutation,
  ResolveBrandMutation,
  UnlinkItemBrandMutation,
} from "@/lib/api/item-correction";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import type { ShownBrand } from "./shown-brand";

export { type ShownBrand, shownBrandOf } from "./shown-brand";

/** A change that happened — what an Undo needs to put it back exactly. */
export type AppliedBrandChange = {
  from: ShownBrand | null;
  to: ShownBrand | null;
  /**
   * `to` was already one of the item's (secondary) brands before the change
   * promoted it. Undo then demotes it again instead of unlinking it — or the
   * Undo would delete a link the person never asked to lose.
   */
  toWasLinked: boolean;
};

export type BrandChange =
  | { ok: true; changed: false }
  | ({ ok: true; changed: true } & AppliedBrandChange)
  | { ok: false; error: ApiFailure };

/** Whether `name` names something other than `shown` (case and spacing aside). */
export const isBrandChange = (
  shown: ShownBrand | null,
  name: string,
): boolean =>
  (shown?.name.trim().toLowerCase() ?? "") !== name.trim().toLowerCase();

export type BrandChanger = {
  /** Make the item's brand `toName` (blank: none), from the one it shows. */
  change: (from: ShownBrand | null, toName: string) => Promise<BrandChange>;
  /** Put `from` back where `to` is now, and `to` back where it was. */
  undo: (
    change: AppliedBrandChange,
  ) => Promise<{ ok: true } | { ok: false; error: ApiFailure }>;
};

/**
 * `linkedBrandIds`: every brand the item is linked to now (not only the
 * shown one), so a change to a brand it already carried can be undone
 * without losing that link.
 */
export const useBrandChange = (
  type: ApiItemType,
  itemId: string,
  linkedBrandIds: readonly string[] = [],
): BrandChanger => {
  const [, resolveBrand] = useMutation(ResolveBrandMutation);
  const [, replaceItemBrand] = useMutation(ReplaceItemBrandMutation);
  const [, unlinkItemBrand] = useMutation(UnlinkItemBrandMutation);

  const unlink = async (brandId: string) =>
    unwrapResult(
      (await unlinkItemBrand({ type, itemId, brandId })).data?.unlinkItemBrand,
      "UnlinkedItemBrand",
    );
  const replace = async (brandId: string, replacesBrandId: string | null) =>
    unwrapResult(
      (await replaceItemBrand({ type, itemId, brandId, replacesBrandId })).data
        ?.replaceItemBrand,
      "ItemBrand",
    );

  return {
    change: async (from, toName) => {
      const name = toName.trim();
      if (!isBrandChange(from, name)) return { ok: true, changed: false };
      if (name === "") {
        if (from === null) return { ok: true, changed: false };
        const unlinked = await unlink(from.brandId);
        return unlinked.ok
          ? { ok: true, changed: true, from, to: null, toWasLinked: false }
          : { ok: false, error: unlinked.error };
      }
      const resolved = unwrapResult(
        (await resolveBrand({ name })).data?.resolveBrand,
        "Brand",
      );
      if (!resolved.ok) return { ok: false, error: resolved.error };
      const to = { brandId: resolved.data.id, name: resolved.data.name };
      const toWasLinked =
        to.brandId !== from?.brandId && linkedBrandIds.includes(to.brandId);
      const replaced = await replace(to.brandId, from?.brandId ?? null);
      return replaced.ok
        ? { ok: true, changed: true, from, to, toWasLinked }
        : { ok: false, error: replaced.error };
    },
    undo: async ({ from, to, toWasLinked }) => {
      if (from === null) {
        if (to === null) return { ok: true };
        const unlinked = await unlink(to.brandId);
        return unlinked.ok
          ? { ok: true }
          : { ok: false, error: unlinked.error };
      }
      // A brand the item already carried is demoted back to a plain link
      // (`replaceItemBrand` demotes every other primary), not unlinked.
      const replaced = await replace(
        from.brandId,
        toWasLinked ? null : (to?.brandId ?? null),
      );
      return replaced.ok ? { ok: true } : { ok: false, error: replaced.error };
    },
  };
};
