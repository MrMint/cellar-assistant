"use client";

import {
  Cellar,
  ChevronRight,
  ICON_STROKE,
  Ranked,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { ApiError } from "@/components/cellar-api/ApiError";
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

const Chevron = () => (
  <ChevronRight aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
);

/** One row into a tier list or a cellar of theirs. */
function LinkRow({
  row,
  icon: Icon,
}: {
  row: ProfileListRow | ProfileCellarRow;
  icon: typeof Ranked;
}) {
  return (
    <ListRow
      leading={
        <Icon aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
      }
      title={
        <Link href={row.href} overlay underline="none" className="text-ink-1">
          {row.name}
        </Link>
      }
      description={row.description || undefined}
      trailing={<Chevron />}
    />
  );
}

/**
 * A section of rows that pages on (leftovers 6): the first page is the
 * server's, "Show more" walks the connection — `FriendLog`'s pattern, so the
 * three sections of a profile page alike.
 */
function PagedSection<TRow extends ProfileListRow | ProfileCellarRow>({
  label,
  section,
  icon,
  paged,
}: {
  label: string;
  section: string;
  icon: typeof Ranked;
  paged: UsePagedConnection<TRow, string>;
}) {
  const loading = paged.status === "loadingMore";
  return (
    <InsetSection
      label={label}
      data-section={section}
      aria-busy={loading || undefined}
    >
      {paged.rows.map((row) => (
        <LinkRow key={row.id} row={row} icon={icon} />
      ))}
      {paged.failure !== null && (
        <div className="p-4">
          <ApiError error={paged.failure} />
        </div>
      )}
      {paged.canLoadMore && (
        <div className="p-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void paged.loadMore()}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? "Loading…" : "Show more"}
          </Button>
        </div>
      )}
    </InsetSection>
  );
}

/** Their tier lists you may open, 20 at a time. */
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
    <PagedSection
      label="Tier lists"
      section="tier-lists"
      icon={Ranked}
      paged={paged}
    />
  );
}

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
    <PagedSection
      label="Cellars"
      section="cellars"
      icon={Cellar}
      paged={paged}
    />
  );
}
