"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CellarCard } from "./CellarCard";

type User = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type ItemCounts = {
  wines: number;
  beers: number;
  spirits: number;
  coffees: number;
  sakes: number;
  teas: number;
};

type CellarCardClientProps = {
  userId: string;
  cellar: {
    id: string;
    name: string;
    createdBy: User;
    coOwners: User[];
    itemCounts: ItemCounts;
  };
  /**
   * Called before either way off the card (its link, its edit button) — the
   * grid saves its scroll position here, which the old wrapper `Box` did with
   * an `onClick` on a plain `div`.
   */
  onBeforeNavigate?: () => void;
};

export function CellarCardClient({
  userId,
  cellar,
  onBeforeNavigate,
}: CellarCardClientProps) {
  const router = useRouter();

  const handleEditClick = useCallback(
    (cellarId: string) => {
      onBeforeNavigate?.();
      router.push(`/cellars/${cellarId}/edit`);
    },
    [router, onBeforeNavigate],
  );

  return (
    <CellarCard
      userId={userId}
      cellar={cellar}
      onEditClick={handleEditClick}
      onNavigate={onBeforeNavigate}
    />
  );
}
