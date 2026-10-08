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

/** The brand an item shows — its primary link, or its first. */
export type ShownBrand = { brandId: string; name: string };

export type BrandChange =
  | { ok: true; changed: false }
  | { ok: true; changed: true; from: ShownBrand | null; to: ShownBrand | null }
  | { ok: false; error: ApiFailure };

/** Whether `name` names something other than `shown` (case and spacing aside). */
export const isBrandChange = (
  shown: ShownBrand | null,
  name: string,
): boolean =>
  (shown?.name.trim().toLowerCase() ?? "") !== name.trim().toLowerCase();

/** The primary link's brand, or the first one's — what the item page shows. */
export const shownBrandOf = (
  links: readonly {
    isPrimary?: boolean | null;
    brand?: { id: string; name: string } | null;
  }[],
): ShownBrand | null => {
  const link = links.find((candidate) => candidate.isPrimary) ?? links[0];
  return link?.brand === null || link?.brand === undefined
    ? null
    : { brandId: link.brand.id, name: link.brand.name };
};

export type BrandChanger = {
  /** Make the item's brand `toName` (blank: none), from the one it shows. */
  change: (from: ShownBrand | null, toName: string) => Promise<BrandChange>;
  /** Put `from` back where `to` is now. */
  undo: (
    from: ShownBrand | null,
    to: ShownBrand | null,
  ) => Promise<{ ok: true } | { ok: false; error: ApiFailure }>;
};

export const useBrandChange = (
  type: ApiItemType,
  itemId: string,
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
          ? { ok: true, changed: true, from, to: null }
          : { ok: false, error: unlinked.error };
      }
      const resolved = unwrapResult(
        (await resolveBrand({ name })).data?.resolveBrand,
        "Brand",
      );
      if (!resolved.ok) return { ok: false, error: resolved.error };
      const to = { brandId: resolved.data.id, name: resolved.data.name };
      const replaced = await replace(to.brandId, from?.brandId ?? null);
      return replaced.ok
        ? { ok: true, changed: true, from, to }
        : { ok: false, error: replaced.error };
    },
    undo: async (from, to) => {
      if (from === null) {
        if (to === null) return { ok: true };
        const unlinked = await unlink(to.brandId);
        return unlinked.ok
          ? { ok: true }
          : { ok: false, error: unlinked.error };
      }
      const replaced = await replace(from.brandId, to?.brandId ?? null);
      return replaced.ok ? { ok: true } : { ok: false, error: replaced.error };
    },
  };
};
