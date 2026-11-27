"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useClient, useMutation, useQuery } from "urql";
import { FilterChip } from "@/components/app/FilterChip";
import { ErrorIcon } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { BandSheet } from "@/components/app/parts/BandSheet";
import { type Band, bandName } from "@/components/app/parts/Rank";
import { formatKitScore } from "@/components/app/parts/Stars";
import { RatingInput } from "@/components/app/RatingInput";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { useNavigate } from "@/components/app/useNavigate";
import { ApiError } from "@/components/cellar-api/ApiError";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  CompanionPicker,
  type DrinkLogFriend,
  useDrinkLogFriends,
} from "@/components/drink-log/CompanionPicker";
import {
  DeleteDrinkLogMutation,
  DrinkLogEntryFragment,
  LogDrinkMutation,
} from "@/components/drink-log/queries";
import { WhenPicker } from "@/components/drink-log/WhenPicker";
import { useFinishToast } from "@/components/item/FinishBottleDialogs";
import { useFinishBottle } from "@/components/item/useFinishBottle";
import { historyStepFailure } from "@/components/tier-list/history";
import {
  ReorderBandMutation,
  UndoTierListEditMutation,
} from "@/components/tier-list/queries";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/api/auth-client";
import { UpdateCellarItemMutation } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import {
  AddItemReviewMutation,
  UpdateItemReviewMutation,
} from "@/lib/api/items";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { PourLevel } from "./PourLevel";
import {
  type BottleBefore,
  bandCounts,
  bandMoveOrder,
  type Companion,
  canPourTo,
  clampLevel,
  containerLabel,
  crossesStop,
  defaultPour,
  GLASS_PRESETS,
  type ListPlacement,
  levelAfterPreset,
  levelStops,
  meAndLabel,
  movedEditSeq,
  notYetLevel,
  ownPlacements,
  pourAmount,
  pourBottleInput,
  pouredMessage,
  pourLabel,
  pourVerb,
  presetAmount,
  rankAfterMove,
  rankOf,
  rememberedCompanions,
  undoPourBottleInput,
} from "./pour-plan";
import {
  PourFollowUpQuery,
  PourTierListBandQuery,
  PourTierListHistoryQuery,
} from "./queries";
import {
  readRememberedCompanions,
  rememberCompanions,
} from "./remembered-companions";

export type PourBottle = {
  readonly cellarId: string;
  readonly cellarItemId: string;
  readonly openAt: string | null;
  readonly percentageRemaining: number;
};

export type PourSubject = {
  readonly itemType: ApiItemType;
  readonly itemId: string;
  readonly itemName: string;
};

type Step = "pour" | "finish" | "rate" | "band";

const mintId = (): string => crypto.randomUUID();

/**
 * The Pour sheet (X03): **open + log + level** in one thumb-zone action from
 * the bottle — the bottle page's ActionBar and the cellar's bottle cards.
 *
 * 1. **Pour.** The liquid in the bottle's silhouette is the control
 *    (`PourLevel`; a plain slider under reduced motion). Per-type glass
 *    presets move it — a glass of wine is 150 ml of 750 — and "The rest"
 *    empties it. "Just me" / "me + Sam" / "Others…" replaces Bulk Check In;
 *    "When" backdates. The button writes `logDrink` (with the bottle) and
 *    then one `updateCellarItem` — the level, and `openAt` for a sealed
 *    bottle, which is how the first pour opens it. A toast offers Undo:
 *    the log deleted and the level (and the seal) put back.
 * 2. **The last pour** (level 0) does not write a level. The sheet asks
 *    "Finished?" itself (N13a's question, with N13a's Undo toast after):
 *    Finished empties the bottle; Not yet leaves a drop.
 * 3. **Rate** — the review (one per item, D5), not this log: the N30
 *    `RatingInput`, prefilled with your rating if you have one.
 * 4. **A band from that rating** (`bandForScore`, X23's rule) for each of
 *    your tier lists the item is on: "Move to Outstanding" in one tap,
 *    with Undo through the list's own history.
 *
 * Retrying after a failure is safe: the log's id is minted once per opening,
 * so a second "Pour" is the same log (§8.4) and then the level it missed.
 */
