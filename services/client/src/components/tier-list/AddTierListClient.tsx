"use client";

/**
 * `/tier-lists/add`'s form: New list as a page, for a link or a cold open
 * (the index opens the same form as a sheet). Cancel goes back to the index.
 */

import { useCallback } from "react";
import { useNavigate } from "@/components/app/useNavigate";
import { TierListForm } from "./TierListForm";

export function AddTierListClient() {
  const navigate = useNavigate();

  const handleSubmitted = useCallback(
    (id: string) => {
      navigate.push(`/tier-lists/${id}`);
    },
    [navigate],
  );

  return (
    <TierListForm
      onSubmitted={handleSubmitted}
      onCancel={() => navigate.push("/tier-lists")}
    />
  );
}
