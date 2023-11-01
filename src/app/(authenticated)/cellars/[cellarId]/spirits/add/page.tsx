"use client";

import { SpiritOnboarding } from "@/components/spirit/SpiritOnboarding";

const AddSpirit = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  return <SpiritOnboarding cellarId={cellarId} />;
};

export default AddSpirit;
