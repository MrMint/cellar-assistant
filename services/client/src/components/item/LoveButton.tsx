"use client";

import { useCallback } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import { Heart } from "@/components/app/parts/Heart";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { useOptimisticToggle } from "@/hooks/useOptimisticToggle";
import { SetFavoriteMutation } from "@/lib/api/items";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";

/**
 * The item page's heart — D27's **Love** ("Favorites" survives only in the
 * data model) — beside the name in the hero, drawn by F2b's `Heart` (KIT § 2:
 * a 24 glyph in a 44 target, the pop and the success cue on). Optimistic like
 * `ItemCard`'s (X24): a refused write falls back with a toast. `setFavorite`
 * sets the state the tap asked for, so a retry cannot flip it back;
 * `useOptimisticToggle` never overlaps two writes and trusts the payload's
 * `favorited` over its guess.
 */
export function LoveButton({
  itemId,
  type,
  name,
  isFavorite,
}: {
  itemId: string;
  type: ApiItemType;
  name: string;
  isFavorite: boolean;
}) {
  const [, setFavorite] = useMutation(SetFavoriteMutation);
  const commit = useCallback(
    async (next: boolean) => {
      const response = await setFavorite({ itemId, type, favorited: next });
      if (response.error) {
        return {
          ok: false as const,
          message: failureFromTransport(response.error).message,
        };
      }
      const result = unwrapResult(
        response.data?.setFavorite,
        "SetFavoritePayload",
      );
      return result.ok
        ? { ok: true as const, value: result.data.favorited }
        : { ok: false as const, message: result.error.message };
    },
    [setFavorite, itemId, type],
  );
  const love = useOptimisticToggle({
    value: isFavorite,
    commit,
    onError: (message) =>
      notify("Couldn’t update Loved", { tone: "error", description: message }),
  });

  return (
    <span aria-busy={love.pending || undefined} className="-mr-2 shrink-0">
      <Heart
        size="page"
        on={love.on}
        onToggle={() => love.toggle()}
        label={`Love ${name}`}
      />
    </span>
  );
}
