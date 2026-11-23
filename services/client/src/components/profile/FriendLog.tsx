"use client";

import { GlassWater } from "lucide-react";
import { Link } from "@/components/app/Link";
import { InsetSection } from "@/components/app/Page";
import { Score } from "@/components/app/Score";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Timestamp } from "@/components/common/Timestamp";
import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import { logPageResult, type ProfileLogRow } from "./adapter";
import { FriendLogPageQuery, PROFILE_LOG_PAGE_SIZE } from "./queries";

/** The item's glyph on its type's tint — the log has no photos of its own. */
function Glyph({ row }: { row: ProfileLogRow }) {
  if (row.kind === "recipe") {
    return (
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2"
      >
        <GlassWater className="size-5" />
      </span>
    );
  }
  if (row.itemType === null) {
    return <span aria-hidden className="size-11 rounded-sm bg-surface-2" />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-sm",
        itemTypeTokens[row.itemType].tintClass,
      )}
    >
      <TypeGlyph type={row.itemType} className="size-5" />
    </span>
  );
}

/**
 * A friend's drink log (X18): what they had, when, the score they gave that
 * glass (never their review, D5), what they noticed, where and who with —
 * newest first, each row into the item. The first page is the server's;
 * "Show more" walks the connection.
 */
export function FriendLog({
  userId,
  initialPage,
}: {
  userId: string;
  initialPage: Page<ProfileLogRow>;
}) {
  const log = usePagedConnection({
    query: FriendLogPageQuery,
    variables: (_args: string, after) => ({
      userId,
      first: PROFILE_LOG_PAGE_SIZE,
      after,
    }),
    select: (data) => logPageResult(data?.friendProfile),
    initial: initialPage,
    initialArgs: userId,
  });

  return (
    <InsetSection
      label="Recent logs"
      data-section="logs"
      aria-busy={log.status === "loadingMore" || undefined}
    >
      <ul
        aria-label="Recent logs"
        className="flex flex-col divide-y divide-line"
      >
        {log.rows.map((row) => (
          <li
            key={row.id}
            data-slot="friend-log-entry"
            className="relative flex min-h-11 items-start gap-3 px-4 py-3"
          >
            <Glyph row={row} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {row.href === null ? (
                <span className="type-body truncate text-ink-2">
                  {row.title}
                </span>
              ) : (
                <Link
                  href={row.href}
                  overlay
                  underline="none"
                  className="type-body truncate text-ink-1"
                >
                  {row.title}
                </Link>
              )}
              {row.kind === "recipe" && (
                <span className="type-footnote text-ink-2">Made it</span>
              )}
              <div className="flex items-baseline gap-2">
                <span className="type-footnote tabular">
                  <Timestamp iso={row.createdAt} precision="date" />
                </span>
                <Score value={row.score} />
              </div>
              {row.note !== null && (
                <p className="type-callout line-clamp-3 text-ink-2">
                  {row.note}
                </p>
              )}
              {row.tags.length > 0 && (
                <ul aria-label="Flavours" className="flex flex-wrap gap-1.5">
                  {row.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full bg-surface-2 px-2.5 py-0.5 text-ink-2 text-xs"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
              {row.context !== "" && (
                <p className="type-footnote truncate">{row.context}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {log.failure !== null && (
        <div className="p-4">
          <ApiError error={log.failure} />
        </div>
      )}
      {log.canLoadMore && (
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void log.loadMore()}
            disabled={log.status === "loadingMore"}
            aria-busy={log.status === "loadingMore" || undefined}
          >
            {log.status === "loadingMore" ? "Loading…" : "Show more"}
          </Button>
        </div>
      )}
    </InsetSection>
  );
}
