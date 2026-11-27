"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useClient, useMutation, useQuery } from "urql";
import { FilterChip } from "@/components/app/FilterChip";
import { Check, People, Pour } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { RatingInput } from "@/components/app/RatingInput";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
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
import { BAND_LABELS } from "@/components/tier-list/constants";
import {
  bandForScore,
  historyStepFailure,
} from "@/components/tier-list/history";
import {
  ReorderBandMutation,
  UndoTierListEditMutation,
} from "@/components/tier-list/queries";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { UpdateCellarItemMutation } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import {
  AddItemReviewMutation,
  UpdateItemReviewMutation,
} from "@/lib/api/items";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { PourLevel } from "./PourLevel";
import {
  type BottleBefore,
  bandMoveOrder,
  type Companion,
  canPourTo,
  clampLevel,
  containerNote,
  defaultPour,
  GLASS_PRESETS,
  type ListPlacement,
  levelAfterPreset,
  meAndLabel,
  movedEditSeq,
  notYetLevel,
  ownPlacements,
  parseCompanions,
  pourBottleInput,
  pouredMessage,
  pourLabel,
  presetAmount,
  rememberedCompanions,
  undoPourBottleInput,
} from "./pour-plan";
import {
  PourFollowUpQuery,
  PourTierListBandQuery,
  PourTierListHistoryQuery,
} from "./queries";

/** Per-viewer convenience: the last "who with" poured with, on this device. */
const COMPANIONS_KEY = "ca.pour.lastCompanions";

const readRemembered = (): Companion[] => {
  try {
    return parseCompanions(window.localStorage.getItem(COMPANIONS_KEY));
  } catch {
    return [];
  }
};
const remember = (companions: readonly Companion[]): void => {
  try {
    window.localStorage.setItem(COMPANIONS_KEY, JSON.stringify(companions));
  } catch {
    // Private mode or blocked storage: the chip just isn't offered next time.
  }
};

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
      setRemembered(readRemembered());
    }
    wasOpen.current = open;
  }, [open, bottle.percentageRemaining, bottle.openAt, type]);

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
    if (companionIds.length > 0) remember(companionsOf(companionIds));
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

  const title =
    step === "pour"
      ? "Pour"
      : step === "finish"
        ? "That's the last of it"
        : step === "rate"
          ? "How was it?"
          : "On your lists";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        // Closing on "Finished?" is "Not yet": the drink is already logged,
        // and the bottle must not keep reading as if it had not been poured.
        // Not yet leaves a drop, closes the sheet and offers Undo.
        if (!next && step === "finish" && finishPhase === "idle") {
          void notYet();
          return;
        }
        onOpenChange(next);
      }}
      dismissible={!busy && finishPhase !== "finishing"}
      title={title}
      description={subject.itemName}
      footer={
        step === "pour" ? (
          <Button
            className="w-full"
            disabled={busy || !canPourTo(from, level) || whenProblem !== null}
            aria-busy={busy || undefined}
            onClick={() => void pour()}
            data-slot="pour-submit"
          >
            {busy ? <Spinner aria-hidden /> : <Pour aria-hidden />}
            {error !== null && pouredAt !== null
              ? "Try again"
              : pourLabel(type, from, level)}
          </Button>
        ) : step === "finish" ? (
          <div className="flex w-full flex-col gap-2 md:flex-row-reverse md:justify-start">
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
              {finishPhase === "finishing" ? (
                <Spinner aria-hidden />
              ) : (
                <Check aria-hidden />
              )}
              Finished
            </Button>
            <Button
              variant="ghost"
              disabled={busy || finishPhase === "finishing"}
              onClick={() => void notYet()}
            >
              Not yet — leave a drop
            </Button>
          </div>
        ) : null
      }
    >
      {open && step === "pour" && (
        <div className="flex flex-col gap-6 pb-2" data-slot="pour-sheet">
          <div className="flex flex-wrap items-end gap-4">
            <PourLevel
              type={type}
              from={from}
              value={level}
              onChange={setLevel}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="flex flex-col" aria-live="polite">
                <span className="t-score tabular text-ink-1">{level}%</span>
                <span className="t-cap text-ink-3">
                  {from === 0
                    ? "left — this is the last of it"
                    : level >= from
                      ? `left of ${from}% — drag the level down`
                      : `left · pouring ${from - level}%`}
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
          <p className="t-cap text-ink-3 -mt-3">{containerNote(type)}</p>

          <WhoWith
            recent={recent}
            selected={companionIds}
            onChange={setCompanionIds}
            othersOpen={othersOpen}
            onOthersOpen={setOthersOpen}
            preloaded={preloadedFriends}
          />

          <WhenPicker
            value={drankAt}
            onChange={setDrankAt}
            onProblem={setWhenProblem}
          />

          {error !== null && (
            <div className="flex flex-col gap-1">
              {pouredAt !== null && (
                <p className="t-cap text-ink-1">
                  Logged — but the level didn't save.
                </p>
              )}
              <ApiError error={error} />
            </div>
          )}
        </div>
      )}

      {open && step === "finish" && (
        <div className="flex flex-col items-center gap-4 pb-2 text-center">
          <PourLevel
            type={type}
            from={0}
            value={0}
            onChange={() => {}}
            readOnly
          />
          <p className="t-body text-ink-2">
            Finished the bottle? It leaves the cellar; every log of it stays,
            and you can undo this.
          </p>
          {finishError !== null && (
            <p role="alert" className="t-cap text-destructive">
              {finishError}
            </p>
          )}
          {error !== null && <ApiError error={error} />}
        </div>
      )}

      {open && (step === "rate" || step === "band") && (
        <AfterFinish
          step={step}
          subject={subject}
          onBand={() => setStep("band")}
          onDone={() => onOpenChange(false)}
        />
      )}
    </ResponsiveDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Glass presets                                                               */
