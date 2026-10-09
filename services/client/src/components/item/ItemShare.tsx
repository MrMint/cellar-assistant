"use client";

import { useCallback } from "react";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { useShareLink } from "@/lib/share/use-share-link";
import { itemShareUrl } from "./adapter";

export type ItemShareProps = {
  itemId: string;
  itemType: ApiItemType;
  /** Names the item in the share sheet ("Barolo 2016 on Cellar Assistant"). */
  itemName?: string;
};

/**
 * The item and bottle pages' Share (N26: the bar's trailing action). X17 made
 * it the app's one share behaviour (`lib/share/share-link.ts`): the system
 * share sheet, else the link copied with a toast. The URL is the item's own
 * page — from a bottle too, so a share never carries the cellar — and it is
 * the public page for someone signed out (`src/proxy.ts`).
 *
 * The QR code this used to fall back to went with that change; the share
 * sheet and the clipboard are what a phone and a desktop each reach for.
 */
export function useItemShare({ itemId, itemType, itemName }: ItemShareProps) {
  const share = useShareLink();
  return useCallback(
    () =>
      share({
        url: itemShareUrl(window.location.origin, itemType, itemId),
        ...(itemName === undefined
          ? {}
          : { title: itemName, text: `${itemName} on Cellar Assistant` }),
      }),
    [share, itemId, itemType, itemName],
  );
}
