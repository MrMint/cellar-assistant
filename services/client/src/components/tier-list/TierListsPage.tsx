"use client";

import { useId, useState } from "react";
import { Add, ICON_STROKE, Offline } from "@/components/app/icons";
import { sectionPageSize } from "@/components/cellar-api/pagination";
import {
  SECTION_TITLES,
  type SectionKey,
} from "@/components/common/CollectionSection";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ApiFailure } from "@/lib/api/result";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { type Page, pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cn } from "@/lib/utils";
import { useScrollPositionRestore } from "@/utilities/hooks";
import { ListCard } from "./lists/ListCard";
import { NewListSheet } from "./lists/ListSheets";
import { type ListCardData, ListsIndexQuery } from "./lists/queries";

/** One section's server-rendered first page, or why there is none. */
export type TierListSectionSeed = {
  page: Page<ListCardData>;
  failure: ApiFailure | null;
};

/** How many a section reads a page (the cellars index's sizes). */
export const listsPageSize = (section: SectionKey): number =>
  sectionPageSize(section, 20);

/**
 * Yours, with nothing in it yet (Social-Lists lists-empty-01): the one New
 * list on the screen, a dashed card, and "Nothing ranked yet" under it.
 */
function NoListsYet({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => {
          feedback("tick");
          onNew();
        }}
        className="flex min-h-22 w-full items-center justify-center gap-4 rounded-lg border border-act-ink border-dashed outline-none transition-transform duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 motion-reduce:active:scale-100"
      >
        <span className="flex size-12 items-center justify-center rounded-md border border-act-ink text-act-ink">
          <Add aria-hidden strokeWidth={ICON_STROKE} className="size-6" />
        </span>
        <span className="t-head text-ink">New list</span>
      </button>
      <p className="t-body m-0 text-ink-2">Nothing ranked yet</p>
    </div>
  );
}

/** A section that failed: what happened and the one way out (KIT § 4). */
function SectionError({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-14 items-center gap-3 rounded-lg border border-edge bg-card py-2 pr-2 pl-4"
    >
      <Offline
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 shrink-0 text-ink-3"
      />
      <span className="t-body min-w-0 flex-1 text-ink">
        Couldn’t load these
      </span>
      <Button
        variant="quiet"
        disabled={retrying}
        aria-busy={retrying || undefined}
        onClick={onRetry}
      >
        {retrying && <Spinner aria-hidden />}
        Try again
      </Button>
    </div>
  );
}

function ListsSection({
  section,
  seed,
  onBeforeNavigate,
  onNew,
}: {
  section: SectionKey;
  seed: TierListSectionSeed;
  onBeforeNavigate: () => void;
  onNew: () => void;
}) {
  const headingId = useId();
  const list = usePagedConnection({
    query: ListsIndexQuery,
    variables: (args: SectionKey, after) => ({
      first: listsPageSize(args),
      after,
      section: args,
    }),
    select: (data) =>
      pageOf(
        unwrapResult(data?.myTierLists, "TierListConnection"),
        (edge) => edge.node,
      ),
    initial: seed.page,
    initialFailure: seed.failure,
    initialArgs: section,
  });
  const mine = section === "MINE";
  if (list.rows.length === 0 && list.failure === null && !mine) return null;
  const title = SECTION_TITLES[section];
  const count = Math.max(list.totalCount ?? 0, list.rows.length);
  return (
    <section
      aria-labelledby={headingId}
      data-section={section}
      className="flex flex-col gap-3"
    >
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 id={headingId} className="t-head m-0 text-ink">
          {title}
        </h2>
        {list.failure === null && (
          <span className="t-cap tabular text-ink-3">{count}</span>
        )}
      </div>
      {list.failure !== null ? (
        <SectionError
          retrying={list.status === "resetting"}
          onRetry={() => void list.reset(section, { fresh: true })}
        />
      ) : list.rows.length === 0 ? (
        <NoListsYet onNew={onNew} />
      ) : (
        <ul
          className={cn(
            "m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2",
            mine ? "lg:grid-cols-3" : "xl:grid-cols-3",
          )}
        >
          {list.rows.map((row) => (
            <li key={row.id} className="min-w-0">
              <ListCard list={row} mine={mine} onNavigate={onBeforeNavigate} />
            </li>
          ))}
        </ul>
      )}
      {list.canLoadMore && (
        <Button
          variant="quiet"
          className="self-center"
          disabled={list.status === "loadingMore"}
          aria-busy={list.status === "loadingMore" || undefined}
          onClick={() => void list.loadMore()}
        >
          {list.status === "loadingMore" && <Spinner aria-hidden />}
          Show more
          <span className="sr-only"> in {title}</span>
        </Button>
      )}
    </section>
  );
}

/**
 * `/tier-lists` (Social-Lists 01): "Lists" with an outlined New list (the
 * teal primary belongs to the content), then Yours (a photo strip, privacy,
 * count, date and the five-band bar), From friends and Discover (compact
 * cards). A stranger's list never sits among yours. An empty Yours carries
 * the screen's one New list (ruling 4), so the header's goes.
 */
export function TierListsPage({
  sections,
}: {
  sections: Record<SectionKey, TierListSectionSeed>;
}) {
  // Back from a list lands where the index was.
  const { sentinelRef, saveScrollPosition } = useScrollPositionRestore();
  const [newOpen, setNewOpen] = useState(false);
  const mineEmpty =
    sections.MINE.page.rows.length === 0 && sections.MINE.failure === null;
  const openNew = () => setNewOpen(true);
  return (
    <div className="flex flex-col gap-6">
      <div ref={sentinelRef} hidden />
      <header className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="t-title m-0 text-ink">Lists</h1>
        {!mineEmpty && (
          <Button variant="outline" onClick={openNew}>
            <Add aria-hidden strokeWidth={ICON_STROKE} />
            New list
          </Button>
        )}
      </header>
      {(["MINE", "FRIENDS", "DISCOVER"] as const).map((section) => (
        <ListsSection
          key={section}
          section={section}
          seed={sections[section]}
          onBeforeNavigate={saveScrollPosition}
          onNew={openNew}
        />
      ))}
      <NewListSheet open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
