"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { TierListForm } from "./TierListForm";

export function AddTierListClient() {
  const router = useRouter();

  const handleSubmitted = useCallback(
    (id: string) => {
      router.push(`/tier-lists/${id}`);
    },
    [router],
  );

  return <TierListForm onSubmitted={handleSubmitted} />;
}
