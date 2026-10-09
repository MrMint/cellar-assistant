"use client";

import { useCallback } from "react";
import { useMutation } from "urql";
import { IconButton } from "@/components/app/IconButton";
import { Love } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { TogglePop } from "@/components/app/TogglePop";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { useOptimisticToggle } from "@/hooks/useOptimisticToggle";
import { SetFavoriteMutation } from "@/lib/api/items";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";

/**
 * The item page's heart — D27's **Love** ("Favorites" survives only in the
 * data model) — beside the name in the hero. Optimistic like `ItemCard`'s
 * (X24): the tapped state draws in the tap's own frame and pops, and a
 * refused write falls back with a toast. `setFavorite` sets the state the tap
 * asked for, so a retry cannot flip it back; `useOptimisticToggle` never
 * overlaps two writes and trusts the payload's `favorited` over its guess.
 * Claret when set (design §3.1).
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
      notify("Couldn't update Loved", { tone: "error", description: message }),
  });

  return (
    <IconButton
      onClick={(event) => {
        event.stopPropagation();
        love.toggle();
      }}
      aria-label={`Love ${name}`}
      aria-pressed={love.on}
      aria-busy={love.pending || undefined}
      className="-mr-2 shrink-0"
    >
      <TogglePop on={love.on} pop={love.pending}>
        <Love
          aria-hidden
          className={cn(
            "size-7",
            love.on ? "fill-brand text-brand" : "text-ink-2",
          )}
        />
      </TogglePop>
    </IconButton>
  );
}
