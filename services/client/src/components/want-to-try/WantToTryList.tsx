"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { ICON_STROKE, Place, Recipe, WantToTry } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { failureFromTransport } from "@/lib/api/result";
import type { Page as ListPage } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import {
  emptyCopy,
  WANT_TO_TRY_FILTERS,
  type WantToTryFilter,
  type WantToTryRow,
  wantToTryPage,
  wantToTryVariables,
} from "./adapter";
import { WantToTryListQuery } from "./queries";
import { WantToTryButton } from "./WantToTryButton";

type WantToTryListProps = {
  /** The server's first page, for the filter it was rendered with. */
  initialPage: ListPage<WantToTryRow>;
  initialFilter: WantToTryFilter;
};

/** 44 pt: the photo, or the kind's glyph on its tint. */
function Thumbnail({ row }: { row: WantToTryRow }) {
  if (row.imageUrl !== null) {
    return (
      <span className="relative block size-11 overflow-hidden rounded-sm bg-surface-2">
        <Image
          src={row.imageUrl}
          alt=""
          fill
          sizes="44px"
          className="object-cover"
        />
      </span>
    );
  }
  if (row.itemType !== null) {
    return (
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-sm",
          itemTypeTokens[row.itemType].tintClass,
        )}
      >
        <TypeGlyph type={row.itemType} className="size-5" />
      </span>
    );
  }
  const Icon = row.target.kind === "RECIPE" ? Recipe : Place;
  return (
    <span className="flex size-11 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
      <Icon aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
    </span>
  );
}

/**
 * Me › Lists › "Want to try" (X08, D1): drinks, places and recipes the viewer
 * saved, newest first, with a segmented filter. Taking something off leaves
 * its row in place — outlined, with Undo in the toast — until the next visit,
 * so a mis-tap never makes a row jump out from under the thumb.
 */
export function WantToTryList({
  initialPage,
  initialFilter,
}: WantToTryListProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<WantToTryFilter>(initialFilter);

  const list = usePagedConnection({
    query: WantToTryListQuery,
    variables: (args: WantToTryFilter, after) =>
      wantToTryVariables(args, after),
    select: (data) => {
      const connection = data?.me?.wantToTry;
      return connection === undefined
        ? {
            ok: false,
            error: failureFromTransport({
              message: "Your session has ended. Sign in again to see more.",
            }),
          }
        : { ok: true, data: wantToTryPage(connection) };
    },
    initial: initialPage,
    initialArgs: initialFilter,
    // A save made on another page must show here on the way back.
    requestPolicy: "cache-and-network",
  });

  const { reset, args } = list;
  useEffect(() => {
    if (filter !== args) void reset(filter, { fresh: true, clear: true });
  }, [filter, args, reset]);

  const changeFilter = (next: WantToTryFilter) => {
    setFilter(next);
    router.replace(
      next === "all" ? "/want-to-try" : `/want-to-try?kind=${next}`,
      { scroll: false },
    );
  };

  const rows = list.rows;
  const loading = list.status === "resetting";
  const empty = emptyCopy(filter);

  return (
    <Page>
      <AppBar title="Want to try" parent="/me" />
      <SegmentedControl
        aria-label="Show"
        value={filter}
        onValueChange={changeFilter}
        options={WANT_TO_TRY_FILTERS}
      />
      {list.failure !== null && (
        <ApiError error={list.failure} title="Want to try" />
      )}
      {loading && rows.length === 0 ? (
        <div
          role="status"
          aria-label="Loading your list"
          className="flex flex-col gap-3"
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 && list.failure === null ? (
        <EmptyState
          illustration={<WantToTry aria-hidden strokeWidth={ICON_STROKE} />}
          title={empty.title}
          description={empty.description}
          action={
            <Button asChild variant="secondary">
              <Link href={filter === "places" ? "/map" : "/search"}>
                {filter === "places" ? "Open the map" : "Find something"}
              </Link>
            </Button>
          }
        />
      ) : (
        <InsetSection
          label={
            typeof list.totalCount === "number"
              ? `${list.totalCount} saved`
              : undefined
          }
          aria-busy={loading || undefined}
        >
          {rows.map((row) => (
            <ListRow
              key={row.key}
              data-want-to-try-row={row.key}
              leading={<Thumbnail row={row} />}
              title={
                <Link
                  href={row.href}
                  overlay
                  underline="none"
                  className="text-ink-1"
                >
                  {row.title}
                </Link>
              }
              description={row.description}
              trailing={
                <WantToTryButton target={row.target} saved name={row.title} />
              }
            />
          ))}
        </InsetSection>
      )}
      {list.canLoadMore && (
        <Button
          variant="secondary"
          onClick={() => void list.loadMore()}
          disabled={list.status === "loadingMore"}
          aria-busy={list.status === "loadingMore" || undefined}
        >
          {list.status === "loadingMore" ? "Loading…" : "Show more"}
        </Button>
      )}
    </Page>
  );
}
