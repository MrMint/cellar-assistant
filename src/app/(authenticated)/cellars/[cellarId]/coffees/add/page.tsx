"use client";

import { CoffeeOnboarding } from "@/components/coffee/CoffeeOnboarding";

const AddCoffee = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return <CoffeeOnboarding cellarId={cellarId} />;
};

export default AddCoffee;
