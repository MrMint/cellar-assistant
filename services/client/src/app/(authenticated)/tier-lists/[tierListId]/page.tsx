import { Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import {
  type TierListItemNode,
  tierListDataFrom,
} from "@/components/tier-list/adapter";
import {
  GetTierListQuery,
  TIER_LIST_ITEMS_PAGE_SIZE,
  TierListViewerQuery,
} from "@/components/tier-list/queries";
import { TierListViewPage } from "@/components/tier-list/TierListViewPage";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/** Lists are curated; this bounds a runaway cursor, not a real list. */
const MAX_ENTRY_PAGES = 50;

/**
 * `/tier-lists/[id]` — the old server page (`82450ad1`): every entry resolved
 * to plain display data here, `TierListViewPage` on the client.
 *
 * - `tier_lists_by_pk` + a hand-parsed lock query → `tierList(id:)`, one
 *   result union (`NotFoundError` = `notFound()`, as a null row was).
 * - `TierList.items` pages at 100; every page is read, because the board
 *   holds every entry and a reorder must name a band's full membership.
 * - The viewer's own scores ride on each row: `Item.myReview` (G7) and
 *   `Place.myInteraction` (G16), replacing the old `GetUserItemReviews` round
 *   trip and `user_place_interactions`.
 */
export const dynamic = "force-dynamic";

export default async function TierListPage({
  params,
}: {
  params: Promise<{ tierListId: string }>;
}) {
  const { tierListId } = await params;
  const [first, viewer] = await Promise.all([
    apiServerQuery(GetTierListQuery, {
      id: tierListId,
      first: TIER_LIST_ITEMS_PAGE_SIZE,
      after: null,
    }),
    apiServerQuery(TierListViewerQuery, {}),
  ]);

  const result = unwrapResult(first.tierList, "TierList");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }
  const tierList = result.data;

  const nodes: TierListItemNode[] = tierList.items.edges.map(
    (edge) => edge.node,
  );
  let pageInfo = tierList.items.pageInfo;
  for (let page = 1; pageInfo.hasNextPage && page < MAX_ENTRY_PAGES; page++) {
    const next = await apiServerQuery(GetTierListQuery, {
      id: tierListId,
      first: TIER_LIST_ITEMS_PAGE_SIZE,
      after: pageInfo.endCursor,
    });
    const more = unwrapResult(next.tierList, "TierList");
    if (!more.ok) break;
    nodes.push(...more.data.items.edges.map((edge) => edge.node));
    pageInfo = more.data.items.pageInfo;
  }

  const { data, insightsData } = tierListDataFrom(
    tierList,
    nodes,
    viewer.me?.id ?? null,
  );

  return <TierListViewPage data={data} insightsData={insightsData} />;
}
