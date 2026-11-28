"use client";

import Image from "next/image";
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
import { EmptyState, ErrorState } from "@/components/app/EmptyState";
import { FilterChip } from "@/components/app/FilterChip";
import { ICON_STROKE, Lists, PersonAdd, Search } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { Page } from "@/components/app/Page";
import { Crown } from "@/components/app/parts/Rank";
import {
  formatKitScore,
  PublicRating,
  Stars,
} from "@/components/app/parts/Stars";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { useNavigate } from "@/components/app/useNavigate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemHref } from "@/components/item-api/itemTypes";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Skeleton } from "@/components/ui/skeleton";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import { useTypesFilterState } from "@/utilities/hooks";
import {
  RANKING_KINDS,
  RANKING_SEGMENTS,
  type RankingGridRow,
  type RankingSegment,
  rankingCountLine,
  rankingRowFromEntry,
  rankingsEmptyState,
  scopeOfSegment,
  segmentFromParam,
  wearsCrown,
  withRanks,
} from "./adapter";
import {
  GetRankingCountsQuery,
  GetRankingFriendsQuery,
  GetRankingsQuery,
  RANKINGS_CAP,
  RANKINGS_PAGE_SIZE,
} from "./fragments";

type Filters = { segment: RankingSegment; types: string };

const filtersKey = (filters: Filters) => `${filters.segment}|${filters.types}`;

const COUNT_FIELD = {
  BEER: "beer",
  WINE: "wine",
  SPIRIT: "spirit",
  COFFEE: "coffee",
  TEA: "tea",
  SAKE: "sake",
} as const satisfies Record<ApiItemType, string>;

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
 * A row's place: a plain tabular numeral (no band exists on a board ranked by
 * stars), with the gold crown above it on the owner's own #1 only (CROSS-LOT
 * ruling 1). Assistive tech hears "Rank N".
 */
export function RankNumeral({
  rank,
  crown = false,
}: {
  rank: number;
  crown?: boolean;
}) {
  return (
    <span
      data-slot="rank-numeral"
      className="flex w-10 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch"
    >
      {crown && <Crown className="size-4" />}
      <span className="t-head tabular text-ink-2">
        <span className="sr-only">Rank </span>
        {rank}
      </span>
    </span>
  );
}

/**
 * `/rankings` — "Top rated" (Social-Recap board 22 to 27): Me · Friends ·
 * Everyone, kind chips with their counts (none in Everyone, a top-200 fetch:
 * SR-1, SR-3), the count line, and the rows, a hundred at a time with "Show
 * 100 more". Rows carry the place, the photo or label plate, the name, the
 * scope's stars (the owner's gold on Me, the people glyph and count
 * otherwise) and "maker · Kind". The scope is an enum the server resolves:
 * no reviewer ids leave the browser (`fragments.ts`).
 */
export const RankingsClient = () => {
  const { types, setTypes } = useTypesFilterState();
  const [segment, setSegment] = useRankingSegment();
  const kind: ApiItemType | null =
    types !== undefined && types !== null && types.length === 1
      ? (types[0] ?? null)
      : null;

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

  const [{ data: countData }] = useQuery({
    query: GetRankingCountsQuery,
    variables: { scope: scopeOfSegment(segment) },
  });
  const countOf = (field: keyof NonNullable<typeof countData>) => {
    const read = unwrapResult(countData?.[field], "RankingsConnection");
    return read.ok ? (read.data.totalCount ?? null) : null;
  };
  const allCount = countOf("all");
  const capped = segment === "everyone";

  const rows = useMemo(() => withRanks(list.rows), [list.rows]);
  const loading = list.status === "resetting" && rows.length === 0;
  const empty = !loading && list.failure === null && rows.length === 0;
  const countLine = rankingCountLine(
    segment,
    kind === null ? allCount : countOf(COUNT_FIELD[kind]),
    kind !== null,
    RANKINGS_CAP,
  );

  const pickKind = (next: ApiItemType | null) => {
    setTypes(next === null || next === kind ? [] : [next]);
  };

  const chips: {
    value: ApiItemType | null;
    label: string;
    count: number | null;
  }[] = [
    { value: null, label: "All", count: allCount },
    ...RANKING_KINDS.flatMap((value) => {
      const count = countOf(COUNT_FIELD[value]);
      // Kinds with none are hidden unless picked (SR-3).
      if (count === 0 && value !== kind) return [];
      return [{ value, label: itemTypeTokens[value].label, count }];
    }),
  ];

  return (
    <Page wide>
      <AppBar
        title="Top rated"
        parent="/me"
        actions={[{ label: "Tier lists", icon: Lists, href: "/tier-lists" }]}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SegmentedControl
          aria-label="Whose scores"
          value={segment}
          onValueChange={setSegment}
          options={RANKING_SEGMENTS}
          className="md:w-80"
        />
      </div>
      <div
        role="toolbar"
        aria-label="Kinds"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
      >
        {chips.map((chip) => (
          <FilterChip
            key={chip.value ?? "all"}
            selected={chip.value === kind}
            onClick={() => pickKind(chip.value)}
            count={capped ? undefined : (chip.count ?? undefined)}
          >
            {chip.label}
          </FilterChip>
        ))}
      </div>
      {countLine !== null && !empty && (
        <p className="t-cap tabular text-ink-2">{countLine}</p>
      )}

      {list.failure !== null ? (
        <ErrorState
          title="Couldn’t load rankings"
          action={
            <Button
              variant="outline"
              onClick={() => void reset(list.args, { fresh: true })}
            >
              Try again
            </Button>
          }
        />
      ) : loading ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-[72px] w-full rounded-md" />
          ))}
        </div>
      ) : empty ? (
        <RankingsEmpty
          segment={segment}
          hasFriends={hasFriends}
          kind={kind === null ? null : itemTypeTokens[kind].label}
          onAllKinds={() => pickKind(null)}
        />
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Top rated">
          {rows.map((row) => (
            <RankingRow
              key={row.item.id}
              row={row}
              rank={row.rank}
              crown={wearsCrown(segment, kind !== null, row.rank)}
              mine={segment === "me"}
            />
          ))}
        </ol>
      )}

      {list.hasNextPage && rows.length > 0 && (
        <Button
          variant="outline"
          disabled={list.status === "loadingMore"}
          onClick={() => void list.loadMore()}
          className="self-center"
        >
          Show {RANKINGS_PAGE_SIZE} more
        </Button>
      )}
    </Page>
  );
};

