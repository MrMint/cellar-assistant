"use client";

import { useState } from "react";
import { Add } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AddToTierListModal } from "@/components/tier-list/AddToTierListModal";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { Button } from "@/components/ui/button";

/** "Your rank"'s outlined "Add to a list" (CROSS-LOT: the secondary). */
export function AddToListButton({
  itemId,
  itemType,
  itemName,
}: {
  itemId: string;
  itemType: ApiItemType;
  itemName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Add aria-hidden />
        Add to a list
      </Button>
      <AddToTierListModal
        open={open}
        onClose={() => setOpen(false)}
        entityId={itemId}
        entityType={itemType.toLowerCase() as TierListEntityType}
        entityName={itemName}
      />
    </>
  );
}
