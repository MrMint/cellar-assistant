"use client";

import { useUserId } from "@nhost/nextjs";
import { isNil } from "ramda";
import { WineOnboarding } from "@/components/wine/WineOnboarding";

const AddWine = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");
  return <WineOnboarding cellarId={cellarId} userId={userId} />;
};

export default AddWine;
