"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
} from "react";
import { useQuery } from "urql";
import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { Leaderboard } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { useNavigate } from "@/components/app/useNavigate";
import { CellarItemsFilter } from "@/components/cellar/CellarItemsFilter";
import { virtualTotal } from "@/components/cellar/virtualTotal";
import { ApiError } from "@/components/cellar-api/ApiError";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { ItemCard } from "@/components/item/ItemCard";
import { itemHref } from "@/components/item-api/itemTypes";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import { useTypesFilterState } from "@/utilities/hooks";
import {
  RANKING_SEGMENTS,
  type RankingSegment,
  rankingRowFromEntry,
  rankingsCacheKey,
  rankingsEmptyState,
  scopeOfSegment,
  segmentFromParam,
  withRanks,
} from "./adapter";
import {
  GetRankingFriendsQuery,
  GetRankingsQuery,
  RANKINGS_PAGE_SIZE,
} from "./fragments";

type Filters = { segment: RankingSegment; types: string };

const filtersKey = (filters: Filters) => `${filters.segment}|${filters.types}`;

/**
 * `?scope=` (me · friends · everyone; absent is Me), with the segment lit
 * the moment it is tapped rather than when the URL catches up.
 */
function useRankingSegment(): [RankingSegment, (next: RankingSegment) => void] {
  const navigate = useNavigate();
  const pathname = usePathname() ?? "/rankings";
  const searchParams = useSearchParams();
  const fromUrl = segmentFromParam(searchParams?.get("scope"));
  const [segment, setOptimistic] = useOptimistic(fromUrl);
  const setSegment = useCallback(
    (next: RankingSegment) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next === "me") params.delete("scope");
      else params.set("scope", next);
      const query = params.toString();
      startTransition(() => {
        setOptimistic(next);
        navigate.replace(query === "" ? pathname : `${pathname}?${query}`);
      });
    },
    [navigate, pathname, searchParams, setOptimistic],
  );
  return [segment, setSegment];
}

/**
 * The board's place for one card: "1", "2", … in Fraunces, #1 in claret.
 * Claret *ink* (`brand-ink`): claret itself (`brand`) is a fill colour and
 * reads at under 2:1 as text on the dark surfaces (palette-contrast.test.ts).
 */
export function RankNumeral({ rank }: { rank: number }) {
  return (
    <span
      data-slot="rank-numeral"
      className={cn(
        "pointer-events-none absolute top-2 left-2 z-20 flex h-8 min-w-8 items-center justify-center rounded-full bg-background/85 px-2 font-display text-lg tabular leading-none shadow-sm",
        rank === 1 ? "text-brand-ink" : "text-ink-1",
      )}
    >
      <span className="sr-only">Rank </span>
      {rank}
    </span>
  );
}

/**
 * `/rankings` — "Top rated" on the Me hub (D1).
 *
 * A labelled **Me · Friends · Everyone** control (N15), Me by default, over
 * `Query.rankings`; the type chips (`?types=`) beside it; a grid of
 * `ItemCard`s, each with its **rank numeral** — the board is ordered by the
 * scope's average then review count, so a card's place in it is its rank.
 * The scope is resolved server-side from an enum (no reviewer ids are built
 * or sent — `fragments.ts`). An empty board says which empty it is, with one
 * thing to do about it.
 */
export const RankingsClient = () => {
  const { types, setTypes } = useTypesFilterState();
  const [segment, setSegment] = useRankingSegment();

  const filters: Filters = { segment, types: (types ?? []).join(",") };

  const list = usePagedConnection({
    query: GetRankingsQuery,
    variables: (args: Filters, after) => ({
      scope: scopeOfSegment(args.segment),
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
    // No server page: the board fetches its own first page.
    initial: null,
    initialArgs: filters,
  });

  // The URL is the filter's source of truth; follow it.
  const key = filtersKey(filters);
  const listKey = filtersKey(list.args);
  const { reset } = list;
  useEffect(() => {
    if (key !== listKey) {
      const [nextSegment, joined] = key.split("|");
      void reset({
        segment: segmentFromParam(nextSegment),
        types: joined ?? "",
      });
    }
  }, [key, listKey, reset]);

  const [{ data: friendData }] = useQuery({ query: GetRankingFriendsQuery });
  const friends = unwrapResult(friendData?.myFriends, "FriendConnection");
  const hasFriends = friends.ok && friends.data.edges.length > 0;

  const items = useMemo(() => withRanks(list.rows), [list.rows]);
  const emptyCopy = rankingsEmptyState(
    segment,
    hasFriends,
    filters.types !== "",
  );

  return (
    <>
      {/* One row only from xl: the type chips (glyph + word) need ~920px. */}
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* "Top rated" on the Me hub (D1): Back goes there on a cold open. */}
        <AppBar title="Top rated" parent="/me" className="min-w-0 flex-1" />
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-4">
          <SegmentedControl
            aria-label="Whose scores"
            value={segment}
            onValueChange={setSegment}
            options={RANKING_SEGMENTS}
            className="xl:w-80"
          />
          <CellarItemsFilter types={types} onTypesChange={setTypes} />
        </div>
      </div>
      {list.failure !== null && (
        <ApiError error={list.failure} title="Could not load rankings" />
      )}
      <VirtualGrid
        items={items}
        totalCount={virtualTotal(list)}
        cacheKey={rankingsCacheKey(types, segment)}
        getItemKey={(x) => x.item.id}
        gridBreakpoints={{ xs: 6, md: 4, lg: 2 }}
        emptyMessage="Loading rankings…"
        empty={
          list.status === "resetting" ? undefined : list.failure !== null ? (
            // The error above says it; an empty state would contradict it.
            <span />
          ) : (
            <EmptyState
              illustration={<Leaderboard aria-hidden strokeWidth={1.5} />}
              title={emptyCopy.title}
              description={emptyCopy.description}
              action={
                emptyCopy.action === null ? undefined : (
                  <Button asChild>
                    <Link href={emptyCopy.action.href} underline="none">
                      {emptyCopy.action.label}
                    </Link>
                  </Button>
                )
              }
            />
          )
        }
        onLoadMore={async () => {
          await list.loadMore();
        }}
        isLoadingMore={list.status === "loadingMore"}
        renderItem={(x, onBeforeNavigate) => (
          <div className="relative">
            <RankNumeral rank={x.rank} />
            <ItemCard
              item={x.item}
              type={x.type}
              href={itemHref(x.type, x.item.id)}
              onClick={onBeforeNavigate}
            />
          </div>
        )}
      />
    </>
  );
};
