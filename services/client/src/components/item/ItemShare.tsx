"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ShareSheet } from "@/components/app/overlays/ShareSheet";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { useShareLink } from "@/lib/share/use-share-link";
import { itemShareUrl } from "./adapter";

export type ItemShareProps = {
  itemId: string;
  itemType: ApiItemType;
  /** Names the item in the share sheet ("Barolo 2016 on Cellar Assistant"). */
  itemName?: string;
};

const noop = () => () => {};

/** The page's origin, after hydration (none on the server). */
function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
}

/**
 * The item and bottle pages' share link, without a sheet (X17's one share
 * behaviour, `lib/share/share-link.ts`: the system share sheet, else the link
 * copied with a toast). The URL is the item's own page, from a bottle too, so
 * a share never carries the cellar, and it is the public page for someone
 * signed out (`src/proxy.ts`).
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

/**
 * The item's Share (L14, L34): F2a's ShareSheet with a real QR code for the
 * item's own page, then Copy link and More ways (the system share sheet,
 * where there is one). "Anyone with the link": the item page is public.
 */
export function ItemShareSheet({
  open,
  onOpenChange,
  itemId,
  itemType,
  itemName,
}: ItemShareProps & {
  itemName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const origin = useOrigin();
  return (
    <ShareSheet
      open={open}
      onOpenChange={onOpenChange}
      title={itemName}
      subtitle="Share · anyone with the link"
      url={itemShareUrl(origin, itemType, itemId)}
    />
  );
}
