import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";

/**
 * `/cellars/[cellarId]/beers/add` — `82450ad1`'s `AddBeer`: the onboarding
 * wizard with the cellar pinned, so the item is filed as a bottle (with its
 * display photo) once it exists.
 */
export default async function AddBeer({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;

  return <ItemOnboarding type="BEER" cellarId={cellarId} />;
}
