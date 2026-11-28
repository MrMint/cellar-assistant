"use client";

/**
 * `/tier-lists/[id]/edit`'s form: List details as a page, for a link or a
 * cold open (the list page opens the same form as a sheet). Save and Cancel
 * both go back to the list.
 */

import { useCallback } from "react";
import { useNavigate } from "@/components/app/useNavigate";
import type { ResultOf } from "@/lib/api/graphql";
import type { TierListEditFragment } from "./fragments";
import { ListDetailsForm } from "./lists/ListSheets";

interface EditTierListClientProps {
  tierList: ResultOf<typeof TierListEditFragment>;
}

export function EditTierListClient({ tierList }: EditTierListClientProps) {
  const navigate = useNavigate();
  const back = useCallback(() => {
    navigate.push(`/tier-lists/${tierList.id}`);
  }, [navigate, tierList.id]);

  return (
    <ListDetailsForm tierList={tierList} onSubmitted={back} onCancel={back} />
  );
}