export function PourSheet({
  open,
  onOpenChange,
  bottle,
  subject,
  friends: preloadedFriends,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bottle: PourBottle;
  subject: PourSubject;
  /** The viewer's friends when the page already read them. */
  friends?: readonly DrinkLogFriend[];
  /** After any write: re-read the page. */
  onChanged?: () => void;
}) {
  const type = subject.itemType;
  const finish = useFinishBottle({
    cellarId: bottle.cellarId,
    cellarItemId: bottle.cellarItemId,
  });
  useFinishToast(finish);

  // What the bottle was when the sheet opened: what the level starts from
  // and what Undo puts back.
  const [before, setBefore] = useState<BottleBefore>({
    percentageRemaining: clampLevel(bottle.percentageRemaining),
    openAt: bottle.openAt,
  });
  const from = before.percentageRemaining;
  const [step, setStep] = useState<Step>("pour");
  const [level, setLevel] = useState(() => defaultPour(type, from));
  const [companionIds, setCompanionIds] = useState<readonly string[]>([]);
  const [othersOpen, setOthersOpen] = useState(false);
  const [drankAt, setDrankAt] = useState<string | null>(null);
  const [whenProblem, setWhenProblem] = useState<string | null>(null);
  const [logId, setLogId] = useState(mintId);
  const [pouredAt, setPouredAt] = useState<string | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [remembered, setRemembered] = useState<Companion[]>([]);
  // Whose "who with" to offer: nobody's until the session says (F-57).
  const viewerId = useSession().session?.user.id ?? null;

  // A fresh pour every time the sheet opens.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const snapshot = {
        percentageRemaining: clampLevel(bottle.percentageRemaining),
        openAt: bottle.openAt,
      };
      setBefore(snapshot);
      setStep("pour");
      setLevel(defaultPour(type, snapshot.percentageRemaining));
      setCompanionIds([]);
      setOthersOpen(false);
      setDrankAt(null);
      setLogId(mintId());
      setPouredAt(null);
      setError(null);
    }
    wasOpen.current = open;
  }, [open, bottle.percentageRemaining, bottle.openAt, type]);
  // Re-read whenever the sheet opens or the account changes under it.
  useEffect(() => {
    if (open) setRemembered(readRememberedCompanions(viewerId));
  }, [open, viewerId]);

  const { friends, known } = useDrinkLogFriends(preloadedFriends, !open);
  const recent = rememberedCompanions(remembered, known ? friends : null);
  const companionsOf = (ids: readonly string[]): Companion[] =>
    ids.flatMap((id) => {
      const found =
        friends.find((friend) => friend.id === id) ??
        recent.find((companion) => companion.id === id);
      return found === undefined ? [] : [found];
    });

  const [, logDrink] = useMutation(LogDrinkMutation);
  const [, deleteDrinkLog] = useMutation(DeleteDrinkLogMutation);
  const [, updateItem] = useMutation(UpdateCellarItemMutation);

  const setBottle = useCallback(
    async (input: { percentageRemaining: number; openAt?: string | null }) =>
      unwrapResult(
        (
          await updateItem({
            cellarId: bottle.cellarId,
            cellarItemId: bottle.cellarItemId,
            input,
          })
        ).data?.updateCellarItem,
        "CellarItem",
      ),
    [bottle.cellarId, bottle.cellarItemId, updateItem],
  );

  const undoPour = useCallback(
    async (id: string, snapshot: BottleBefore) => {
      const removed = unwrapResult(
        (await deleteDrinkLog({ id })).data?.deleteDrinkLog,
        "DeletedDrinkLogPayload",
      );
      const restored = await setBottle(undoPourBottleInput(snapshot));
      onChanged?.();
      if (!removed.ok || !restored.ok) {
        notify("Couldn't undo all of that pour", {
          tone: "error",
          description: (!removed.ok
            ? removed.error
            : restored.ok
              ? null
              : restored.error
          )?.message,
        });
        return;
      }
      notify("Pour undone");
    },
    [deleteDrinkLog, onChanged, setBottle],
  );

  const pour = async () => {
    setBusy(true);
    setError(null);
    const logged = unwrapResult(
      (
        await logDrink({
          id: logId,
          input: {
            item: { type, id: subject.itemId },
            bottle: {
              cellarId: bottle.cellarId,
              cellarItemId: bottle.cellarItemId,
            },
            ...(companionIds.length > 0
              ? { companionIds: [...companionIds] }
              : {}),
            ...(drankAt === null ? {} : { drankAt }),
          },
        })
      ).data?.logDrink,
      "LoggedDrinkPayload",
    );
    if (!logged.ok) {
      setBusy(false);
      setError(logged.error);
      return;
    }
    if (companionIds.length > 0)
      rememberCompanions(viewerId, companionsOf(companionIds));
    const at = readFragment(DrinkLogEntryFragment, logged.data.entry)
      .createdAt as string;
    setPouredAt(at);

    if (level === 0) {
      // The last of it: a question, not a write (N13a).
      setBusy(false);
      setStep("finish");
      onChanged?.();
      return;
    }
    const saved = await setBottle(pourBottleInput(before, level, at));
    setBusy(false);
    if (!saved.ok) {
      // The drink is logged; the level is not. "Pour" again is the same log
      // (its id) and then the level.
      setError(saved.error);
      onChanged?.();
      return;
    }
    onOpenChange(false);
    onChanged?.();
    const id = logId;
    const snapshot = before;
    notify(pouredMessage(type, from, level), {
      tone: "success",
      undo: () => void undoPour(id, snapshot),
    });
  };

  const notYet = async () => {
    setBusy(true);
    setError(null);
    const saved = await setBottle(
      pourBottleInput(
        before,
        notYetLevel(before),
        pouredAt ?? new Date().toISOString(),
      ),
    );
    setBusy(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    onOpenChange(false);
    onChanged?.();
    const id = logId;
    const snapshot = before;
    notify("Poured · a drop left", {
      tone: "success",
      undo: () => void undoPour(id, snapshot),
    });
  };

  // "Finished" → once the bottle is empty, on to the rating.
  const finishPhase = finish.state.phase;
  const finishError = finish.state.phase === "idle" ? finish.state.error : null;
  useEffect(() => {
    if (step === "finish" && finishPhase === "finished") setStep("rate");
  }, [step, finishPhase]);

  // After the last pour: your rating and the lists it is on.
  const [followUp, refetchFollowUp] = useQuery({
    query: PourFollowUpQuery,
    variables: { type: subject.itemType, itemId: subject.itemId },
    requestPolicy: "network-only",
    pause: !open || (step !== "rate" && step !== "band"),
  });
  const followed = unwrapResult(followUp.data?.item, "QueryItemSuccess");
  const followItem = followed.ok ? followed.data.data : null;
  const kept = followItem?.myReview?.score ?? null;
  const placements = ownPlacements(
    followItem?.tierListEntries.edges.map((edge) => edge.node) ?? [],
    followUp.data?.me?.id ?? null,
  ).filter((placement) => isBand(placement.band));

  const verb = pourVerb(type);
  const title =
    step === "pour"
      ? verb
      : step === "finish"
        ? "That’s the last of it"
        : "How was it?";

  const moveLevel = (next: number) => {
    if (crossesStop(level, next, levelStops(type, from))) feedback("detent");
    setLevel(next);
  };

  return (
    <>
      <ResponsiveDialog
        open={open && step !== "band"}
        onOpenChange={(next) => {
          if (busy) return;
          // Closing on "Finished?" is "Not yet": the drink is already logged,
          // and the bottle must not keep reading as if it had not been
          // poured. Not yet leaves a drop, closes the sheet and offers Undo.
          if (!next && step === "finish" && finishPhase === "idle") {
            void notYet();
            return;
          }
          onOpenChange(next);
        }}
        dismissible={!busy && finishPhase !== "finishing"}
        title={title}
        description={
          step === "rate"
            ? kept === null
              ? subject.itemName
              : `${subject.itemName} · you gave it ${formatKitScore(kept)}`
            : undefined
        }
        footer={
          step === "pour" ? (
            <Button
              className="w-full"
              disabled={busy || !canPourTo(from, level) || whenProblem !== null}
              aria-busy={busy || undefined}
              onClick={() => void pour()}
              data-slot="pour-submit"
            >
              {busy && <Spinner aria-hidden />}
              {error !== null && pouredAt !== null
                ? "Try again"
                : pourLabel(type, from, level)}
            </Button>
          ) : step === "finish" ? (
            <div className="grid w-full grid-cols-2 gap-3">
              <Button
                variant="outline"
                disabled={busy || finishPhase === "finishing"}
                onClick={() => void notYet()}
              >
                Not yet
              </Button>
              <Button
                disabled={busy || finishPhase === "finishing"}
                aria-busy={finishPhase === "finishing" || undefined}
                onClick={() =>
                  finish.finishNow({
                    percentageRemaining: before.percentageRemaining,
                    openAt: before.openAt,
                  })
                }
              >
                {finishPhase === "finishing" && <Spinner aria-hidden />}
                Finished
              </Button>
            </div>
          ) : null
        }
      >
        {open && step === "pour" && (
          <div className="flex flex-col gap-5 pb-2" data-slot="pour-sheet">
            <div className="flex gap-4">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <PourLevel
                  type={type}
                  from={from}
                  value={level}
                  onChange={moveLevel}
                />
                <span
                  className="t-cap tabular font-semibold text-ink-2"
                  data-slot="pour-container"
                >
                  {containerLabel(type)}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <p className="m-0 flex flex-col" aria-live="polite">
                  <span className="t-score text-ink">{level}%</span>
                  <span className="t-cap text-ink-2">
                    {from === 0
                      ? "left · the last of it"
                      : level >= from
                        ? "left · drag the level down"
                        : `left · ${verb === "Steep" ? "steeping" : "pouring"} ${pourAmount(type, from, level)}`}
                  </span>
                </p>
                <GlassPresets
                  type={type}
                  from={from}
                  level={level}
                  onPick={setLevel}
                />
              </div>
            </div>

            <WhoWith
              recent={recent}
              selected={companionIds}
              onChange={setCompanionIds}
              othersOpen={othersOpen}
              onOthersOpen={setOthersOpen}
              preloaded={preloadedFriends}
            />

            <WhenPicker
              inline
              value={drankAt}
              onChange={setDrankAt}
              onProblem={setWhenProblem}
            />

            {error !== null &&
              (pouredAt !== null ? (
                <p
                  role="alert"
                  className="t-cap m-0 flex items-center gap-1.5 text-danger"
                  data-slot="pour-level-error"
                >
                  <ErrorIcon aria-hidden className="size-4 shrink-0" />
                  Logged, but the level didn’t save.
                </p>
              ) : (
                <ApiError error={error} />
              ))}
          </div>
        )}

        {open && step === "finish" && (
          <div className="flex flex-col gap-3 pb-2">
            <p className="t-body m-0 text-ink-2">
              Finish the bottle? It leaves the cellar. Your log keeps every
              glass.
            </p>
            {finishError !== null && (
              <p role="alert" className="t-cap m-0 text-danger">
                {finishError}
              </p>
            )}
            {error !== null && <ApiError error={error} />}
          </div>
        )}

        {open && step === "rate" && (
          <RateStep
            subject={subject}
            loading={followUp.fetching && followUp.data === undefined}
            reviewId={followItem?.myReview?.id ?? null}
            kept={kept}
            onRated={() => {
              refetchFollowUp({ requestPolicy: "network-only" });
              if (placements.length > 0) setStep("band");
              else onOpenChange(false);
            }}
            onKeep={() => {
              if (placements.length > 0) setStep("band");
              else onOpenChange(false);
            }}
            onSkip={() => onOpenChange(false)}
          />
        )}
      </ResponsiveDialog>

      {step === "band" && (
        <BandStep
          open={open}
          placements={placements}
          subject={subject}
          onDone={() => onOpenChange(false)}
        />
      )}
    </>
  );
}

