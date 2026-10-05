"use client";

import { Stack, Typography } from "@mui/joy";
import { useEffect, useMemo } from "react";
import { useQuery } from "urql";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { virtualTotal } from "@/components/cellar/virtualTotal";
import { ApiError } from "@/components/cellar-api/ApiError";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { ItemCard } from "@/components/item/ItemCard";
import { itemHref } from "@/components/item-api/itemTypes";
import { RankingsFilter } from "@/components/ranking/RankingsFilter";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import {
  useReviewersFilterState,
  useTypesFilterState,
} from "@/utilities/hooks";
import {
  rankingRowFromEntry,
  rankingsCacheKey,
  rankingsEmptyMessage,
  scopeFromReviewers,
} from "./adapter";
import {
  GetRankingFriendsQuery,
  GetRankingsQuery,
  RANKINGS_PAGE_SIZE,
} from "./fragments";

type Filters = { scope: ReturnType<typeof scopeFromReviewers>; types: string };

const filtersKey = (filters: Filters) => `${filters.scope}|${filters.types}`;

/**
 * `82450ad1:src/components/ranking/RankingsClient.tsx`, restored.
 *
 * Same tree — "Rankings" title, `RankingsFilter` and `CellarItemsFilter` in the
 * old URL state (`?reviewers=`, `?types=` as JSON), `VirtualGrid` of
 * `ItemCard`s — over `Query.rankings`:
 *
 * - The reviewer toggles become a `RankingScope` (`scopeFromReviewers`); no
 *   reviewer ids are built or sent (see `fragments.ts`).
 * - Paged: `VirtualGrid`'s eager load-more walks the connection's cursor
 *   rather than holding every row of one native-query result.
 * - The empty message names the friends case, since `FRIENDS` with no friends
 *   is now empty instead of silently everyone.
 * - Sake and tea rank too; card links are absolute (§7).
 * - The `userId` prop and its `throw` go: nothing here needs the viewer's id.
 */
export const RankingsClient = () => {
  const { types, setTypes } = useTypesFilterState();
  const { reviewers, setReviewers } = useReviewersFilterState();

  const filters: Filters = {
    scope: scopeFromReviewers(reviewers),
    types: (types ?? []).join(","),
  };

  const list = usePagedConnection({
    query: GetRankingsQuery,
    variables: (args: Filters, after) => ({
      scope: args.scope,
      types:
        args.types === ""
          ? null
          : (args.types.split(",") as NonNullable<typeof types>),
      first: RANKINGS_PAGE_SIZE,
      after,
    }),
    select: (data) =>
      pageOf(unwrapResult(data?.rankings, "RankingsConnection"), (edge) =>
        rankingRowFromEntry(edge.node),
      ),
    // No server page, as before: the board fetches its own first page.
    initial: null,
    initialArgs: filters,
  });

  // The URL is the filter's source of truth; follow it.
  const key = filtersKey(filters);
  const listKey = filtersKey(list.args);
  const { reset } = list;
  useEffect(() => {
    if (key !== listKey) {
      const [scope, joined] = key.split("|");
      void reset({ scope: scope as Filters["scope"], types: joined ?? "" });
    }
  }, [key, listKey, reset]);

  const [{ data: friendData }] = useQuery({ query: GetRankingFriendsQuery });
  const friends = unwrapResult(friendData?.myFriends, "FriendConnection");
  const hasFriends = friends.ok && friends.data.edges.length > 0;

  const items = useMemo(() => [...list.rows], [list.rows]);

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}
      >
        <Typography level="title-lg">Rankings</Typography>
        <Stack direction="row" spacing={2}>
          <RankingsFilter types={reviewers} onTypesChange={setReviewers} />
          <CellarItemsFilter types={types} onTypesChange={setTypes} />
        </Stack>
      </Stack>
      {list.failure !== null && (
        <ApiError error={list.failure} title="Could not load rankings" />
      )}
      <VirtualGrid
        items={items}
        totalCount={virtualTotal(list)}
        cacheKey={rankingsCacheKey(types, reviewers)}
        getItemKey={(x) => x.item.id}
        gridBreakpoints={{ xs: 6, md: 4, lg: 2 }}
        emptyMessage={
          list.status === "resetting"
            ? "Loading rankings…"
            : rankingsEmptyMessage(filters.scope, hasFriends)
        }
        onLoadMore={async () => {
          await list.loadMore();
        }}
        isLoadingMore={list.status === "loadingMore"}
        renderItem={(x, onBeforeNavigate) => (
          <ItemCard
            item={x.item}
            type={x.type}
            href={itemHref(x.type, x.item.id)}
            onClick={onBeforeNavigate}
          />
        )}
      />
    </>
  );
};