function RankingRow({
  row,
  rank,
  crown,
  mine,
}: {
  row: RankingGridRow;
  rank: number;
  crown: boolean;
  mine: boolean;
}) {
  const { item, type } = row;
  const kind = itemTypeTokens[type].label;
  const sub = [item.subtitle, kind].filter((part) => part).join(" · ");
  const score = item.score ?? null;
  return (
    <li>
      <Link
        href={itemHref(type, item.id)}
        underline="none"
        onClick={() => feedback("tick")}
        aria-label={`${rank}. ${item.name}${score === null ? "" : `, ${formatKitScore(score)}`}`}
        className="flex min-h-[72px] items-stretch overflow-hidden rounded-md border border-edge bg-card text-ink-1 active:bg-sel"
      >
        <RankNumeral rank={rank} crown={crown} />
        <span className="relative w-[54px] shrink-0 self-stretch bg-raised md:w-[72px]">
          {item.displayImageUrl ? (
            <Image
              src={item.displayImageUrl}
              alt=""
              fill
              sizes="72px"
              className="object-cover"
            />
          ) : (
            <LabelPlate
              type={type}
              plate={item.plate ?? { name: item.name }}
              className="absolute inset-0"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2">
          <span className="t-head line-clamp-2">{item.name}</span>
          {score !== null &&
            (mine ? (
              <span className="flex items-center gap-2">
                <Stars value={score} tone="owner" size="sm" />
                <span className="t-cap tabular text-ink-2">
                  {formatKitScore(score)}
                </span>
              </span>
            ) : (
              <PublicRating
                value={score}
                count={item.reviewCount ?? undefined}
              />
            ))}
          <span className="t-cap truncate text-ink-2">{sub}</span>
        </span>
      </Link>
    </li>
  );
}

function RankingsEmpty({
  segment,
  hasFriends,
  kind,
  onAllKinds,
}: {
  segment: RankingSegment;
  hasFriends: boolean;
  kind: string | null;
  onAllKinds: () => void;
}) {
  const copy = rankingsEmptyState(segment, hasFriends, kind);
  const glyph =
    segment === "friends" && !hasFriends && kind === null ? (
      <PersonAdd aria-hidden strokeWidth={ICON_STROKE} />
    ) : (
      <Search aria-hidden strokeWidth={ICON_STROKE} />
    );
  return (
    <EmptyState
      illustration={glyph}
      title={copy.title}
      action={
        copy.action === null ? undefined : copy.action === "all-kinds" ? (
          <Button variant="outline" onClick={onAllKinds}>
            Show all kinds
          </Button>
        ) : (
          <Link
            href={copy.action.href}
            underline="none"
            onPointerDown={() => feedback("primary", { phase: "down" })}
            onPointerUp={() => feedback("primary", { phase: "up" })}
            className={cn(buttonVariants(), "t-head")}
          >
            {copy.action.label}
          </Link>
        )
      }
    />
  );
}
