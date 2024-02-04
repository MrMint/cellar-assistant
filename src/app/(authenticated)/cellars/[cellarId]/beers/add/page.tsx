"use client";

import { useUserId } from "@nhost/nextjs";
import { isNil } from "ramda";
import { BeerOnboarding } from "@/components/beer/BeerOnboarding";

const AddBeer = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");
  return <BeerOnboarding cellarId={cellarId} userId={userId} />;
};

export default AddBeer;
