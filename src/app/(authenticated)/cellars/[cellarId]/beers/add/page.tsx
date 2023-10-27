"use client";

import { BeerOnboarding } from "@/components/beer/BeerOnboarding";

const AddBeer = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return (
    <BeerOnboarding
      cellarId={cellarId}
      returnUrl={`/cellars/${cellarId}/items`}
    />
  );
};

export default AddBeer;
