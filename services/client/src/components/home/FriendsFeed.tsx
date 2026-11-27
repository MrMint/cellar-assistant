"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterChip } from "@/components/app/FilterChip";
import { ICON_STROKE, People, Place, Recipe } from "@/components/app/icons";
import { ActivityItem } from "@/components/app/parts/ActivityItem";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { InviteFriendButton } from "@/components/friend/InviteFriendButton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import type { ApiFailure, ApiResult } from "@/lib/api/result";
import { formatDistance } from "@/lib/items/distance";
import { distance, tween } from "@/lib/motion";
import type { Page } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import {
  FEED_FILTERS,
  type FeedBurst,
  type FeedFilter,
  type FeedNode,
  feedEntriesFromNodes,
  filterBursts,
  groupBursts,
} from "./feed";
import { SectionHead } from "./HomeLayout";
import { PressLink } from "./PressLink";
import { FEED_PAGE_SIZE, HomeFriendsFeedQuery } from "./queries";

/** A page with no `me` — signed out mid-session, or a resolver that threw. */
const NO_FEED: ApiFailure = {
  __typename: "TransportError",
  code: "TRANSPORT",
  reason: null,
  retryAt: null,
  message: "The feed did not load.",
};

const isItemType = (type: string): type is ApiItemType =>
  Object.hasOwn(itemTypeTokens, type);

/** "3 days ago", once mounted (a relative time is a hydration mismatch). */
const useAgo = () => {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  return (iso: string): string | null => {
    if (now === null) return null;
    const text = formatDistance(iso, now);
    return text === "" ? null : `${text} ago`;
  };
};

/**
 * Home's Friends section (X10, Shell-Home "Friends"): what friends did, as
 * kit activity cards, bursts folded into one (`feed.ts`), a page at a time —
 * "Show more" reads the next page of `me.friendsFeed` and the bursts regroup
 * over everything loaded, so a burst a page cut in two joins up. The chips
 * (All, Rated, Ranked, Added) narrow what is loaded.
 *
 * With no friends at all it is the kit's empty state: glyph, one line,
 * Invite.
 */
