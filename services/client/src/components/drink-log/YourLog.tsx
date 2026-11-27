"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { IconButton } from "@/components/app/IconButton";
import {
  Cocktail,
  Delete,
  Edit,
  ICON_STROKE,
  More,
  Star,
} from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { InsetSection } from "@/components/app/Page";
import { HistoryList, HistoryRow } from "@/components/app/parts/HistoryRow";
import { formatKitScore } from "@/components/app/parts/Stars";
import { ApiError } from "@/components/cellar-api/ApiError";
import { useItemActions } from "@/components/item/ItemActions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { type LogDrinkMode, LogDrinkSheet } from "./LogDrinkSheet";
import {
  draftFromEntry,
  entryContext,
  type LogDraft,
  type LogSubject,
} from "./log-draft";
import { announceDrinkLogChanged } from "./log-events";
import {
  DeleteDrinkLogMutation,
  DrinkLogEntryFragment,
  ItemDrinkLogQuery,
  RestoreDrinkLogMutation,
} from "./queries";
import { useDrinkLogFeedback } from "./useDrinkLogFeedback";

/** The newest this many; the section says when there are more. */
const SHOWN = 20;

export type DrinkLogRow = {
  id: string;
  createdAt: string;
  score: number | null;
  note: string | null;
  tags: readonly string[];
  context: string;
  photoUrl: string | null;
  canEdit: boolean;
  /** Yours, and you logged it: "Who with" can still change. */
  canEditCompanions: boolean;
  canRemove: boolean;
  draft: LogDraft;
};

/** One `DrinkLogEntry` → a row: who with and where as one line. */
export const drinkLogRow = (
  node: FragmentOf<typeof DrinkLogEntryFragment>,
): DrinkLogRow => {
  const entry = readFragment(DrinkLogEntryFragment, node);
  const place = entry.place;
  return {
    id: entry.id,
    createdAt: entry.createdAt as string,
    score: entry.score,
    note: entry.note,
    tags: entry.tags,
    context: entryContext({
      companionNames: entry.companions.edges.map(
        (edge) => edge.node.displayName,
      ),
      companionCount: entry.companionIds.length,
      placeName: place === null ? null : (place.displayName ?? place.name),
    }),
    photoUrl: entry.photo?.url ?? null,
    canEdit: entry.isMine,
    canEditCompanions: entry.isMine && entry.createdById === entry.userId,
    canRemove: entry.canRemove,
    draft: draftFromEntry({
      score: entry.score,
      note: entry.note,
      tags: entry.tags,
      place,
      photo: entry.photo,
      createdAt: entry.createdAt as string,
      companionIds: entry.companionIds,
    }),
  };
};

/**
 * "Your log" (D8): every time you had this item, newest first — with or
 * without a bottle, each with its own optional score (never the review, D5),
 * note, flavour tags, place and companions. "Log a drink" opens the sheet.
 *
 * Reads `Item.checkIns(scope: MINE)` itself rather than through the page's
 * server query, so a log, an edit or an Undo re-reads just this section; the
 * page is refreshed too, for anything else that counts drinks.
 *
 * Deleting an entry does not ask first (X03): it goes at once, with **Undo**
 * on the toast (design §4.7 — a reversible removal gets Undo, not a confirm).
 * Undo is `restoreDrinkLog`, which puts back the same entries — ids, dates and
 * the companions' entries the delete took with it — so nothing about the
 * log reads differently afterwards.
 */
