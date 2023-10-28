"use client";

import { WineOnboarding } from "@/components/wine/WineOnboarding";

const AddWine = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return (
    <WineOnboarding
      cellarId={cellarId}
      returnUrl={`/cellars/${cellarId}/items`}
    />
  );
};

export default AddWine;
