"use client";

import { BeerOnboarding } from "@/components/beer/BeerOnboarding";

const AddBeer = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return <BeerOnboarding cellarId={cellarId} />;
};

export default AddBeer;
