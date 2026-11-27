"use client";

import { useCallback } from "react";
import { useMutation } from "urql";
import { notify } from "@/components/app/notify";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { useOptimisticToggle } from "@/hooks/useOptimisticToggle";
import { SetFavoriteMutation } from "@/lib/api/items";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";

/**
 * A tile's heart: `setFavorite` (sets, never flips, so a retry cannot undo
 * itself), optimistic, with the payload's answer trusted over the guess —
 * the same contract `ItemCard` keeps.
 */
export function useFavorite(
  itemId: string,
  type: ApiItemType,
  value: boolean,
): { on: boolean; set: (next: boolean) => void } {
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
  const toggle = useOptimisticToggle({
    value,
    commit,
    onError: (message) =>
      notify("Couldn't update your favourites", {
        tone: "error",
        description: message,
      }),
  });
  return {
    on: toggle.on,
    set: (next) => {
      if (next !== toggle.on) toggle.toggle();
    },
  };
}
