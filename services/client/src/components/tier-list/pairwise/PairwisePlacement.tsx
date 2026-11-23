"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClient } from "urql";
import { ICON_STROKE, Place } from "@/components/app/icons";
import { VesselSilhouette } from "@/components/app/LabelPlate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { useTierListActions } from "../actions";
import { entryTypeOf, itemDisplayFromNode } from "../adapter";
import type { AddEntryCandidate } from "../add-entry";
import { BAND_LABELS } from "../constants";
import { bandForScore } from "../history";
import { GetTierListQuery, TIER_LIST_ITEMS_PAGE_SIZE } from "../queries";
import {
  answer,
  currentRival,
  type PlacementAnswer,
  type PlacementEntry,
  type PlacementResult,
  type PlacementState,
  placedBetween,
  placedRank,
  placementResult,
  remainingQuestions,
  skip,
  startPlacement,
  stepLabel,
  tapsLabel,
} from "./placement";

/** Lists are curated; this bounds a runaway cursor, not a real list. */
const MAX_BOARD_PAGES = 20;

type Placed = {
  result: PlacementResult;
  taps: number;
  /** The add's own edit, for Undo; null when the history did not name it. */
  editSeq: number | null;
};

/**
 * The board as it stands, every page of it: what the questions compare
 * against. Read fresh, not from the page's props, so a placement never
 * compares against a board another tab has since changed.
 */
function useBoard(tierListId: string) {
  const client = useClient();
  const [board, setBoard] = useState<PlacementEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const entries: PlacementEntry[] = [];
      let after: string | null = null;
      for (let page = 0; page < MAX_BOARD_PAGES; page += 1) {
        const response = await client
          .query(
            GetTierListQuery,
            { id: tierListId, first: TIER_LIST_ITEMS_PAGE_SIZE, after },
            { requestPolicy: "network-only" },
          )
          .toPromise();
        if (!live) return;
        const result = unwrapResult(response.data?.tierList, "TierList");
        if (response.error !== undefined || !result.ok) {
          setFailed(true);
          return;
        }
        for (const edge of result.data.items.edges) {
          const row = itemDisplayFromNode(edge.node);
          entries.push({
            id: row.id,
            name: row.name,
            band: row.band,
            position: row.position,
          });
        }
        const pageInfo: { hasNextPage: boolean; endCursor: string | null } =
          result.data.items.pageInfo;
        if (!pageInfo.hasNextPage || pageInfo.endCursor === null) break;
        after = pageInfo.endCursor;
      }
      setBoard(entries);
    })();
    return () => {
      live = false;
    };
  }, [client, tierListId]);

  return { board, failed };
}

/**
 * L09 — place one entry by answering "which do you like more?" (the Pairwise
 * board): the new entry against one already on the list, a few times, then
 * where it landed with an Undo. Binary search within the band its rating
 * gives it, then one look across the line (`placement.ts`); "About the same"
 * puts it next to that entry, Skip at the end of its band.
 *
 * The answer is one positioned add (M7), so the whole placement is one edit
 * in the list's history: Undo here — or anywhere the list's Undo is — takes
 * it back in one step.
 */
