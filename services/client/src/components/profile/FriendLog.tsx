"use client";

import { GlassWater } from "lucide-react";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { formatKitScore, Stars } from "@/components/app/parts/Stars";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Timestamp } from "@/components/common/Timestamp";
import type { Page } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { logPageResult, type ProfileLogRow } from "./adapter";
import { ProfileSection, ShowMore } from "./FriendSections";
import { FriendLogPageQuery, PROFILE_LOG_PAGE_SIZE } from "./queries";

/** The kind's glyph plate in a raised well (no-photo thumb, under 75 px). */
function Thumb({ row }: { row: ProfileLogRow }) {
  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-raised text-glyph"
    >
      {row.kind === "recipe" ? (
        <GlassWater className="size-5" />
      ) : row.itemType === null ? null : (
        <LabelPlate type={row.itemType} plate={{ name: row.title }} />
      )}
    </span>
  );
}

/** One log entry, as a card: what, their stars, their words, where, when. */
function LogCard({ row }: { row: ProfileLogRow }) {
  return (
    <li
      data-slot="friend-log-entry"
      className="relative flex items-start gap-3 rounded-lg border border-edge bg-surface-1 p-4"
    >
      <Thumb row={row} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {row.href === null ? (
          <span className="t-head text-ink-2">{row.title}</span>
        ) : (
          <Link
            href={row.href}
            overlay
            underline="none"
            className="t-head text-ink"
          >
            {row.title}
          </Link>
        )}
        {row.kind === "recipe" && (
          <span className="t-cap text-ink-2">Made it</span>
        )}
        {row.score !== null && (
          <span className="flex items-center gap-2">
            <Stars value={row.score} tone="other" size="md" />
            <span className="t-cap tabular-nums text-ink-2">
              {formatKitScore(row.score)}
            </span>
          </span>
        )}
        {row.note !== null && (
          <p className="t-body line-clamp-3 text-ink">{row.note}</p>
        )}
        {row.tags.length > 0 && (
          <ul aria-label="Flavours" className="flex flex-wrap gap-1.5">
            {row.tags.map((tag) => (
              <li
                key={tag}
                className="t-cap rounded-sm bg-raised px-2 py-0.5 text-ink-2"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        <p className="t-cap truncate text-ink-2">
          {row.context === "" ? null : <>{row.context} · </>}
          <Timestamp iso={row.createdAt} precision="date" />
        </p>
      </div>
    </li>
  );
}

/**
 * A friend's drink log (X18; Social-Friends 03 to 06): what they had, the
 * score they gave that glass (in ink, never gold: gold is the viewer's own),
 * their note and flavours, where and who with, newest first, each card into
 * the item. The first page is the server's; "Show more · 6 of 32" walks on,
 * and the end of a long log says so.
 */
export function FriendLog({
  userId,
  name,
  initialPage,
}: {
  userId: string;
  /** Their first name, for "End of Maya's log". */
  name: string;
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
  const ended =
    !log.canLoadMore &&
    log.failure === null &&
    log.rows.length > PROFILE_LOG_PAGE_SIZE;

  return (
    <ProfileSection
      label="Recent"
      section="logs"
      count={log.totalCount ?? log.rows.length}
      busy={log.status === "loadingMore"}
    >
      <ul aria-label="Recent logs" className="flex flex-col gap-2">
        {log.rows.map((row) => (
          <LogCard key={row.id} row={row} />
        ))}
      </ul>
      {log.failure !== null && <ApiError error={log.failure} />}
      {log.canLoadMore && (
        <ShowMore
          shown={log.rows.length}
          total={log.totalCount}
          loading={log.status === "loadingMore"}
          onMore={() => void log.loadMore()}
        />
      )}
      {ended && (
        <p data-slot="log-end" className="t-cap py-2 text-center text-ink-2">
          End of {name}’s log
        </p>
      )}
    </ProfileSection>
  );
}
