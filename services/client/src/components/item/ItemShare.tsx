"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemShareUrl } from "./adapter";

export type ItemShareProps = {
  itemId: string;
  itemType: ApiItemType;
};

/**
 * `82450ad1:src/components/item/ItemShare.tsx`, restored with two fixes the
 * inventory recorded (§7): `navigator.canShare` is feature-tested before it is
 * called (it is absent on desktop Firefox, where the old button threw), and
 * the QR code carries an absolute URL with its scheme — the old value was
 * `host/wines/<id>`, which a phone camera reads as text, not a link.
 *
 * The "Share" button moved into the page's `AppBar` (N26: Share is the bar's
 * trailing action), so this is now the behaviour behind it — the native share
 * sheet, else the QR code — and the dialog that shows the code.
 */
export function useItemShare({ itemId, itemType }: ItemShareProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const share = async () => {
    const target = itemShareUrl(window.location.origin, itemType, itemId);
    setUrl(target);
    if (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ url: target })
    ) {
      try {
        await navigator.share({ url: target });
        return;
      } catch {
        // Dismissed, or refused: fall through to the QR code.
      }
    }
    setOpen(true);
  };

  return { share, open, setOpen, url };
}

/** "Link to item page": the QR code on white, so any camera can read it. */
export function ItemShareDialog({
  open,
  onOpenChange,
  url,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Link to item page"
    >
      <div className="mx-auto w-fit rounded-md bg-white p-4">
        <QRCode value={url} />
      </div>
    </ResponsiveDialog>
  );
}