export function PairwisePlacement({
  tierListId,
  candidate,
  onDone,
}: {
  tierListId: string;
  candidate: AddEntryCandidate;
  onDone: () => void;
}) {
  const router = useRouter();
  const { addItemToTierListAction, undoAction } = useTierListActions();
  const { board, failed } = useBoard(tierListId);
  const band = bandForScore(candidate.myScore);
  const [state, setState] = useState<PlacementState | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const questionRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const commit = useCallback(
    async (finished: PlacementState) => {
      const result = placementResult(finished);
      if (result === null || board === null) return;
      setSaving(true);
      setError(null);
      const added = await addItemToTierListAction(
        tierListId,
        candidate.id,
        candidate.entityType,
        result.band,
        result.position,
      );
      setSaving(false);
      if (!added.success) {
        setError(added.error ?? "Couldn't place it just now.");
        return;
      }
      setPlaced({
        result,
        taps: finished.asked,
        editSeq: added.editSeq ?? null,
      });
      setAnnouncement(
        `${candidate.name} goes in ${BAND_LABELS[result.band]}, number ${placedRank(board, result)}.`,
      );
      router.refresh();
    },
    [addItemToTierListAction, board, candidate, router, tierListId],
  );

  // The first question, once the board is read — or, for an empty band,
  // straight to the add: there is nothing to compare with.
  useEffect(() => {
    if (board === null || state !== null) return;
    const start = startPlacement(board, band);
    setState(start);
    if (placementResult(start) !== null) void commit(start);
  }, [band, board, commit, state]);

  const respond = (next: PlacementState) => {
    setState(next);
    if (placementResult(next) !== null) void commit(next);
  };

  // Focus follows the conversation: each new question, then the result.
  const asked = state?.asked ?? 0;
  useEffect(() => {
    if (asked > 0) questionRef.current?.focus();
  }, [asked]);
  useEffect(() => {
    if (placed !== null) resultRef.current?.focus();
  }, [placed]);

  const undo = async () => {
    if (placed === null || placed.editSeq === null || board === null) return;
    setSaving(true);
    setError(null);
    const stepped = await undoAction(tierListId, placed.editSeq);
    setSaving(false);
    if (!stepped.success) {
      setError(stepped.error);
      return;
    }
    setPlaced(null);
    setState(startPlacement(board, band));
    setAnnouncement(`Took back ${candidate.name}. Which do you like more?`);
    router.refresh();
  };

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (failed) {
    return (
      <p
        role="alert"
        className="py-6 text-center text-destructive type-callout"
      >
        Couldn&apos;t read this list just now. Close and try again.
      </p>
    );
  }

  if (placed !== null && board !== null) {
    const { result } = placed;
    const bandLabel = BAND_LABELS[result.band] ?? "Unrated";
    return (
      <div
        data-slot="pairwise-result"
        className="flex min-h-[420px] flex-col items-center gap-4 pt-10 text-center"
      >
        {live}
        <span className="type-numeral-xl tabular text-primary">
          #{placedRank(board, result)}
        </span>
        <h2
          ref={resultRef}
          tabIndex={-1}
          className="text-ink-1 outline-none type-title-2"
        >
          {candidate.name} goes in {bandLabel}
        </h2>
        <p className="text-ink-2 type-callout">
          {result.how === "SKIPPED"
            ? `Put at the end of ${bandLabel}.`
            : placedBetween(board, result, bandLabel)}{" "}
          {placed.taps > 0 && tapsLabel(placed.taps)}
        </p>
        {error !== null && (
          <p role="alert" className="text-destructive type-callout">
            {error}
          </p>
        )}
        <div className="mt-auto flex w-full flex-col gap-1">
          <Button className="h-13 w-full rounded-full" onClick={onDone}>
            Done
          </Button>
          {placed.editSeq !== null && (
            <Button
              variant="ghost"
              className="h-11 w-full text-primary"
              disabled={saving}
              onClick={() => void undo()}
            >
              {saving && <Spinner aria-hidden />}
              Undo
            </Button>
          )}
        </div>
      </div>
    );
  }

  const rival = state === null ? null : currentRival(state);
  if (state === null || rival === null || board === null) {
    return (
      <div
        role="status"
        aria-label={saving ? `Placing ${candidate.name}` : "Reading your list"}
        className="flex flex-col gap-4 py-2"
      >
        {live}
        {error !== null ? (
          <p role="alert" className="text-destructive type-callout">
            {error}
          </p>
        ) : (
          <>
            <Skeleton className="h-7 w-56" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-56 rounded-[20px]" />
              <Skeleton className="h-56 rounded-[20px]" />
            </div>
          </>
        )}
      </div>
    );
  }

  const total = state.asked + remainingQuestions(state);
  const rivalRank = placedRank(board, {
    band: rival.band,
    position: rival.position,
    how: "ANSWERED",
  });
  const bandLabel = BAND_LABELS[band] ?? "Unrated";
  const pick = (choice: PlacementAnswer) => respond(answer(state, choice));

  return (
    <div data-slot="pairwise-question" className="flex flex-col gap-4.5">
      {live}
      <div className="flex items-center justify-between gap-3">
        <h2
          ref={questionRef}
          tabIndex={-1}
          aria-describedby="pairwise-step"
          className="text-ink-1 outline-none type-title-2"
        >
          Which do you like more?
        </h2>
        <span id="pairwise-step" className="shrink-0 tabular type-footnote">
          <span className="sr-only">Question </span>
          {stepLabel(state)}
        </span>
      </div>
      <div aria-hidden className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the dots are positions, nothing else
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < state.asked
                ? "bg-primary"
                : i === state.asked
                  ? "bg-primary/65"
                  : "bg-ink-1/15",
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ChoiceCard
          label={`${candidate.name}, the new one`}
          eyebrow="New"
          name={candidate.name}
          entityType={candidate.entityType}
          fresh
          disabled={saving}
          onPick={() => pick("NEW")}
        />
        <ChoiceCard
          label={`${rival.name}, ${BAND_LABELS[rival.band]} number ${rivalRank}`}
          eyebrow={`${BAND_LABELS[rival.band]} · #${rivalRank}`}
          name={rival.name}
          entityType={candidate.entityType}
          disabled={saving}
          onPick={() => pick("OLD")}
        />
      </div>

      {error !== null && (
        <p role="alert" className="text-destructive type-callout">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-1">
        <Button
          variant="secondary"
          className="h-12 w-full rounded-full bg-surface-3 type-body font-medium"
          disabled={saving}
          onClick={() => pick("SAME")}
        >
          About the same
        </Button>
        <Button
          variant="ghost"
          className="h-11 w-full text-ink-2 type-callout"
          disabled={saving}
          onClick={() => respond(skip(state))}
        >
          Skip, put it at the end of {bandLabel}
        </Button>
      </div>
    </div>
  );
}

/** One side of the question: the whole card is the button. */
function ChoiceCard({
  label,
  eyebrow,
  name,
  entityType,
  fresh = false,
  disabled,
  onPick,
}: {
  label: string;
  eyebrow: string;
  name: string;
  entityType: AddEntryCandidate["entityType"];
  fresh?: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const type = entryTypeOf(entityType);
  return (
    <button
      type="button"
      aria-label={label}
      data-slot="pairwise-choice"
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "flex min-h-11 min-w-11 flex-col gap-3 rounded-[20px] bg-surface-3 p-3.5 text-left text-ink-1 outline-none transition-transform duration-(--ca-dur-micro) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:active:scale-[0.98] disabled:opacity-60",
        fresh && "shadow-[inset_0_0_0_2px_var(--ca-accent)]",
      )}
    >
      <span
        aria-hidden
        className="flex h-[150px] items-center justify-center rounded-xl bg-ink-1/[0.06]"
      >
        {type === "PLACE" ? (
          <Place strokeWidth={ICON_STROKE} className="size-10 text-ink-3" />
        ) : (
          <VesselSilhouette
            type={type}
            className="h-24 text-type-spirit-text"
          />
        )}
      </span>
      <span
        aria-hidden
        className={cn("type-overline", fresh ? "text-primary" : "text-ink-3")}
      >
        {eyebrow}
      </span>
      <span aria-hidden className="line-clamp-2 type-headline">
        {name}
      </span>
    </button>
  );
}
