"use client";

import type { ReactNode } from "react";
import {
  Cellar,
  ChevronRight,
  ICON_STROKE,
  Ranked,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { TypeGlyph } from "@/components/app/TypeChip";
import { ApiError } from "@/components/cellar-api/ApiError";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { CloneTierListButton } from "@/components/taste/CloneTierListButton";
import { BandStrip } from "@/components/tier-list/lists/ListCard";
import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/paging/paged-connection";
import {
  type UsePagedConnection,
  usePagedConnection,
} from "@/lib/paging/use-paged-connection";
import {
  cellarPageResult,
  listPageResult,
  type ProfileCellarRow,
  type ProfileListRow,
} from "./adapter";
import {
  FriendCellarsPageQuery,
  FriendTierListsPageQuery,
  PROFILE_SECTION_SIZE,
} from "./queries";

/**
 * A profile section (Social-Friends 03): the heading at left, its count at
 * right, then its cards. The count is the server's total, or the rows read
 * so far when the server did not count.
 */
export function ProfileSection({
  label,
  section,
  count,
  busy,
  children,
}: {
  label: string;
  section: string;
  count: number;
  busy?: boolean;
  children: ReactNode;
}) {
  const id = `profile-${section}`;
  return (
    <section
      aria-labelledby={id}
      data-section={section}
      aria-busy={busy || undefined}
      className="flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="t-head text-ink">
          {label}
        </h2>
        <span className="t-cap tabular-nums text-ink-2">{count}</span>
      </div>
      {children}
    </section>
  );
}

/** "Show more", quiet, with how far through the section you are. */
export function ShowMore({
  shown,
  total,
  loading,
  onMore,
}: {
  shown: number;
  total: number | null;
  loading: boolean;
  onMore: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <Button
        variant="quiet"
        className="px-0"
        onClick={onMore}
        disabled={loading}
        aria-busy={loading || undefined}
      >
        Show more
      </Button>
      {total !== null && (
        <span className="t-cap tabular-nums text-ink-2">
          {shown} of {total}
        </span>
      )}
    </div>
  );
}

/** The paged section's foot: its error, then Show more while there is more. */
function PagedFoot<TRow>({
  paged,
}: {
  paged: UsePagedConnection<TRow, string>;
}) {
  return (
    <>
      {paged.failure !== null && <ApiError error={paged.failure} />}
      {paged.canLoadMore && (
        <ShowMore
          shown={paged.rows.length}
          total={paged.totalCount}
          loading={paged.status === "loadingMore"}
          onMore={() => void paged.loadMore()}
        />
      )}
    </>
  );
}

const CARD =
  "relative flex min-h-14 items-center gap-3 rounded-lg border border-edge bg-surface-1 px-4 py-3";

/**
 * Their tier lists you may open, 20 at a time, each with Copy (L03): a
 * private copy of yours. The name opens the list; Copy sits beside it,
 * outside the link.
 */
export function FriendTierLists({
  userId,
  initialPage,
}: {
  userId: string;
  initialPage: Page<ProfileListRow>;
}) {
  const paged = usePagedConnection({
    query: FriendTierListsPageQuery,
    variables: (_args: string, after) => ({
      userId,
      first: PROFILE_SECTION_SIZE,
      after,
    }),
    select: (data) => listPageResult(data?.friendProfile),
    initial: initialPage,
    initialArgs: userId,
  });
  return (
    <ProfileSection
      label="Lists"
      section="tier-lists"
      count={paged.totalCount ?? paged.rows.length}
      busy={paged.status === "loadingMore"}
    >
      <ul className="flex flex-col gap-2">
        {paged.rows.map((row) => (
          <li key={row.id} className={CARD}>
            {row.listType !== undefined && isItemType(row.listType) ? (
              <TypeGlyph
                type={row.listType.toUpperCase() as ApiItemType}
                className="size-5"
              />
            ) : (
              <Ranked
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-5 shrink-0 text-glyph"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <Link
                href={row.href}
                overlay
                underline="none"
                className="t-head truncate text-ink"
              >
                {row.name}
              </Link>
              {row.description !== "" && (
                <span className="t-cap truncate text-ink-2">
                  {row.description}
                </span>
              )}
              {row.strip !== undefined && (
                <BandStrip strip={row.strip} className="mt-1.5" />
              )}
            </span>
            <span className="relative z-10 shrink-0">
              <CloneTierListButton tierListId={row.id} name={row.name} />
            </span>
          </li>
        ))}
      </ul>
      <PagedFoot paged={paged} />
    </ProfileSection>
  );
}

const KINDS: readonly string[] = [
  "wine",
  "beer",
  "spirit",
  "sake",
  "coffee",
  "tea",
];
const isItemType = (value: string) => KINDS.includes(value.toLowerCase());

/** Their cellars you may open, 20 at a time. */
export function FriendCellars({
  userId,
  initialPage,
}: {
  userId: string;
  initialPage: Page<ProfileCellarRow>;
}) {
  const paged = usePagedConnection({
    query: FriendCellarsPageQuery,
    variables: (_args: string, after) => ({
      userId,
      first: PROFILE_SECTION_SIZE,
      after,
    }),
    select: (data) => cellarPageResult(data?.friendProfile),
    initial: initialPage,
    initialArgs: userId,
  });
  return (
    <ProfileSection
      label="Cellars"
      section="cellars"
      count={paged.totalCount ?? paged.rows.length}
      busy={paged.status === "loadingMore"}
    >
      <ul className="flex flex-col gap-2">
        {paged.rows.map((row) => (
          <li key={row.id} className={CARD}>
            <Cellar
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 shrink-0 text-glyph"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <Link
                href={row.href}
                overlay
                underline="none"
                className="t-head truncate text-ink"
              >
                {row.name}
              </Link>
              {row.description !== undefined && (
                <span className="t-cap text-ink-2">{row.description}</span>
              )}
            </span>
            <ChevronRight
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 shrink-0 text-ink-3"
            />
          </li>
        ))}
      </ul>
      <PagedFoot paged={paged} />
    </ProfileSection>
  );
}
