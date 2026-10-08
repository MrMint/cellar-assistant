"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { isNotNil } from "ramda";
import { useCallback, useEffect, useState } from "react";
import { FilterChip } from "@/components/app/FilterChip";
import {
  Add,
  type AppIcon,
  History,
  ICON_STROKE,
  ListView,
  Place,
  Star,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { UserAvatar } from "@/components/app/UserAvatar";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { formatDistance } from "@/lib/items/distance";
import { distance } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { getNextPlaceholder } from "@/utilities";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { formatRating } from "../common/rating/rating";
import type { ActivityEntry, ActivityKind } from "./adapter";
import { fadeInLeft, fadeShort, staggerContainerFast } from "./search-motion";
import { useHasMounted, useHydratedReducedMotion } from "./useHasMounted";

/**
 * `82450ad1:src/components/search/RecentActivity.tsx`, restored (UI parity
 * G31, restored at the user's request).
 *
 * Copy, filters and motion are the old feed's, on the app primitives and the
 * motion tokens (`./search-motion.ts`). What changed under it:
 *
 * - **The feed arrives built.** The old component took three Hasura result
 *   sets — queried with a browser-built `$userIds` — and merged them here.
 *   `me.recentActivity` decides whose activity server-side and filters lists
 *   and cellars through the visibility policy; `activityFeedFromNodes`
 *   (`./adapter.ts`) turns its entries into the old `ActivityEntry` and keeps
 *   the old newest-first, cap-of-eight merge.
 * - **Thumbnails** are the presigned `file { url }` instead of a Nhost storage
 *   URL built from a file id; same `next/image` props.
 * - **"· 3 days ago"** is computed after mount (`formatDistance`, the
 *   date-fns wording), not during render: a relative time is a hydration
 *   mismatch by construction (`hydration-safety.test.ts`). The first paint
 *   shows the line without it.
 * - **The filters** are labelled `FilterChip`s (a glyph and its word) in a
 *   group, where the old ones were bare icons in a Joy `ToggleButtonGroup`
 *   — a glyph is never a touch control's only label (design §3.4). Still a
 *   multi-select: any combination, none meaning all.
 */

export type { ActivityKind } from "./adapter";

// ─── Activity kind filters ───────────────────────────────────────────────────

const ACTIVITY_KIND_FILTERS: {
  id: ActivityKind;
  label: string;
  icon: AppIcon;
}[] = [
  { id: "added", label: "Added", icon: Add },
  { id: "reviewed", label: "Reviews", icon: Star },
  { id: "tier-listed", label: "Tier Lists", icon: ListView },
];

/** A kind toggled in or out, keeping the order the kinds were picked in. */
const toggleKind = (
  kinds: readonly ActivityKind[],
  kind: ActivityKind,
): ActivityKind[] =>
  kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind];

// ─── Item type thumbnail fallback ───────────────────────────────────────────

const isItemType = (type: string): type is ApiItemType =>
  Object.hasOwn(itemTypeTokens, type);

/** No photo: the type's glyph on its tint, or a pin for a place. */
function TypeThumbnail({ type }: { type: string }) {
  if (isItemType(type)) {
    return (
      <span
        className={cn(
          "flex size-full items-center justify-center",
          itemTypeTokens[type].tintClass,
        )}
      >
        <TypeGlyph type={type} className="size-5" />
      </span>
    );
  }
  return (
    <span className="flex size-full items-center justify-center bg-surface-2 text-ink-2">
      <Place aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
    </span>
  );
}

/** The small mark on the thumbnail's corner: what kind of activity this is. */
function KindMark({ kind }: { kind: ActivityKind }) {
  const Icon =
    kind === "added" ? Add : kind === "tier-listed" ? ListView : Star;
  return (
    <span className="absolute -top-1 -left-1 leading-none drop-shadow-md">
      <Icon
        aria-hidden
        strokeWidth={kind === "reviewed" ? 0 : 2.5}
        className={cn(
          "size-4",
          kind === "added" && "text-success",
          kind === "tier-listed" && "text-ink-1",
          kind === "reviewed" && "fill-current text-ink-1",
        )}
      />
    </span>
  );
}

