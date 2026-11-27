"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "urql";
import { ChevronLeft, ICON_STROKE, Place } from "@/components/app/icons";
import { VesselSilhouette } from "@/components/app/LabelPlate";
import {
  type Band,
  BandMarker,
  BANDS as RANKED_BANDS,
  RankChip,
} from "@/components/app/parts/Rank";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
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
  type PlacedNeighbour,
  type PlacementAnswer,
  type PlacementEntry,
  type PlacementResult,
  type PlacementState,
  placedBetween,
  placedOutcome,
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
  /** CROSS-LOT: computed once, at the add — every line below reads these. */
  rank: number;
  above: PlacedNeighbour | null;
  below: PlacedNeighbour | null;
  /** Its band line ("Above Buffalo Trace, below Weller."), with the rank. */
  between: string;
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
  // One page at a time through `useQuery`, following the cursor until the
  // last: the pages read so far are kept, keyed by the cursor they came from.
  const [after, setAfter] = useState<string | null>(null);
  const [pages, setPages] = useState<ReadonlyMap<string, PlacementEntry[]>>(
    () => new Map(),
  );
  const [complete, setComplete] = useState(false);
  const [{ data, error, fetching, stale, operation }] = useQuery({
    query: GetTierListQuery,
    variables: { id: tierListId, first: TIER_LIST_ITEMS_PAGE_SIZE, after },
    requestPolicy: "network-only",
    pause: complete,
  });

  const result =
    data === undefined ? null : unwrapResult(data.tierList, "TierList");
  const failed = error !== undefined || (result !== null && !result.ok);

  // urql keeps the previous page's `data` while the next one is fetching, so
  // a result counts only once it answers the cursor asked for (CR-1):
  // otherwise page 1 is stored under page 2's cursor and the read stalls.
  const answered =
    !fetching && !stale && (operation?.variables.after ?? null) === after;

  useEffect(() => {
    if (!answered || result === null || !result.ok || complete) return;
    const key = after ?? "";
    if (pages.has(key)) return;
    const entries = result.data.items.edges.map((edge): PlacementEntry => {
      const row = itemDisplayFromNode(edge.node);
      return {
        id: row.id,
        name: row.name,
        band: row.band,
        position: row.position,
      };
    });
    setPages((current) => new Map(current).set(key, entries));
    const pageInfo: { hasNextPage: boolean; endCursor: string | null } =
      result.data.items.pageInfo;
    if (
      pageInfo.hasNextPage &&
      pageInfo.endCursor !== null &&
      pages.size + 1 < MAX_BOARD_PAGES
    ) {
      setAfter(pageInfo.endCursor);
    } else {
      setComplete(true);
    }
  }, [after, answered, complete, pages, result]);

  const board = useMemo(
    () => (complete ? Array.from(pages.values()).flat() : null),
    [complete, pages],
  );
  return { board, failed };
}

