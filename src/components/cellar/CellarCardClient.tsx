"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { CellarCard } from "./CellarCard";

type User = {
  id: string;
  displayName: string;
  avatarUrl: string;
};

type CellarCardClientProps = {
  userId: string;
  cellar: {
    id: string;
    name: string;
    createdBy: User;
    coOwners: User[];
  };
  index: number;
};

export function CellarCardClient({
  userId,
  cellar,
  index,
}: CellarCardClientProps) {
  const router = useRouter();

  const handleEditClick = useCallback(
    (cellarId: string) => router.push(`/cellars/${cellarId}/edit`),
    [router],
  );

  return (
    <CellarCard
      userId={userId}
      cellar={cellar}
      index={index}
      onEditClick={handleEditClick}
    />
  );
}
