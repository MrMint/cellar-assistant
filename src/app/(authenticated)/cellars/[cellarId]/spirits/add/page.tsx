"use client";

import { useUserId } from "@nhost/nextjs";
import { isNil } from "ramda";
import { SpiritOnboarding } from "@/components/spirit/SpiritOnboarding";

const AddSpirit = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");
  return <SpiritOnboarding cellarId={cellarId} userId={userId} />;
};

export default AddSpirit;
