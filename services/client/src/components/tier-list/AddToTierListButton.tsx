"use client";

/**
 * `82450ad1:src/components/tier-list/AddToTierListButton.tsx`, restored for
 * the item and place pages. `userId` is accepted for old call sites only.
 */

import { useState } from "react";
import { ICON_STROKE, Ranked } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { AddToTierListModal } from "./AddToTierListModal";
import type { TierListEntityType } from "./constants";

type AddToTierListButtonProps = {
  entityId: string;
  entityType: TierListEntityType;
  entityName: string;
  /** The old query's `$userId`; unused — the API knows the viewer. */
  userId?: string;
};

/**
 * Trigger button + modal for adding an entity (item or place) to one of the
 * current user's tier lists.
 */
export const AddToTierListButton = ({
  entityId,
  entityType,
  entityName,
}: AddToTierListButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ranked aria-hidden strokeWidth={ICON_STROKE} />
        Add to Tier List
      </Button>
      <AddToTierListModal
        open={open}
        onClose={() => setOpen(false)}
        entityId={entityId}
        entityType={entityType}
        entityName={entityName}
      />
    </>
  );
};