export function YourLog({
  subject,
  className,
}: {
  subject: LogSubject;
  className?: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<LogDrinkMode>({ kind: "new" });
  const [actionsFor, setActionsFor] = useState<DrinkLogRow | null>(null);
  // The ⋯ sheet is titled with the log's date and time (Cellars-Pour 28).
  const menuDate = useLocalDate(actionsFor?.createdAt ?? "", true);

  const [{ data, fetching, error }, reexecute] = useQuery({
    query: ItemDrinkLogQuery,
    variables: { type: subject.itemType, itemId: subject.itemId, first: SHOWN },
  });
  const refresh = useCallback(() => {
    reexecute({ requestPolicy: "network-only" });
    router.refresh();
  }, [reexecute, router]);
  const onSaved = useDrinkLogFeedback({
    itemName: subject.itemName,
    onChanged: refresh,
  });
  const [, deleteDrinkLog] = useMutation(DeleteDrinkLogMutation);
  const [, restoreDrinkLog] = useMutation(RestoreDrinkLogMutation);

  const result = unwrapResult(data?.item, "QueryItemSuccess");
  const connection = result.ok ? result.data.data.checkIns : null;
  const rows = connection?.edges.map((edge) => drinkLogRow(edge.node)) ?? [];
  const total = connection?.totalCount ?? rows.length;

  // X09: on the item page one "Log a drink" sheet serves the whole page —
  // the ActionBar, the bottle rows and this section — and says when a log
  // landed, so this list re-reads whichever of them wrote it.
  const actions = useItemActions();
  const logVersion = actions?.logVersion ?? 0;
  const seenVersion = useRef(logVersion);
  useEffect(() => {
    if (logVersion === seenVersion.current) return;
    seenVersion.current = logVersion;
    reexecute({ requestPolicy: "network-only" });
  }, [logVersion, reexecute]);

  const openNew = () => {
    if (actions !== null) {
      actions.logDrink();
      return;
    }
    setMode({ kind: "new" });
    setSheetOpen(true);
  };

  const restore = async (id: string) => {
    const restored = unwrapResult(
      (await restoreDrinkLog({ id })).data?.restoreDrinkLog,
      "RestoredDrinkLogPayload",
    );
    if (!restored.ok) {
      notify("Couldn't bring that log back", {
        tone: "error",
        description: restored.error.message,
      });
      return;
    }
    notify("Log restored", { tone: "success" });
    announceDrinkLogChanged(subject.itemId);
    refresh();
  };

  const remove = async (row: DrinkLogRow) => {
    const removed = unwrapResult(
      (await deleteDrinkLog({ id: row.id })).data?.deleteDrinkLog,
      "DeletedDrinkLogPayload",
    );
    if (!removed.ok) {
      notify("Couldn't delete that log", {
        tone: "error",
        description: removed.error.message,
      });
      return;
    }
    announceDrinkLogChanged(subject.itemId);
    refresh();
    notify(
      removed.data.ids.length > 1
        ? `Log deleted, with ${removed.data.ids.length - 1} for friends`
        : "Log deleted",
      { undo: () => void restore(row.id) },
    );
  };

  return (
    <>
      <InsetSection
        id="your-log"
        label="Your log"
        className={className}
        action={
          rows.length > 0 ? (
            <Button variant="quiet" className="-mr-2.5" onClick={openNew}>
              Log a drink
            </Button>
          ) : undefined
        }
      >
        {data === undefined && fetching ? (
          <div className="flex flex-col gap-2 p-4" aria-busy="true">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : !result.ok && (data !== undefined || error !== undefined) ? (
          <div className="p-4">
            <ApiError error={result.error} />
          </div>
        ) : rows.length === 0 ? (
          // KIT empty state: glyph, title, one action.
          <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
            <Cocktail
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-7 text-ink-3"
            />
            <p className="t-head m-0 text-ink">Nothing logged yet.</p>
            <Button variant="outline" onClick={openNew}>
              Log a drink
            </Button>
          </div>
        ) : (
          <HistoryList aria-label="Your log" className="px-4 py-3">
            {rows.map((row) => (
              <LogEntry
                key={row.id}
                row={row}
                onMore={
                  row.canEdit || row.canRemove
                    ? () => setActionsFor(row)
                    : undefined
                }
              />
            ))}
          </HistoryList>
        )}
        {total > rows.length && (
          <p className="t-cap text-ink-3 px-4 py-2">
            Showing your newest {rows.length} of {total}.
          </p>
        )}
      </InsetSection>

      <LogDrinkSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        subject={subject}
        mode={mode}
        onSaved={onSaved}
      />

      <BottomSheet
        open={actionsFor !== null}
        onOpenChange={(open) => {
          if (!open) setActionsFor(null);
        }}
        title={menuDate === "" ? "This log" : menuDate}
      >
        <div className="flex flex-col gap-1 pb-2">
          {actionsFor?.canEdit && (
            <Button
              variant="ghost"
              className="justify-start [&_svg]:text-act-ink"
              onClick={() => {
                const row = actionsFor;
                setActionsFor(null);
                setMode({
                  kind: "edit",
                  entryId: row.id,
                  initial: row.draft,
                  photoUrl: row.photoUrl,
                  canEditCompanions: row.canEditCompanions,
                });
                setSheetOpen(true);
              }}
            >
              <Edit aria-hidden />
              Edit
            </Button>
          )}
          {actionsFor?.canRemove && (
            <Button
              variant="ghost"
              className="justify-start text-danger"
              onClick={() => {
                const row = actionsFor;
                setActionsFor(null);
                void remove(row);
              }}
            >
              <Delete aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </BottomSheet>
    </>
  );
}

/** The viewer's own date ("Nov 24, 2026"), stable until mounted (Timestamp's rule). */
function useLocalDate(iso: string, time: boolean): string {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (!mounted) return iso.slice(0, 10);
  return date.toLocaleString(
    undefined,
    time
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  );
}

/**
 * One log (Cellars-Pour "Your log"): F2b's history row for the event
 * ("Rated 2.5" in the owner's gold, or "Checked in") and its date, then what
 * was noticed under it — note, flavours, who and where, the photo — and the
 * entry's ⋯.
 */
function LogEntry({ row, onMore }: { row: DrinkLogRow; onMore?: () => void }) {
  const date = useLocalDate(row.createdAt, false);
  const rated = row.score !== null;
  return (
    <>
      <HistoryRow
        glyph={
          rated ? (
            <Star aria-hidden strokeWidth={ICON_STROKE} />
          ) : (
            <Cocktail aria-hidden strokeWidth={ICON_STROKE} />
          )
        }
        owner={rated}
        date={date}
      >
        {row.score === null
          ? "Checked in"
          : `Rated ${formatKitScore(row.score)}`}
      </HistoryRow>
      <li
        data-slot="drink-log-entry"
        className="flex items-start gap-3 pb-2 pl-12"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {row.note !== null && (
            <p className="t-body m-0 line-clamp-3 text-ink">{row.note}</p>
          )}
          {row.tags.length > 0 && (
            <ul
              aria-label="Flavours"
              className="m-0 flex list-none flex-wrap gap-1.5 p-0"
            >
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
          {row.context !== "" && (
            <p className="t-cap m-0 truncate text-ink-2">{row.context}</p>
          )}
        </div>
        {row.photoUrl !== null && (
          // biome-ignore lint/performance/noImgElement: a presigned URL that expires; next/image would cache it past its life
          <img
            src={row.photoUrl}
            alt=""
            className="size-11 shrink-0 rounded-sm object-cover"
          />
        )}
        {onMore !== undefined && (
          <IconButton
            aria-label="More for this log"
            variant="ghost"
            className="-mt-2 -mr-2 shrink-0"
            onClick={onMore}
          >
            <More aria-hidden />
          </IconButton>
        )}
      </li>
    </>
  );
}