/**
 * L09 — place one entry by answering "which do you like more?" (the
 * Social-Placing board): first its band (skipped when your own rating already
 * says), then the new entry against one already on the list, a few times,
 * then where it landed — its neighbours either side — with Undo. Binary
 * search within the band, then one look across the line (`placement.ts`);
 * "About the same" puts it next to that entry, Skip at the end of its band.
 *
 * The answer is one positioned add (M7), so the whole placement is one edit
 * in the list's history: Undo here — or anywhere the list's Undo is — takes
 * it back in one step, and then "Place it again" puts it straight back where
 * it was, or "Choose again" starts from the band.
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
  const scored = bandForScore(candidate.myScore);
  /** The band it is placed in; null asks first (the band step). */
  const [band, setBand] = useState<number | null>(
    candidate.myScore === null || scored === 0 ? null : scored,
  );
  const [state, setState] = useState<PlacementState | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [saving, setSaving] = useState(false);
  // Whether Undo took this entry back (the pending screen's words).
  const [tookBack, setTookBack] = useState(false);
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
        feedback("refuse");
        setError(added.error ?? "Couldn't place it just now.");
        return;
      }
      // CROSS-LOT: the rank is computed here, once, against the board the
      // questions were asked on; nothing below recomputes it.
      const outcome = placedOutcome(board, result);
      const bandLabel = BAND_LABELS[result.band] ?? "Unrated";
      feedback(outcome.rank === 1 ? "success" : "detent");
      setPlaced({
        result,
        ...outcome,
        between:
          result.how === "SKIPPED"
            ? `Put at the end of ${bandLabel}.`
            : placedBetween(board, result, bandLabel),
        taps: finished.asked,
        editSeq: added.editSeq ?? null,
      });
      setTookBack(false);
      setAnnouncement(
        `${candidate.name} goes in ${bandLabel}, number ${outcome.rank}.`,
      );
      router.refresh();
    },
    [addItemToTierListAction, board, candidate, router, tierListId],
  );

  // The first question, once the board is read and the band chosen. An
  // empty band has nothing to compare with, so the pending screen says so
  // and waits for a tap: nothing is saved that the person did not ask for
  // (W-1).
  useEffect(() => {
    if (board === null || state !== null || band === null) return;
    setState(startPlacement(board, band));
  }, [band, board, state]);

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
      feedback("refuse");
      setError(stepped.error);
      return;
    }
    setPlaced(null);
    setTookBack(true);
    setAnnouncement(`Took back ${candidate.name}.`);
    router.refresh();
  };

  /** Back to the band step: the questions start again from there. */
  const chooseAgain = () => {
    setError(null);
    setTookBack(false);
    setState(null);
    setBand(null);
  };

  /** Back to the first question after a failed add (CR-2). */
  const startOver = () => {
    if (board === null || band === null) return;
    setError(null);
    setState(startPlacement(board, band));
  };

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {announcement}
    </p>
  );

  if (failed) {
    return (
      <p role="alert" className="t-body py-6 text-center text-danger">
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
        className="flex min-h-[420px] flex-col gap-4 pt-6"
      >
        {live}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="t-score tabular text-act-ink">#{placed.rank}</span>
          <h2
            ref={resultRef}
            tabIndex={-1}
            className="t-title m-0 text-ink outline-none"
          >
            {candidate.name} goes in {bandLabel}
          </h2>
          <p className="t-body m-0 text-ink-2">
            {placed.between} {placed.taps > 0 && tapsLabel(placed.taps)}
          </p>
        </div>
        {/* The landed state: the entry between its neighbours. */}
        <ol
          aria-label="Where it landed"
          className="m-0 flex list-none flex-col gap-1 p-0"
        >
          {placed.above !== null && (
            <LandedRow
              rank={placed.above.rank}
              band={placed.above.band}
              name={placed.above.name}
            />
          )}
          <LandedRow
            rank={placed.rank}
            band={result.band}
            name={candidate.name}
            current
          />
          {placed.below !== null && (
            <LandedRow
              rank={placed.below.rank}
              band={placed.below.band}
              name={placed.below.name}
            />
          )}
        </ol>
        {error !== null && (
          <p role="alert" className="t-body m-0 text-danger">
            {error}
          </p>
        )}
        <div className="mt-auto flex w-full flex-col gap-1">
          <Button className="w-full" onClick={onDone}>
            Done
          </Button>
          {placed.editSeq !== null && (
            <Button
              variant="quiet"
              className="w-full"
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

  // The band step: where it starts, when your own rating has not said.
  if (band === null && board !== null) {
    const counts = new Map<number, number>();
    for (const entry of board) {
      counts.set(entry.band, (counts.get(entry.band) ?? 0) + 1);
    }
    return (
      <div data-slot="pairwise-band" className="flex flex-col gap-3">
        {live}
        <h2 className="t-title m-0 text-ink">Which band is it?</h2>
        <p className="t-body m-0 text-ink-2">
          Then a few questions place {candidate.name} inside it.
        </p>
        <div role="radiogroup" aria-label="Band" className="flex flex-col">
          {RANKED_BANDS.map(({ band: b, name }) => (
            // biome-ignore lint/a11y/useSemanticElements: a sheet row that moves on at once, not a native radio.
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={false}
              onClick={() => {
                feedback("tick");
                setBand(b);
              }}
              className="flex min-h-11 h-[52px] items-center gap-3 rounded-md px-2 text-left outline-none active:bg-raised focus-visible:bg-raised"
            >
              <BandMarker band={b} />
              <span className="t-head min-w-0 flex-1 truncate text-ink">
                {name}
              </span>
              <span className="t-cap tabular text-ink-3">
                {counts.get(b) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // A finished placement that is not placed: nothing to compare with (an
  // empty band, W-1), the add failed, or Undo took it back. Each way the
  // sheet offers the next step, never a skeleton (CR-2).
  if (
    state !== null &&
    board !== null &&
    band !== null &&
    !saving &&
    placementResult(state) !== null
  ) {
    const bandLabel = BAND_LABELS[band] ?? "Unrated";
    return (
      <div
        data-slot="pairwise-pending"
        className="flex min-h-[420px] flex-col items-center gap-4 pt-10 text-center"
      >
        {live}
        {error !== null ? (
          <p role="alert" className="t-body m-0 text-danger">
            {error}
          </p>
        ) : tookBack ? (
          <p className="t-body m-0 text-ink-2">
            Took back {candidate.name}. It isn&apos;t on {bandLabel} now.
          </p>
        ) : (
          <p className="t-body m-0 text-ink-2">
            Nothing in {bandLabel} to compare {candidate.name} with yet, so it
            goes first.
          </p>
        )}
        <div className="mt-auto flex w-full flex-col gap-1">
          <Button className="w-full" onClick={() => void commit(state)}>
            {error !== null
              ? "Try again"
              : tookBack
                ? "Place it again"
                : "Place it"}
          </Button>
          {error !== null && state.asked > 0 && (
            <Button variant="quiet" className="w-full" onClick={startOver}>
              Start over
            </Button>
          )}
          {tookBack && error === null && (
            <Button variant="quiet" className="w-full" onClick={chooseAgain}>
              Choose again
            </Button>
          )}
          <Button variant="quiet-muted" className="w-full" onClick={onDone}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const rival = state === null ? null : currentRival(state);
  if (state === null || rival === null || board === null || band === null) {
    return (
      <div
        role="status"
        aria-label={saving ? `Placing ${candidate.name}` : "Reading your list"}
        className="flex flex-col gap-4 py-2"
      >
        {live}
        {error !== null ? (
          <p role="alert" className="t-body m-0 text-danger">
            {error}
          </p>
        ) : (
          <>
            <Skeleton className="h-7 w-56" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-56 rounded-lg" />
              <Skeleton className="h-56 rounded-lg" />
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
          className="t-title m-0 text-ink outline-none"
        >
          Which do you like more?
        </h2>
        <span id="pairwise-step" className="t-cap tabular shrink-0 text-ink-2">
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
                ? "bg-act"
                : i === state.asked
                  ? "bg-act/65"
                  : "bg-edge",
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
        <p role="alert" className="t-body m-0 text-danger">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-1">
        <Button
          variant="secondary"
          className="w-full"
          disabled={saving}
          onClick={() => pick("SAME")}
        >
          About the same
        </Button>
        <Button
          variant="quiet-muted"
          className="w-full"
          disabled={saving}
          onClick={() => respond(skip(state))}
        >
          Skip, put it at the end of {bandLabel}
        </Button>
        <Button
          variant="quiet-muted"
          className="w-full"
          disabled={saving}
          onClick={chooseAgain}
        >
          <ChevronLeft aria-hidden strokeWidth={ICON_STROKE} />
          Back to bands
        </Button>
      </div>
    </div>
  );
}

/** One row of the landed state: the rank chip, the name; the new one marked. */
function LandedRow({
  rank,
  band,
  name,
  current = false,
}: {
  rank: number;
  band: number;
  name: string;
  current?: boolean;
}) {
  const ranked = band >= 1 && band <= 5;
  return (
    <li
      aria-current={current ? "true" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3",
        current ? "border border-act-ink bg-card" : "opacity-70",
      )}
    >
      {ranked ? (
        // CROSS-LOT 1: the crown is the owner's #1 — and only the owner adds.
        <RankChip rank={rank} band={band as Band} crown={rank === 1} />
      ) : (
        <span className="t-cap tabular text-ink-3">#{rank}</span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          current ? "t-head text-ink" : "t-body text-ink-2",
        )}
      >
        {name}
      </span>
    </li>
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
      onClick={() => {
        feedback("tick");
        onPick();
      }}
      className={cn(
        "flex min-h-11 min-w-11 flex-col gap-3 rounded-lg border bg-card p-3.5 text-left text-ink outline-none transition-transform focus-visible:outline-2 focus-visible:outline-act-ink enabled:active:scale-[0.98] disabled:opacity-60",
        fresh ? "border-2 border-act-ink" : "border-edge",
      )}
    >
      <span
        aria-hidden
        className="flex h-[150px] items-center justify-center rounded-md bg-raised"
      >
        {type === "PLACE" ? (
          <Place strokeWidth={ICON_STROKE} className="size-10 text-glyph" />
        ) : (
          <VesselSilhouette
            type={type}
            className={cn("h-24", itemTypeTokens[type].textClass)}
          />
        )}
      </span>
      <span
        aria-hidden
        className={cn("t-micro", fresh ? "text-act-ink" : "text-ink-3")}
      >
        {eyebrow}
      </span>
      <span aria-hidden className="t-head line-clamp-2">
        {name}
      </span>
    </button>
  );
}