/** `formatDistanceToNow(…, { addSuffix: true })`, once mounted. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}

const timeAgoText = (iso: string, now: number | null): string | null => {
  if (now === null) return null;
  const distance = formatDistance(iso, now);
  if (distance === "") return null;
  return Date.parse(iso) > now ? `in ${distance}` : `${distance} ago`;
};

// ─── Component ───────────────────────────────────────────────────────────────

interface RecentActivityProps {
  feed: ActivityEntry[];
  selectedKinds: ActivityKind[];
}

export function RecentActivity({ feed, selectedKinds }: RecentActivityProps) {
  const now = useNow();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useHydratedReducedMotion();
  // The server's render and the hydration pass start visible; only what
  // mounts afterwards (a filter change) plays the entrance. See ./AnimateIn.
  const animateEntrance = useHasMounted();

  const handleKindsChange = useCallback(
    (newKinds: ActivityKind[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newKinds.length === 0) {
        params.delete("activity");
      } else {
        params.set("activity", newKinds.join(","));
      }
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  if (feed.length === 0 && selectedKinds.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History
            aria-hidden
            className="size-5 text-ink-3"
            strokeWidth={ICON_STROKE}
          />
          <h2 className="type-headline text-ink-1">Recent Activity</h2>
        </div>

        <fieldset
          aria-label="Activity type filters"
          className="flex min-w-0 flex-wrap gap-1.5"
        >
          {ACTIVITY_KIND_FILTERS.map(({ id, label, icon: Icon }) => (
            <FilterChip
              key={id}
              aria-label={label}
              selected={selectedKinds.includes(id)}
              icon={<Icon aria-hidden strokeWidth={ICON_STROKE} />}
              onClick={() => handleKindsChange(toggleKind(selectedKinds, id))}
            >
              {label}
            </FilterChip>
          ))}
        </fieldset>
      </div>
      <AnimatePresence mode="wait">
        {feed.length === 0 ? (
          <motion.div
            key="empty"
            initial={animateEntrance ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeShort}
          >
            <p className="type-footnote py-4">
              No recent activity for the selected filters
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={selectedKinds.join(",")}
            variants={prefersReducedMotion ? undefined : staggerContainerFast}
            initial={
              animateEntrance && !prefersReducedMotion ? "hidden" : false
            }
            animate="show"
            exit="exit"
            className="grid grid-cols-1 gap-2 md:grid-cols-2"
          >
            {feed.map((entry) => {
              const timeAgo = timeAgoText(entry.timestamp, now);
              const blurDataURL = getNextPlaceholder(entry.itemPlaceholder);

              return (
                <motion.div
                  key={entry.id}
                  variants={prefersReducedMotion ? undefined : fadeInLeft}
                  whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                  whileTap={
                    prefersReducedMotion ? undefined : { scale: distance.press }
                  }
                  transition={fadeShort}
                >
                  <Link
                    href={entry.itemHref}
                    underline="none"
                    className="flex h-full items-center gap-3 rounded-md bg-surface-1 p-2.5 text-ink-1 transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-2"
                  >
                    {/* Item thumbnail with action badge */}
                    <div className="relative size-11 shrink-0">
                      <div className="relative size-full overflow-hidden rounded-sm">
                        {entry.itemImageUrl ? (
                          <Image
                            src={entry.itemImageUrl}
                            alt={entry.itemName}
                            fill
                            className="object-cover"
                            sizes="44px"
                            placeholder={blurDataURL ? "blur" : undefined}
                            blurDataURL={blurDataURL}
                          />
                        ) : (
                          <TypeThumbnail type={entry.itemType} />
                        )}
                      </div>
                      <KindMark kind={entry.kind} />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      {/* Item name */}
                      <p className="type-callout truncate font-semibold">
                        {entry.itemName}
                      </p>

                      {/* Action line */}
                      <p className="type-footnote truncate">
                        {entry.kind === "added" ? (
                          <>
                            Added to {entry.cellarName}
                            {timeAgo !== null && ` \u00B7 ${timeAgo}`}
                          </>
                        ) : entry.kind === "tier-listed" ? (
                          <>
                            #{entry.rank} in {entry.tierListName}
                            {timeAgo !== null && ` \u00B7 ${timeAgo}`}
                          </>
                        ) : (
                          <>
                            {/* "Rated 4", as the rating control says it; no score is a text-only review. */}
                            {isNotNil(entry.score)
                              ? `Rated ${formatRating(entry.score)}`
                              : "Reviewed"}
                            {timeAgo !== null && ` \u00B7 ${timeAgo}`}
                          </>
                        )}
                      </p>

                      {/* Review text snippet */}
                      {entry.kind === "reviewed" && entry.reviewText && (
                        <div className="mt-0.5 max-h-[1.4em] overflow-hidden text-ink-2 text-xs italic [&_[contenteditable]]:max-h-[1.4em] [&_[contenteditable]]:overflow-hidden [&_[contenteditable]]:p-0 [&_p]:m-0">
                          <RichTextDisplay text={entry.reviewText} />
                        </div>
                      )}
                    </div>

                    {/* User avatar on right */}
                    <UserAvatar
                      avatarUrl={entry.userAvatar}
                      displayName={entry.userName}
                      size="sm"
                      className="size-7 self-center text-xs"
                    />
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
