"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { ICON_STROKE, People, Place } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { UserAvatar } from "@/components/app/UserAvatar";
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
  type FeedBurst,
  type FeedNode,
  feedEntriesFromNodes,
  groupBursts,
  sentenceText,
} from "./feed";
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
 * Home's Friends section (X10): what friends did, in sentences, bursts
 * folded into one line (`feed.ts`), a page at a time — "Show more" reads the
 * next page of `me.friendsFeed` and the bursts regroup over everything
 * loaded, so a burst a page cut in two joins up.
 *
 * With no friends at all it is N15's empty state: one line and Invite.
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

  const bursts = useMemo(
    () => groupBursts(feedEntriesFromNodes(feed.rows, viewerId)),
    [feed.rows, viewerId],
  );

  if (bursts.length === 0) {
    if (friendCount !== 0) return null;
    return (
      <section
        aria-labelledby="friends-heading"
        className="flex flex-col gap-2"
      >
        <h2 id="friends-heading" className="type-overline px-4 text-ink-3">
          Friends
        </h2>
        <div className="rounded-lg bg-surface-1">
          <EmptyState
            illustration={<People aria-hidden strokeWidth={1.5} />}
            title="Taste is better compared."
            description="Friends see what you rate and rank, and you see theirs."
            action={<InviteFriendButton />}
            className="px-2 py-6"
          />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="friends-heading" className="flex flex-col gap-2">
      <h2 id="friends-heading" className="type-overline px-4 text-ink-3">
        Friends
      </h2>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
        <AnimatePresence initial={false}>
          {bursts.map((burst) => (
            <motion.li
              key={burst.id}
              initial={reduced ? false : { opacity: 0, y: distance.list }}
              animate={{ opacity: 1, y: 0 }}
              transition={tween("short", "enter")}
            >
              <BurstRow burst={burst} ago={ago(burst.timestamp)} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {feed.failure !== null && (
        <p role="alert" className="type-footnote px-4 text-destructive">
          More couldn't be loaded. Try again.
        </p>
      )}
      {feed.hasNextPage && (
        <Button
          variant="ghost"
          className="self-center text-ink-1"
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

function Thumb({ burst }: { burst: FeedBurst }) {
  const [first] = burst.entries;
  if (first === undefined) return null;
  return (
    <span className="relative size-11 shrink-0 overflow-hidden rounded-sm">
      {first.itemImageUrl ? (
        <Image
          src={first.itemImageUrl}
          alt=""
          fill
          sizes="44px"
          className="object-cover"
        />
      ) : isItemType(first.itemType) ? (
        <span
          className={cn(
            "flex size-full items-center justify-center",
            itemTypeTokens[first.itemType].tintClass,
          )}
        >
          <TypeGlyph type={first.itemType} className="size-5" />
        </span>
      ) : (
        <span className="flex size-full items-center justify-center bg-surface-2 text-ink-2">
          <Place aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
        </span>
      )}
      {burst.entries.length > 1 && (
        <span className="type-footnote tabular absolute right-0.5 bottom-0.5 rounded-sm bg-background/80 px-1 font-semibold text-ink-1">
          {burst.entries.length}
        </span>
      )}
    </span>
  );
}

function BurstRow({ burst, ago }: { burst: FeedBurst; ago: string | null }) {
  const [first] = burst.entries;
  const single = burst.entries.length === 1 ? first : undefined;
  // The token that goes where the row goes stretches over the row (the
  // stretched-link pattern); any other link sits above it.
  const overlayAt = burst.sentence.findIndex(
    (token) => token.href === burst.href,
  );
  return (
    <article
      aria-label={sentenceText(burst.sentence)}
      className="relative flex items-start gap-3 px-4 py-3 has-[a[data-slot=link]:active]:bg-surface-3"
    >
      <UserAvatar
        avatarUrl={burst.userAvatar}
        displayName={burst.userName}
        size="sm"
        className="mt-0.5 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-callout text-ink-2">
          {burst.sentence.map((token, index) =>
            token.href !== undefined ? (
              <Link
                // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional and never reorder.
                key={index}
                href={token.href}
                overlay={index === overlayAt}
                underline="hover"
                className={cn(
                  "font-semibold text-ink-1",
                  index !== overlayAt && "relative z-10",
                )}
              >
                {token.text}
              </Link>
            ) : (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: as above.
                key={index}
                className={cn(token.strong && "font-semibold text-ink-1")}
              >
                {token.text}
              </span>
            ),
          )}
        </p>
        {burst.detail !== null && (
          <p className="type-footnote line-clamp-2 italic">{burst.detail}</p>
        )}
        <p className="type-footnote min-h-4 text-ink-3">{ago}</p>
      </div>
      <Thumb burst={burst} />
      {single?.save != null && (
        <WantToTryButton
          target={single.save.target}
          saved={single.save.saved}
          name={single.itemName}
          size="sm"
          className="relative z-10 -my-1 -mr-2 self-center"
        />
      )}
    </article>
  );
}