export function FriendsFeed({
  initialNodes,
  initialCursor,
  initialHasMore,
  friendCount,
  viewerId,
}: {
  initialNodes: readonly FeedNode[];
  initialCursor: string | null;
  initialHasMore: boolean;
  /** Null when the count could not be read: then no empty state is claimed. */
  friendCount: number | null;
  viewerId: string;
}) {
  const feed = usePagedConnection({
    query: HomeFriendsFeedQuery,
    variables: (_args: null, after) => ({ first: FEED_PAGE_SIZE, after }),
    select: (data): ApiResult<Page<FeedNode>> => {
      const connection = data?.me?.friendsFeed;
      if (connection === undefined) return { ok: false, error: NO_FEED };
      return {
        ok: true,
        data: {
          rows: connection.edges.map((edge) => edge.node),
          endCursor: connection.pageInfo.endCursor ?? null,
          hasNextPage: connection.pageInfo.hasNextPage,
        },
      };
    },
    initial: {
      rows: initialNodes,
      endCursor: initialCursor,
      hasNextPage: initialHasMore,
    },
    initialArgs: null,
  });
  const loading = feed.status === "loadingMore";
  const ago = useAgo();
  const reduced = useReducedMotion();
  const [filter, setFilter] = useState<FeedFilter>("All");

  const bursts = useMemo(
    () => groupBursts(feedEntriesFromNodes(feed.rows, viewerId)),
    [feed.rows, viewerId],
  );
  const shown = filterBursts(bursts, filter);

  if (bursts.length === 0) {
    if (friendCount !== 0) return null;
    return (
      <section
        aria-labelledby="friends-heading"
        className="flex flex-col gap-2"
      >
        <SectionHead id="friends-heading" title="Friends" />
        <div className="rounded-md border border-edge bg-card">
          <EmptyState
            illustration={<People aria-hidden strokeWidth={ICON_STROKE} />}
            title="Taste is better compared"
            description="Friends see what you rate and rank, and you see theirs"
            action={<InviteFriendButton />}
            className="px-2 py-6"
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="friends-heading" className="flex flex-col gap-2">
      <SectionHead id="friends-heading" title="Friends" />
      <fieldset className="-mx-4 m-0 flex min-w-0 gap-2 border-0 py-0 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
        <legend className="sr-only">Show</legend>
        {FEED_FILTERS.map((name) => (
          <FilterChip
            key={name}
            selected={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </FilterChip>
        ))}
      </fieldset>
      {shown.length === 0 ? (
        <p className="t-cap m-0 py-4 text-center text-ink-3">
          Nothing like that from friends yet
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <AnimatePresence initial={false}>
            {shown.map((burst) => (
              <motion.li
                key={burst.id}
                initial={reduced ? false : { opacity: 0, y: distance.list }}
                animate={{ opacity: 1, y: 0 }}
                transition={tween("short", "enter")}
              >
                <BurstItem burst={burst} ago={ago(burst.timestamp)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {feed.failure !== null && (
        <p role="alert" className="t-cap m-0 text-danger">
          More couldn't be loaded. Try again.
        </p>
      )}
      {feed.hasNextPage && (
        <Button
          variant="quiet"
          className="self-center"
          disabled={!feed.canLoadMore}
          aria-busy={loading || undefined}
          onClick={() => void feed.loadMore()}
        >
          {loading && <Spinner />}
          Show more
        </Button>
      )}
    </section>
  );
}

/** A 44 thumb: the thing's photo, else its kind's glyph flat on raised. */
function Thumb({ burst }: { burst: FeedBurst }) {
  const [first] = burst.entries;
  if (first === undefined) return null;
  const Glyph = isItemType(first.itemType)
    ? itemTypeTokens[first.itemType].glyph
    : first.itemType === "RECIPE"
      ? Recipe
      : Place;
  const kind = isItemType(first.itemType)
    ? first.itemType
    : first.itemType === "RECIPE"
      ? "recipe"
      : "place";
  return (
    <span
      data-thumb={first.itemImageUrl ? undefined : kind}
      className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-raised"
    >
      {first.itemImageUrl ? (
        <Image
          src={first.itemImageUrl}
          alt=""
          fill
          sizes="44px"
          className="object-cover"
        />
      ) : (
        // A Made-it log (L08): the recipe stands for the item (H-13).
        <Glyph
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-5 text-glyph"
        />
      )}
      {burst.entries.length > 1 && (
        <span className="t-micro tabular absolute right-0.5 bottom-0.5 rounded-sm bg-card px-1 text-ink">
          {burst.entries.length}
        </span>
      )}
    </span>
  );
}

function BurstItem({ burst, ago }: { burst: FeedBurst; ago: string | null }) {
  const [first] = burst.entries;
  const single = burst.entries.length === 1 ? first : undefined;
  // The token that goes where the row goes stretches over the card (the
  // stretched-link pattern); any other link sits above it.
  const overlayAt = burst.sentence.findIndex(
    (token) => token.href === burst.href,
  );
  return (
    <ActivityItem
      who={burst.userName}
      avatarUrl={burst.userAvatar}
      time={ago ?? ""}
      sentence={burst.sentence.map((token, index) =>
        token.href !== undefined ? (
          <PressLink
            // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional and never reorder.
            key={index}
            href={token.href}
            overlay={index === overlayAt}
            className={cn(
              "t-head text-ink",
              index !== overlayAt && "relative z-10",
            )}
          >
            {token.text}
          </PressLink>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            key={index}
            className={cn(token.strong && "t-head text-ink")}
          >
            {token.text}
          </span>
        ),
      )}
      detail={
        <>
          <Thumb burst={burst} />
          {burst.detail !== null && (
            <span className="t-cap line-clamp-2 min-w-0 flex-1 text-ink-2">
              {burst.detail}
            </span>
          )}
          {single?.save != null && (
            <WantToTryButton
              target={single.save.target}
              saved={single.save.saved}
              name={single.itemName}
              size="sm"
              className="relative z-10 ml-auto"
            />
          )}
        </>
      }
    />
  );
}
