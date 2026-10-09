import type { Metadata } from "next";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";

export const metadata: Metadata = { title: "Add a sake" };

/**
 * `/cellars/[cellarId]/sakes/add` — `82450ad1`'s `AddSake`: the onboarding
 * wizard with the cellar pinned, so the item is filed as a bottle (with its
 * display photo) once it exists.
 */
export default async function AddSake({
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
      type="SAKE"
      cellarId={cellarId}
      resumeId={typeof draft === "string" ? draft : undefined}
    />
  );
}
