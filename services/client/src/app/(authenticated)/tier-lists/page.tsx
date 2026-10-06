import { ApiError } from "@/components/cellar-api/ApiError";
import {
  GetTierListsQuery,
  TIER_LISTS_PAGE_SIZE,
} from "@/components/tier-list/queries";
import { TierListsPage } from "@/components/tier-list/TierListsPage";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { toPage } from "@/lib/paging/paged-connection";

/**
 * `/tier-lists` — the old `TierListsPage` (`82450ad1`), seeded with the
 * server's first page of `myTierLists` (every list the viewer may see).
 */
export const dynamic = "force-dynamic";

export default async function TierListsIndexPage() {
  const data = await apiServerQuery(GetTierListsQuery, {
    first: TIER_LISTS_PAGE_SIZE,
    after: null,
  });
  const result = unwrapResult(data.myTierLists, "TierListConnection");
  if (!result.ok) {
    return <ApiError error={result.error} title="Could not load tier lists" />;
  }

  return (
    <TierListsPage initialPage={toPage(result.data, (edge) => edge.node)} />
  );
}
