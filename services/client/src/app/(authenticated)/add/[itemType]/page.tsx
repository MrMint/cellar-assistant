import { notFound } from "next/navigation";
import { ItemOnboarding } from "@/components/common/OnboardingWizard/ItemOnboarding";
import { itemTypeFromSegment } from "@/components/item-api/itemTypes";

/**
 * `/add/[itemType]` — `82450ad1`'s page: the six `{T}Onboarding`s, now one
 * `ItemOnboarding` over the type. `itemType` is a URL segment (`wines`); any
 * other value is a 404, as before. The old page also pre-fetched enum options
 * and the user id; `EnumSelect` reads its options itself
 * (`useReferenceOptions`), and nothing sends a user id any more.
 */
export default async function AddItemTypePage({
  params,
}: {
  params: Promise<{ itemType: string }>;
}) {
  const { itemType } = await params;
  const type = itemTypeFromSegment(itemType);
  if (type === null) notFound();

  return <ItemOnboarding type={type} />;
}
