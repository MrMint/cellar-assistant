"use client";

import { BottomSheet } from "@/components/app/BottomSheet";
import { Add, Camera, Success, Warning } from "@/components/app/icons";
import { TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type SuccessSheetProps = {
  open: boolean;
  itemType: ApiItemType;
  /** The filed item's name, when known. */
  itemName?: string;
  /** The cellar the bottle went into; absent when only the item was made. */
  cellarName?: string;
  /** The front-label photo, as the thumbnail (a data URL or a file URL). */
  photo?: string;
  /** The item was saved but its photo was not. */
  imageError?: string;
  onSnapAnother: () => void;
  /**
   * "Open it now", only for a bottle in a cellar: its page, where opening it
   * is one tap (X06's call — the sheet itself uncorks nothing).
   */
  onOpenNow?: () => void;
  /** Dismissing the sheet, and "View item" when there is no bottle. */
  onDone: () => void;
};

/**
 * N21's real ending (design §5 moment 3, "Into the cellar", before its
 * choreography lands): **+1 bottle**, then what people do next — snap
 * another (a haul is several bottles) or open it now (it is being opened
 * tonight), which shows the bottle's page with its own "Open it!" rather than
 * uncorking it from here: a tap meant as "show me" must not write an opening
 * into the bottle's log (X06). Dismissing the sheet also lands on the bottle,
 * the old "No" on "Would you like to add another item?"; with no cellar the
 * second action is "View item".
 *
 * The check pops in (≤ 400 ms, under the celebrate budget); under reduced
 * motion it simply is there (design §4.9).
 */
export function SuccessSheet({
  open,
  itemType,
  itemName,
  cellarName,
  photo,
  imageError,
  onSnapAnother,
  onOpenNow,
  onDone,
}: SuccessSheetProps) {
  const inCellar = cellarName !== undefined;
  // W-21: "Snap another" only after a photo; a typed-in add goes again the
  // same way it came, so the button says "Add another".
  const photographed = photo !== undefined;
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onDone();
      }}
      title={inCellar ? "+1 bottle" : "Added to the catalog"}
      description={
        inCellar
          ? `${itemName ?? "Your bottle"} is in ${cellarName}.`
          : `${itemName ?? "Your item"} is ready to rate, rank and share.`
      }
      footer={
        <div className="flex flex-col gap-2">
          <Button onClick={onSnapAnother}>
            {photographed ? <Camera aria-hidden /> : <Add aria-hidden />}
            {photographed ? "Snap another" : "Add another"}
          </Button>
          {onOpenNow !== undefined ? (
            <Button variant="secondary" onClick={onOpenNow}>
              Open it now
            </Button>
          ) : (
            <Button variant="secondary" onClick={onDone}>
              {inCellar ? "View bottle" : "View item"}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-center gap-4 pb-2">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-surface-2">
          {photo === undefined ? (
            <span className="flex size-full items-center justify-center">
              <TypeGlyph type={itemType} className="size-8" />
            </span>
          ) : (
            // biome-ignore lint/performance/noImgElement: the capture (a data URL) or its presigned file URL; nothing for /_next/image to optimise.
            <img src={photo} alt="" className="size-full object-cover" />
          )}
          <span
            aria-hidden
            className="zoom-in-50 fade-in-0 absolute right-1 bottom-1 flex size-6 animate-in items-center justify-center rounded-full bg-background text-success duration-(--ca-dur-long) ease-enter motion-reduce:animate-none"
          >
            <Success className="size-5" />
          </span>
        </div>
        <p className="type-body text-ink-2">
          {inCellar
            ? "Rate it when you open it — it'll be waiting in your cellar."
            : "Add it to a cellar from its page whenever you buy a bottle."}
        </p>
      </div>
      {imageError !== undefined && (
        <Alert className="mb-2">
          <Warning aria-hidden />
          <AlertDescription className="text-ink-1">
            <p>The photo was not saved: {imageError}</p>
          </AlertDescription>
        </Alert>
      )}
    </BottomSheet>
  );
}
