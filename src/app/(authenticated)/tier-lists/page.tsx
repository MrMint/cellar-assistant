import { TierListsPage } from "@/components/tier-list/TierListsPage";
import { GetTierListsQuery } from "@/components/tier-list/queries";
import { serverQuery } from "@/lib/urql/server";

export default async function TierListsIndexPage() {
  const data = await serverQuery(GetTierListsQuery, {});

  return <TierListsPage tierLists={data.tier_lists} />;
}
