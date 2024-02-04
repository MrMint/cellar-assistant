"use client";

import { useUserId } from "@nhost/nextjs";
import { isNil } from "ramda";
import { CoffeeOnboarding } from "@/components/coffee/CoffeeOnboarding";

const AddCoffee = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");
  return <CoffeeOnboarding cellarId={cellarId} userId={userId} />;
};

export default AddCoffee;
