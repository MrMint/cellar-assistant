import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";

/**
 * `/cellars/[cellarId]/teas/add` — `82450ad1`'s `AddTea`: the onboarding
 * wizard with the cellar pinned, so the item is filed as a bottle (with its
 * display photo) once it exists.
 */
export default async function AddTea({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;

  return <ItemOnboarding type="TEA" cellarId={cellarId} />;
}
