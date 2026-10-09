"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useMutation, useQuery } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { IconButton } from "@/components/app/IconButton";
import { Add, Cocktail, Delete, Edit, More } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { InsetSection } from "@/components/app/Page";
import { Score } from "@/components/app/Score";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Timestamp } from "@/components/common/Timestamp";
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

  const openNew = () => {
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
        label="Your log"
        className={className}
        action={
          rows.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={openNew}
              // 36 px on the label row, inside a 44 px target (FilterChip's
              // recipe): `sm` alone is for dense desktop rows.
              className="relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']"
            >
              <Add aria-hidden />
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
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="type-body text-ink-1">Nothing logged yet.</p>
            <p className="type-footnote">
              Log a glass to remember it — where, who with, what you noticed.
              Your review stays separate.
            </p>
            <Button onClick={openNew}>
              <Cocktail aria-hidden />
              Log a drink
            </Button>
          </div>
        ) : (
          <ul
            aria-label="Your log"
            className="flex flex-col divide-y divide-line"
          >
            {rows.map((row) => (
              <li
                key={row.id}
                data-slot="drink-log-entry"
                className="flex min-h-11 items-start gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="type-callout tabular font-semibold text-ink-1">
                      <Timestamp iso={row.createdAt} precision="date" />
                    </span>
                    <Score value={row.score} />
                  </div>
                  {row.note !== null && (
                    <p className="type-body line-clamp-3 text-ink-2">
                      {row.note}
                    </p>
                  )}
                  {row.tags.length > 0 && (
                    <ul
                      aria-label="Flavours"
                      className="flex flex-wrap gap-1.5"
                    >
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
                {row.photoUrl !== null && (
                  // biome-ignore lint/performance/noImgElement: a presigned URL that expires; next/image would cache it past its life
                  <img
                    src={row.photoUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-sm object-cover"
                  />
                )}
                {(row.canEdit || row.canRemove) && (
                  <IconButton
                    aria-label="More for this log"
                    variant="ghost"
                    className="-mr-2 shrink-0"
                    onClick={() => setActionsFor(row)}
                  >
                    <More aria-hidden />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {total > rows.length && (
          <p className="type-footnote px-4 py-2">
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
        title="This log"
        hideTitle
      >
        <div className="flex flex-col gap-1 pb-2">
          {actionsFor?.canEdit && (
            <Button
              variant="ghost"
              className="justify-start"
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
              className="justify-start text-destructive"
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
