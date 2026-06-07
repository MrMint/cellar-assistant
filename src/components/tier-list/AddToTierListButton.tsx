"use client";

import { Button } from "@mui/joy";
import { useState } from "react";
import { MdFormatListNumbered } from "react-icons/md";
import { AddToTierListModal } from "./AddToTierListModal";
import type { TierListEntityType } from "./constants";

type AddToTierListButtonProps = {
  entityId: string;
  entityType: TierListEntityType;
  entityName: string;
  userId: string;
};

/**
 * Trigger button + modal for adding an entity (item or place) to one of the
 * current user's tier lists.
 */
export const AddToTierListButton = ({
  entityId,
  entityType,
  entityName,
  userId,
}: AddToTierListButtonProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outlined"
        color="neutral"
        startDecorator={<MdFormatListNumbered />}
        onClick={() => setOpen(true)}
      >
        Add to Tier List
      </Button>
      <AddToTierListModal
        open={open}
        onClose={() => setOpen(false)}
        entityId={entityId}
        entityType={entityType}
        entityName={entityName}
        userId={userId}
      />
    </>
  );
};
