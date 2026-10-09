import type { Metadata } from "next";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";

export const metadata: Metadata = { title: "Add a beer" };

/**
 * `/cellars/[cellarId]/beers/add` — `82450ad1`'s `AddBeer`: the onboarding
 * wizard with the cellar pinned, so the item is filed as a bottle (with its
 * display photo) once it exists.
 */
export default async function AddBeer({
  params,
  searchParams,
}: {
  params: Promise<{ cellarId: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}) {
  const { cellarId } = await params;
  const { draft } = await searchParams;

  return (
    <ItemOnboarding
      type="BEER"
      cellarId={cellarId}
      resumeId={typeof draft === "string" ? draft : undefined}
    />
  );
}
