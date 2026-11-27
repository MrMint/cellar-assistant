"use client";

import Image from "next/image";

import { useEffect, useState } from "react";
import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { ICON_STROKE, Place, Recipe, WantToTry } from "@/components/app/icons";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { useNavigate } from "@/components/app/useNavigate";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PressLink } from "@/components/user/PressLink";
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
      <span className="relative block size-11 overflow-hidden rounded-sm bg-raised">
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
    <span className="flex size-11 items-center justify-center rounded-sm bg-raised text-glyph">
      <Icon aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
    </span>
  );
}

/** The list's sections, in the board's order (Shell-Me, Want to try). */
const SECTIONS = [
  { kind: "ITEM", label: "Drinks" },
  { kind: "PLACE", label: "Places" },
  { kind: "RECIPE", label: "Recipes" },
] as const satisfies readonly {
  kind: WantToTryRow["target"]["kind"];
  label: string;
}[];

/**
 * Me › Lists › "Want to try" (X08, D1): drinks, places and recipes the viewer
 * saved, newest first within Drinks, Places and Recipes, with a segmented
 * filter and how many are saved under the title. Taking something off leaves
 * its row in place — outlined, with Undo in the toast — until the next visit,
 * so a mis-tap never makes a row jump out from under the thumb.
 */
export function WantToTryList({
  initialPage,
  initialFilter,
}: WantToTryListProps) {
  const navigate = useNavigate();
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
    navigate.replace(
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
      {typeof list.totalCount === "number" && list.totalCount > 0 && (
        <p className="t-cap m-0 text-ink-2">{list.totalCount} saved</p>
      )}
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
            <Button asChild variant="outline">
              <PressLink href={filter === "places" ? "/map" : "/search"}>
                {filter === "places" ? "Open the map" : "Find something"}
              </PressLink>
            </Button>
          }
        />
      ) : (
        <div aria-busy={loading || undefined} className="flex flex-col gap-6">
          {SECTIONS.map((section) => {
            const shown = rows.filter(
              (row) => row.target.kind === section.kind,
            );
            if (shown.length === 0) return null;
            return (
              <InsetSection
                key={section.kind}
                label={section.label}
                action={
                  <span className="t-cap tabular text-ink-3">
                    {shown.length}
                  </span>
                }
              >
                {shown.map((row) => (
                  <ListRow
                    key={row.key}
                    data-want-to-try-row={row.key}
                    leading={<Thumbnail row={row} />}
                    title={
                      <PressLink
                        href={row.href}
                        overlay
                        underline="none"
                        className="text-ink"
                      >
                        {row.title}
                      </PressLink>
                    }
                    description={row.description}
                    trailing={
                      <WantToTryButton
                        target={row.target}
                        saved
                        name={row.title}
                      />
                    }
                  />
                ))}
              </InsetSection>
            );
          })}
        </div>
      )}
      {list.canLoadMore && (
        <Button
          variant="outline"
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