/* -------------------------------------------------------------------------- */

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
  const presets = GLASS_PRESETS[type].filter(
    (preset) => levelAfterPreset(type, from, preset) > 0,
  );
  return (
    <ul aria-label="How much" className="flex flex-col items-start gap-2">
      {presets.map((preset) => {
        const to = levelAfterPreset(type, from, preset);
        return (
          <li key={preset.id}>
            <FilterChip
              selected={level === to}
              onClick={() => onPick(to)}
              data-preset={preset.id}
            >
              {preset.label}
              <span className="tabular opacity-70">
                {presetAmount(type, preset)}
              </span>
            </FilterChip>
          </li>
        );
      })}
      {from > 0 && (
        <li>
          <FilterChip
            selected={level === 0}
            onClick={() => onPick(0)}
            data-preset="rest"
          >
            The rest
          </FilterChip>
        </li>
      )}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Who with                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * "Just me" / "me + Sam" / "Others…" — Bulk Check In, replaced. "me + Sam"
 * is the last table you poured with on this device (`localStorage`, a
 * per-viewer convenience), kept to people who are still your friends.
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
      <h3 id={`${ids}-who`} className="t-cap font-semibold">
        Who
      </h3>
      <div className="flex flex-wrap gap-2">
        <FilterChip
          selected={selected.length === 0}
          onClick={() => {
            onChange([]);
            onOthersOpen(false);
          }}
        >
          Just me
        </FilterChip>
        {recent.length > 0 && (
          <FilterChip selected={isRecent} onClick={() => onChange(recentIds)}>
            {meAndLabel(recent)}
          </FilterChip>
        )}
        <FilterChip
          selected={othersOpen || (selected.length > 0 && !isRecent)}
          aria-expanded={othersOpen}
          icon={<People aria-hidden />}
          onClick={() => onOthersOpen(!othersOpen)}
        >
          {selected.length > 0 && !isRecent
            ? `me + ${selected.length}`
            : "Others…"}
        </FilterChip>
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
      {selected.length > 0 && !othersOpen && (
        <p className="t-cap text-ink-3">
          Each friend gets this pour in their own log.
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* After the last pour: rate, then a band                                      */
/* -------------------------------------------------------------------------- */

function AfterFinish({
  step,
  subject,
  onBand,
  onDone,
}: {
  step: "rate" | "band";
  subject: PourSubject;
  onBand: () => void;
  onDone: () => void;
}) {
  const [{ data, fetching }] = useQuery({
    query: PourFollowUpQuery,
    variables: { type: subject.itemType, itemId: subject.itemId },
    requestPolicy: "network-only",
  });
  const result = unwrapResult(data?.item, "QueryItemSuccess");
  const item = result.ok ? result.data.data : null;
  const myReview = item?.myReview ?? null;
  const placements = ownPlacements(
    item?.tierListEntries.edges.map((edge) => edge.node) ?? [],
    data?.me?.id ?? null,
  );
  const [score, setScore] = useState<number | null>(null);
  const [rated, setRated] = useState<number | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const shown = score ?? myReview?.score ?? null;
  // "Keep it" is only for a rating already saved, and suggests a band from
  // that one — not from stars tapped and then not saved.
  const kept = myReview?.score ?? null;
  const canKeep = placements.length > 0 && kept !== null;

  const [, addReview] = useMutation(AddItemReviewMutation);
  const [, updateReview] = useMutation(UpdateItemReviewMutation);

  const save = async () => {
    if (shown === null) return;
    setSaving(true);
    setError(null);
    const saved =
      myReview === null
        ? unwrapResult(
            (
              await addReview({
                itemId: subject.itemId,
                type: subject.itemType,
                input: { reviewId: crypto.randomUUID(), score: shown },
              })
            ).data?.addItemReview,
            "ItemReview",
          )
        : unwrapResult(
            (
              await updateReview({
                itemId: subject.itemId,
                type: subject.itemType,
                reviewId: myReview.id,
                input: { score: shown },
              })
            ).data?.updateItemReview,
            "ItemReview",
          );
    setSaving(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setRated(shown);
    if (placements.length > 0) {
      onBand();
      return;
    }
    notify(`Rated ${subject.itemName}`, { tone: "success" });
    onDone();
  };

  if (step === "band") {
    const verdict = rated ?? shown;
    return (
      <div className="flex flex-col gap-4 pb-2" data-slot="pour-bands">
        <p className="t-body text-ink-2">
          {verdict === null
            ? "Where it sits on your lists."
            : `Your ${verdict}★ reads as ${BAND_LABELS[bandForScore(verdict)] ?? "Unrated"}.`}
        </p>
        <ul className="flex flex-col divide-y divide-line rounded-md bg-surface-2">
          {placements.map((placement) => (
            <BandRow
              key={placement.tierListId}
              placement={placement}
              suggested={bandForScore(verdict)}
              itemName={subject.itemName}
            />
          ))}
        </ul>
        <Button className="w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-2" data-slot="pour-rate">
      <p className="t-body text-ink-2">
        Your rating of the {subject.itemName} — the one on its page, not this
        glass.
      </p>
      {fetching && data === undefined ? (
        <Spinner aria-label="Loading your rating" />
      ) : (
        <RatingInput
          label={`Rate ${subject.itemName}`}
          value={shown}
          onChange={(next) => setScore(next)}
          onClear={() => setScore(null)}
        />
      )}
      {error !== null && <ApiError error={error} />}
      <div className="flex w-full flex-col gap-2">
        <Button
          disabled={shown === null || saving}
          aria-busy={saving || undefined}
          onClick={() => void save()}
        >
          {saving ? <Spinner aria-hidden /> : <Check aria-hidden />}
          {myReview === null ? "Save rating" : "Update rating"}
        </Button>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            if (!canKeep) {
              onDone();
              return;
            }
            setScore(null);
            setRated(kept);
            onBand();
          }}
        >
          {canKeep ? "Keep my rating, see my lists" : "Skip"}
        </Button>
      </div>
    </div>
  );
}

/**
 * One of your lists: where the item sits, and — when your rating says
 * otherwise — "Move to <band>" in one tap (the band's order is kept; it
 * goes to the end), with Undo through the list's own history (D4).
 */
function BandRow({
  placement,
  suggested,
  itemName,
}: {
  placement: ListPlacement;
  suggested: number;
  itemName: string;
}) {
  const [{ data }] = useQuery({
    query: PourTierListBandQuery,
    variables: { tierListId: placement.tierListId },
    requestPolicy: "network-only",
  });
  const [band, setBand] = useState(placement.band);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, reorder] = useMutation(ReorderBandMutation);
  const [, undoEdit] = useMutation(UndoTierListEditMutation);
  const client = useClient();

  const list = unwrapResult(data?.tierList, "TierList");
  // `reorderTierListBand` takes the band's whole membership; past one page
  // the sheet cannot know it, so the move is the list page's to make.
  const tooLong = list.ok && list.data.items.pageInfo.hasNextPage;
  const items =
    list.ok && !tooLong ? list.data.items.edges.map((edge) => edge.node) : null;
  const order =
    items === null ? null : bandMoveOrder(items, placement.entryId, suggested);

  const settled = band === suggested;

  const move = async () => {
    if (order === null) return;
    setMoving(true);
    setError(null);
    const moved = unwrapResult(
      (
        await reorder({
          tierListId: placement.tierListId,
          band: suggested,
          orderedIds: order,
        })
      ).data?.reorderTierListBand,
      "ReorderBandPayload",
    );
    if (!moved.ok) {
      setMoving(false);
      setError(moved.error.message);
      return;
    }
    const was = band;
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
      ? movedEditSeq(history.data.editHistory?.undo, was, suggested)
      : null;
    setMoving(false);
    setBand(suggested);
    notify(
      `Moved ${itemName} to ${BAND_LABELS[suggested] ?? "Unrated"} on ${placement.name}`,
      {
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
                  if (undone.ok) setBand(was);
                  else
                    notify("Couldn't undo that move", {
                      tone: "error",
                      description: historyStepFailure("undo", undone.error),
                    });
                })();
              },
      },
    );
  };

  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="t-cap truncate font-semibold text-ink-1">
          {placement.name}
        </span>
        <span className="t-cap text-ink-3">
          {BAND_LABELS[band] ?? "Unrated"}
          {tooLong && !settled && (
            <span className="block">
              A long list —{" "}
              <Link
                href={`/tier-lists/${placement.tierListId}`}
                underline="always"
              >
                move it there
              </Link>
            </span>
          )}
          {error !== null && (
            <span role="alert" className="block text-destructive">
              {error}
            </span>
          )}
        </span>
      </div>
      {settled ? (
        <span className="t-cap text-ink-3 inline-flex items-center gap-1 text-success">
          <Check aria-hidden className="size-4" />
          {BAND_LABELS[band] ?? "Unrated"}
        </span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={order === null || moving}
          aria-busy={moving || undefined}
          className={cn(
            "relative shrink-0 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
          )}
          onClick={() => void move()}
        >
          {moving && <Spinner aria-hidden />}
          Move to {BAND_LABELS[suggested] ?? "Unrated"}
        </Button>
      )}
    </li>
  );
}
