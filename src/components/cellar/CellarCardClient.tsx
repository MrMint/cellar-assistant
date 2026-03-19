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
};

export function CellarCardClient({ userId, cellar }: CellarCardClientProps) {
  const router = useRouter();

  const handleEditClick = useCallback(
    (cellarId: string) => router.push(`/cellars/${cellarId}/edit`),
    [router],
  );

  return (
    <CellarCard userId={userId} cellar={cellar} onEditClick={handleEditClick} />
  );
}
