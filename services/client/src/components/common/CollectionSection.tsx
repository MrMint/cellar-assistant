"use client";

import { type ReactNode, useId } from "react";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ApiFailure } from "@/lib/api/result";

/** The three sections of `/cellars` and `/tier-lists` (decision D2). */
export type SectionKey = "MINE" | "FRIENDS" | "DISCOVER";

/** What each section is called on screen. */
export const SECTION_TITLES: Record<SectionKey, string> = {
  MINE: "Yours",
  FRIENDS: "From friends",
  DISCOVER: "Discover",
};

export type CollectionSectionProps<T> = {
  section: SectionKey;
  rows: readonly T[];
  getKey: (row: T) => string;
  renderItem: (row: T) => ReactNode;
  /** Rows in the whole section, when the server counted them. */
  totalCount: number | null;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  failure: ApiFailure | null;
  /**
   * What an empty section shows. Omitted, an empty section is not drawn at
   * all — From friends and Discover simply do not appear until they have
   * something; Yours always does, with its first-run state (N15).
   */
  empty?: ReactNode;
};

/**
 * One section of a sectioned index (X11): an overline title, a count once
 * there is more than one screenful, the cards, and "Show more" for the next
 * page. Plain grid rather than `VirtualGrid`: three virtualised grids in one
 * scroller would fight over its scroll position, and a section's first page
 * is a screenful, not a catalog.
 */
export function CollectionSection<T>({
  section,
  rows,
  getKey,
  renderItem,
  totalCount,
  canLoadMore,
  loadingMore,
  onLoadMore,
  failure,
  empty,
}: CollectionSectionProps<T>) {
  const headingId = useId();
  if (rows.length === 0 && failure === null && empty === undefined) {
    return null;
  }
  const title = SECTION_TITLES[section];
  return (
    <section
      aria-labelledby={headingId}
      data-section={section}
      className="flex flex-col gap-3"
    >
      <div className="flex min-h-6 items-end justify-between gap-2 px-1">
        <h2 id={headingId} className="type-overline text-ink-3">
          {title}
        </h2>
        {totalCount !== null && totalCount > rows.length && (
          <span className="type-footnote tabular">{totalCount}</span>
        )}
      </div>
      {failure !== null && <ApiError error={failure} />}
      {rows.length === 0 ? (
        empty
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((row) => (
            <li key={getKey(row)} className="min-w-0">
              {renderItem(row)}
            </li>
          ))}
        </ul>
      )}
      {canLoadMore && (
        <Button
          variant="ghost"
          className="self-center"
          disabled={loadingMore}
          aria-busy={loadingMore || undefined}
          onClick={onLoadMore}
        >
          {loadingMore && <Spinner aria-hidden />}
          Show more
          <span className="sr-only"> in {title}</span>
        </Button>
      )}
    </section>
  );
}
