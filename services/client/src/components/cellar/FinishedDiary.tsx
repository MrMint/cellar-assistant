"use client";

import { useEffect, useRef } from "react";
import { Link } from "@/components/app/Link";
import { InsetSection } from "@/components/app/Page";
import { Score } from "@/components/app/Score";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { toPage } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { cellarBottleHref, type DiaryEntry, diaryEntry } from "./adapter";
import { BottleThumb } from "./BottleThumb";
import { CellarItemsEmpty } from "./CellarItemsEmpty";
import { type CellarItemsArgs, cellarDiaryVariables } from "./cellarItemsQuery";
import { diaryMonths, finishedLine, logLine } from "./diary";
import { GetCellarDiaryQuery } from "./fragments";

type DiaryArgs = Pick<CellarItemsArgs, "search" | "types">;

/**
 * The status segment's **Finished**, as a diary (X04): the bottles you got
 * to the bottom of, by the month you finished them, latest first — each with
 * when it was finished, how long it lasted once open, what you logged from it
 * (your own logs only) and your rating.
 *
 * Not the grid: a finished bottle is a memory, read as a list of dates and
 * notes, not shopped as a wall of labels. Pages with "Show more" (no
 * virtualiser — a diary is read, not flicked through by the hundred).
 */
export function FinishedDiary({
  cellarId,
  search,
  types,
  timeZone,
  canAdd,
  initialEntries,
  initialCursor,
  initialHasNextPage,
  totalCount,
}: {
  cellarId: string;
  search: string;
  types: CellarItemsArgs["types"];
  /** The zone the server cut months in, so hydration prints the same. */
  timeZone: string;
  canAdd: boolean;
  initialEntries: DiaryEntry[];
  initialCursor: string | null;
  initialHasNextPage: boolean;
  totalCount: number | null;
}) {
  const args: DiaryArgs = { search, types };
  const list = usePagedConnection({
    query: GetCellarDiaryQuery,
    variables: (current: DiaryArgs, after) =>
      cellarDiaryVariables(cellarId, current, after),
    select: (data) => {
      const cellar = unwrapResult(data?.cellar, "Cellar");
      return cellar.ok
        ? {
            ok: true,
            data: toPage(cellar.data.itemGroups, (edge) =>
              diaryEntry(edge.node),
            ),
          }
        : cellar;
    },
    initial: {
      rows: initialEntries,
      endCursor: initialCursor,
      hasNextPage: initialHasNextPage,
      totalCount,
    },
    initialArgs: args,
  });

  // A new server page (a search, a filter, a pour elsewhere) replaces the
  // list rather than appending to a stale one.
  const prevInitial = useRef(initialEntries);
  const { replace } = list;
  useEffect(() => {
    if (prevInitial.current === initialEntries) return;
    prevInitial.current = initialEntries;
    replace({
      rows: initialEntries,
      endCursor: initialCursor,
      hasNextPage: initialHasNextPage,
      totalCount,
    });
  }, [initialEntries, initialCursor, initialHasNextPage, totalCount, replace]);

  const entries = list.rows;
  if (entries.length === 0) {
    if (list.failure !== null) return <ApiError error={list.failure} />;
    return (
      <CellarItemsEmpty
        cellarId={cellarId}
        canAdd={canAdd}
        search={search}
        types={types}
        status="finished"
      />
    );
  }

  const months = diaryMonths(
    entries.map((entry) => ({
      ...entry,
      id: entry.cell.item.id,
      emptyAt: entry.cell.bottle.emptyAt,
      openAt: entry.cell.bottle.openAt,
    })),
    timeZone,
  );

  return (
    <div data-slot="finished-diary" className="flex flex-col gap-5">
      {months.map((month) => (
        <InsetSection key={month.key} label={month.label}>
          {month.entries.map((entry) => (
            <DiaryRow
              key={entry.id}
              cellarId={cellarId}
              entry={entry}
              timeZone={timeZone}
            />
          ))}
        </InsetSection>
      ))}

      {list.failure !== null && <ApiError error={list.failure} />}
      {list.hasNextPage && (
        <Button
          variant="ghost"
          className="self-center"
          disabled={list.status === "loadingMore"}
          aria-busy={list.status === "loadingMore" || undefined}
          onClick={() => void list.loadMore()}
        >
          {list.status === "loadingMore" && <Spinner aria-hidden />}
          Show more
        </Button>
      )}
    </div>
  );
}

function DiaryRow({
  cellarId,
  entry,
  timeZone,
}: {
  cellarId: string;
  entry: DiaryEntry & {
    id: string;
    emptyAt: string | null;
    openAt: string | null;
  };
  timeZone: string;
}) {
  const { cell, log } = entry;
  const { item, type } = cell;
  const yourLog = logLine(log);
  const note = log?.lastNote ?? null;
  const title =
    type === "WINE" && item.vintage !== undefined
      ? `${item.vintage} ${item.name}`
      : item.name;
  return (
    <div
      data-slot="diary-entry"
      className="relative flex items-start gap-3 px-4 py-3 has-[a[data-slot=link]]:active:bg-surface-3"
    >
      <BottleThumb cell={cell} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          overlay
          underline="none"
          href={cellarBottleHref(cellarId, cell)}
          className="type-body line-clamp-2 font-semibold text-ink-1"
        >
          {title}
        </Link>
        <p className="type-footnote">{finishedLine(entry, timeZone)}</p>
        {yourLog !== null && (
          <p className="type-footnote text-ink-2">{yourLog}</p>
        )}
        {note !== null && (
          <p className="type-callout line-clamp-2 text-ink-2 italic">
            “{note}”
          </p>
        )}
      </div>
      {item.myScore !== null && item.myScore !== undefined && (
        <div className="shrink-0 pt-0.5">
          <Score value={item.myScore} />
        </div>
      )}
    </div>
  );
}
