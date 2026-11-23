"use client";

/** `82450ad1:src/components/tier-list/AddTierListClient.tsx`, verbatim. */

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

  return <TierListForm onSubmitted={handleSubmitted} />;
}