const isBand = (band: number): band is Band =>
  band === 1 || band === 2 || band === 3 || band === 4 || band === 5;

/* -------------------------------------------------------------------------- */
/* Glass presets                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The type's three pours and "The rest", as full-width rows with the amount
 * at the right (Cellars-Pour 04): one is on when the level sits exactly
 * there. A tap ticks and moves the level on its spring.
 */
function GlassPresets({
  type,
  from,
  level,
  onPick,
}: {
  type: ApiItemType;
  from: number;
  level: number;
  onPick: (level: number) => void;
}) {
  const rows = [
    ...GLASS_PRESETS[type]
      .filter((preset) => levelAfterPreset(type, from, preset) > 0)
      .map((preset) => ({
        id: preset.id,
        label: preset.label,
        to: levelAfterPreset(type, from, preset),
        amount: presetAmount(type, preset),
      })),
    ...(from > 0
      ? [
          {
            id: "rest",
            label: "The rest",
            to: 0,
            amount: pourAmount(type, from, 0),
          },
        ]
      : []),
  ];
  return (
    <div
      role="radiogroup"
      aria-label="How much"
      className="flex flex-col gap-2"
    >
      {rows.map((row) => {
        const on = level === row.to;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a row that moves the level, styled as the board's option row.
          <button
            key={row.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-preset={row.id}
            onClick={() => {
              feedback("tick");
              onPick(row.to);
            }}
            className={cn(
              "flex min-h-11 items-center justify-between gap-3 rounded-md border px-4 text-left outline-none transition-transform active:scale-[.97] focus-visible:ring-[3px] focus-visible:ring-ring/50",
              on ? "border-edge-2 bg-sel text-ink" : "border-edge text-ink-2",
            )}
          >
            <span className="t-head min-w-0 truncate">{row.label}</span>
            <span className="t-cap tabular shrink-0 text-ink-2">
              {row.amount}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Who with                                                                    */
/* -------------------------------------------------------------------------- */

/** "Who" / "When": the row label at the left (Cellars-Pour 04). */
function RowLabel({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className="t-cap w-14 shrink-0 text-ink-2">
      {children}
    </span>
  );
}

/**
 * "Just me" / "me + Sam" / "With friends" — Bulk Check In, replaced.
 * "me + Sam" is the last table this account poured with on this device
 * (`localStorage`, keyed per account and forgotten on sign-out — see
 * `remembered-companions.ts`), kept to people who are still
 * your friends; "With friends" opens the picker.
 */
function WhoWith({
  recent,
  selected,
  onChange,
  othersOpen,
  onOthersOpen,
  preloaded,
}: {
  recent: readonly Companion[];
  selected: readonly string[];
  onChange: (ids: readonly string[]) => void;
  othersOpen: boolean;
  onOthersOpen: (open: boolean) => void;
  preloaded?: readonly DrinkLogFriend[];
}) {
  const ids = useId();
  const recentIds = recent.map((companion) => companion.id);
  const isRecent =
    recentIds.length > 0 &&
    selected.length === recentIds.length &&
    recentIds.every((id) => selected.includes(id));
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${ids}-who`}>
      <div className="flex items-center gap-3">
        <RowLabel id={`${ids}-who`}>Who</RowLabel>
        <div className="flex min-w-0 flex-wrap gap-2">
          <FilterChip
            selected={selected.length === 0 && !othersOpen}
            onClick={() => {
              onChange([]);
              onOthersOpen(false);
            }}
          >
            Just me
          </FilterChip>
          {recent.length > 0 && (
            <FilterChip
              selected={isRecent}
              onClick={() => {
                onChange(recentIds);
                onOthersOpen(false);
              }}
            >
              {meAndLabel(recent)}
            </FilterChip>
          )}
          <FilterChip
            selected={othersOpen || (selected.length > 0 && !isRecent)}
            aria-expanded={othersOpen}
            onClick={() => onOthersOpen(!othersOpen)}
          >
            {selected.length > 0 && !isRecent
              ? `With ${selected.length}`
              : "With friends"}
          </FilterChip>
        </div>
      </div>
      {othersOpen && (
        <CompanionPicker
          heading={null}
          preloaded={preloaded}
          selected={selected}
          onToggle={(id) =>
            onChange(
              selected.includes(id)
                ? selected.filter((value) => value !== id)
                : [...selected, id],
            )
          }
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* After the last pour: rate, then the band                                    */
/* -------------------------------------------------------------------------- */

/**
 * "How was it?" — the review (one per item, D5), not this glass. Stars and
 * the score; Skip, and the primary: "Keep 4.0" for the rating you have,
 * "Save 2.5" once the stars change.
 */
function RateStep({
  subject,
  loading,
  reviewId,
  kept,
  onRated,
  onKeep,
  onSkip,
}: {
  subject: PourSubject;
  loading: boolean;
  reviewId: string | null;
  kept: number | null;
  onRated: () => void;
  onKeep: () => void;
  onSkip: () => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = score ?? kept;
  const changed = score !== null && score !== kept;

  const [, addReview] = useMutation(AddItemReviewMutation);
  const [, updateReview] = useMutation(UpdateItemReviewMutation);

  const save = async () => {
    if (score === null) return;
    setSaving(true);
    setError(null);
    const saved =
      reviewId === null
        ? unwrapResult(
            (
              await addReview({
                itemId: subject.itemId,
                type: subject.itemType,
                input: { reviewId: crypto.randomUUID(), score },
              })
            ).data?.addItemReview,
            "ItemReview",
          )
        : unwrapResult(
            (
              await updateReview({
                itemId: subject.itemId,
                type: subject.itemType,
                reviewId,
                input: { score },
              })
            ).data?.updateItemReview,
            "ItemReview",
          );
    setSaving(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    notify(`Rated ${formatKitScore(score)} · ${subject.itemName}`, {
      tone: "success",
    });
    onRated();
  };

  return (
    <div className="flex flex-col gap-5 pb-2" data-slot="pour-rate">
      {loading ? (
        <Spinner aria-label="Loading your rating" />
      ) : (
        <RatingInput
          label={`Rate ${subject.itemName}`}
          value={shown}
          onChange={(next) => setScore(next)}
        />
      )}
      {error !== null && <ApiError error={error} />}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" disabled={saving} onClick={onSkip}>
          Skip
        </Button>
        <Button
          disabled={shown === null || saving || loading}
          aria-busy={saving || undefined}
          onClick={() => (changed ? void save() : onKeep())}
        >
          {saving && <Spinner aria-hidden />}
          {shown === null
            ? "Save"
            : changed
              ? `Save ${formatKitScore(shown)}`
              : `Keep ${formatKitScore(shown)}`}
        </Button>
      </div>
    </div>
  );
}

/**
 * The band step: F2b's `BandSheet` for each of your lists the drink is on,
 * one after another, showing where it really sits (ruling 3: a list's band
 * is the list's, not the stars'). Choosing a band moves it to that band's
 * end with `reorderTierListBand` and toasts "Moved to Very Good · #27 ·
 * Earl Grey" with Undo through the list's own history (D4).
 */
function BandStep({
  open,
  placements,
  subject,
  onDone,
}: {
  open: boolean;
  placements: readonly ListPlacement[];
  subject: PourSubject;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const placement = placements[index];
  const next = () => {
    if (index + 1 < placements.length) setIndex(index + 1);
    else onDone();
  };
  if (placement === undefined) return null;
  return (
    <ListBand
      // A fresh sheet (and read) per list.
      key={placement.tierListId}
      open={open}
      placement={placement}
      subject={subject}
      onClose={next}
    />
  );
}

function ListBand({
  open,
  placement,
  subject,
  onClose,
}: {
  open: boolean;
  placement: ListPlacement;
  subject: PourSubject;
  onClose: () => void;
}) {
  const [{ data }] = useQuery({
    query: PourTierListBandQuery,
    variables: { tierListId: placement.tierListId },
    requestPolicy: "network-only",
  });
  const [, reorder] = useMutation(ReorderBandMutation);
  const [, undoEdit] = useMutation(UndoTierListEditMutation);
  const client = useClient();
  const navigate = useNavigate();

  const list = unwrapResult(data?.tierList, "TierList");
  // `reorderTierListBand` takes the band's whole membership; past one page
  // the sheet cannot know it, nor the rank, so the list page places it.
  const tooLong = list.ok && list.data.items.pageInfo.hasNextPage;
  const items =
    list.ok && !tooLong ? list.data.items.edges.map((edge) => edge.node) : null;
  const band = isBand(placement.band) ? placement.band : 1;

  // A long list is the list page's to place: on to the next list, once.
  const skipped = useRef(false);
  useEffect(() => {
    if (tooLong && !skipped.current) {
      skipped.current = true;
      onClose();
    }
  }, [tooLong, onClose]);

  if (items === null) return null;
  const counts = bandCounts(items);
  const rank = rankOf(items, placement.entryId) ?? 1;
  const listHref = `/tier-lists/${placement.tierListId}`;

  const move = async (to: Band) => {
    const order = bandMoveOrder(items, placement.entryId, to);
    if (order === null) return;
    const moved = unwrapResult(
      (
        await reorder({
          tierListId: placement.tierListId,
          band: to,
          orderedIds: order,
        })
      ).data?.reorderTierListBand,
      "ReorderBandPayload",
    );
    if (!moved.ok) {
      notify(`Couldn’t move it on ${placement.name}`, {
        tone: "error",
        description: moved.error.message,
      });
      return;
    }
    // D4: an Undo names the edit it takes back. The move's payload does not
    // carry its `seq`, so read the list's top edit now and offer Undo only
    // when it is this move.
    const history = unwrapResult(
      (
        await client
          .query(
            PourTierListHistoryQuery,
            { tierListId: placement.tierListId },
            { requestPolicy: "network-only" },
          )
          .toPromise()
      ).data?.tierList,
      "TierList",
    );
    const seq = history.ok
      ? movedEditSeq(history.data.editHistory?.undo, band, to)
      : null;
    const landed = rankAfterMove(items, placement.entryId, to);
    notify(`Moved to ${bandName(to)} · #${landed} · ${subject.itemName}`, {
      tone: "success",
      undo:
        seq === null
          ? undefined
          : () => {
              void (async () => {
                const undone = unwrapResult(
                  (
                    await undoEdit({
                      tierListId: placement.tierListId,
                      expectedSeq: seq,
                    })
                  ).data?.undoTierListEdit,
                  "TierListHistoryStep",
                );
                if (!undone.ok)
                  notify("Couldn’t undo that move", {
                    tone: "error",
                    description: historyStepFailure("undo", undone.error),
                  });
              })();
            },
    });
  };

  return (
    <BandSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      subject={subject.itemName}
      rank={rank}
      band={band}
      listName={placement.name}
      counts={counts}
      onChoose={(to) => void move(to)}
      onExactPosition={() => navigate.push(listHref)}
    />
  );
}
