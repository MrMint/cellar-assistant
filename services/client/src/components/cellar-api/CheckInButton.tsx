"use client";

import { useState } from "react";
import { Cocktail } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { LogDrinkSheet } from "@/components/drink-log/LogDrinkSheet";
import { useDrinkLogFeedback } from "@/components/drink-log/useDrinkLogFeedback";
import { Button } from "@/components/ui/button";

/**
 * "I drank some of this" — the cellar overview's check-in button, which opens
 * the drink-log sheet (X02) with this bottle as the source.
 *
 * It used to be a menu of two mutations ("Just me" → `checkIn`, "Me and
 * friends…" → `bulkCheckIn`). The sheet covers both: "Log it" with nothing
 * filled in is "just me", and "Who with" adds friends, each of whom gets the
 * drink in their own log (the `bulkCheckIn` rule — friends only, all or
 * nothing). It also takes an optional score for this glass (never the
 * review), a note with suggested flavours, a place and a photo.
 *
 * The cellar must be visible to the viewer, not owned — checking in to a
 * friend's bottle at their table is the point. The id the sheet mints makes a
 * retry the same log, and is what the toast's Undo deletes.
 */
export function CheckInButton({
  cellarId,
  cellarItemId,
  itemType,
  itemId,
  itemName,
  onCheckedIn,
}: {
  cellarId: string;
  cellarItemId: string;
  itemType: ApiItemType;
  /** The catalog item the bottle holds. */
  itemId: string;
  itemName: string;
  onCheckedIn?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const onSaved = useDrinkLogFeedback({ itemName, onChanged: onCheckedIn });

  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Cocktail aria-hidden />
        Check in
      </Button>
      <LogDrinkSheet
        open={open}
        onOpenChange={setOpen}
        subject={{
          itemType,
          itemId,
          itemName,
          bottle: { cellarId, cellarItemId },
        }}
        onSaved={onSaved}
      />
    </>
  );
}
