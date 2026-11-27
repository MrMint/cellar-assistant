"use client";

import { Clock, Sun, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useMutation } from "urql";
import { BottomSheet } from "@/components/app/BottomSheet";
import { notify } from "@/components/app/notify";
import { useNavigate } from "@/components/app/useNavigate";
import {
  DeleteDrinkLogMutation,
  LogDrinkMutation,
} from "@/components/drink-log/queries";
import type { RecipeDetailsItem } from "@/components/recipe/adapter";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { leaveTo } from "./leave";
import { MadeIt } from "./MadeIt";
import { MakeChecklist, ServingsStepper } from "./MakeChecklist";
import { baseServings, clampServings, scaleFactor } from "./scaling";
import { stepsFrom } from "./steps";
import { formatClock } from "./timer";
import { type StepTimerView, useStepTimers } from "./useStepTimers";
import { useWakeLock } from "./useWakeLock";

export type MakeModeProps = {
  recipe: RecipeDetailsItem;
  viewerId: string | null;
};

/** How far a finger travels before a swipe changes the step. */
const SWIPE_PX = 56;

/**
 * The one write Made it makes: a recipe-only drink log (L23, L44). It names
 * the recipe and nothing else — no bottle, no cellar item, no person — so it
 * cannot change a bottle's level (#677) or land in anyone else's log (the
 * API takes the drinker from the session).
 */
export const madeItInput = (recipeId: string) => ({ recipeId });

/**
 * Make mode (Recipes-Make board; ux-c L08) at `/recipes/[id]/make`: the
 * ingredients and servings first (the prep page, lead's ruling 2), then one
 * step at a time, then Made it.
 *
 * The screen stays on where the browser can promise it (`useWakeLock`). A
 * step that names a time gets a countdown that keeps running when you move
 * on, shown in the segment bar (ruling 4). Back / Next, or a swipe, move
 * between steps; the last step's Next is "Made it": the log, with Undo in
 * its toast, then the Made it screen.
 */
export const MakeMode = ({ recipe, viewerId }: MakeModeProps) => {
  const navigate = useNavigate();
  const steps = useMemo(
    () => stepsFrom(recipe.instructions),
    [recipe.instructions],
  );
  const base = baseServings(recipe.serving_size);
  const [servings, setServings] = useState(base);
  const factor = scaleFactor(servings, base);
  // 0 is the prep page; 1..n are the steps.
  const [stage, setStage] = useState(0);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const [logState, logDrink] = useMutation(LogDrinkMutation);
  const [, deleteLog] = useMutation(DeleteDrinkLogMutation);
  const keepsAwake = useWakeLock(loggedId === null);
  const timers = useStepTimers(steps);
  const swipeFrom = useRef<number | null>(null);

  const total = steps.length;
  const stepIndex = stage - 1;
  const step = stage > 0 ? steps[stepIndex] : undefined;
  const last = stage >= total;

  const leave = () => leaveTo(navigate, `/recipes/${recipe.id}`);
  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(total, next));
    if (clamped === stage) return;
    feedback("tick");
    setStage(clamped);
  };

  const toggle = (id: string, on: boolean) =>
    setChecked((current) => {
      const copy = new Set(current);
      if (on) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  const undoLog = async (entryId: string) => {
    const undone = unwrapResult(
      (await deleteLog({ id: entryId })).data?.deleteDrinkLog,
      "DeletedDrinkLogPayload",
    );
    if (!undone.ok) {
      notify("Couldn't undo that", { tone: "error" });
      return;
    }
    setLoggedId(null);
  };

  const madeIt = async () => {
    const result = unwrapResult(
      (
        await logDrink({
          id: crypto.randomUUID(),
          input: madeItInput(recipe.id),
        })
      ).data?.logDrink,
      "LoggedDrinkPayload",
    );
    if (!result.ok) {
      feedback("refuse");
      notify(`Couldn't log ${recipe.name}`, {
        tone: "error",
        actionLabel: "Try again",
        undo: () => void madeIt(),
      });
      return;
    }
    const entryId = result.data.entry.id;
    feedback("success");
    setLoggedId(entryId);
    notify(`${recipe.name} logged`, {
      undo: () => void undoLog(entryId),
    });
  };

  if (loggedId !== null) {
    return (
      <MadeIt
        recipe={recipe}
        viewerId={viewerId}
        onRecipe={() => navigate.replace(`/recipes/${recipe.id}`)}
        onDone={leave}
      />
    );
  }

  const running = timers.elsewhere(stepIndex);
  const checklist = (idPrefix: string) => (
    <MakeChecklist
      ingredients={recipe.ingredients}
      factor={factor}
      checked={checked}
      onToggle={toggle}
      idPrefix={idPrefix}
    />
  );
  const ingredientsHead = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="t-title m-0 text-ink">Ingredients</h2>
      <ServingsStepper
        servings={servings}
        onChange={(next) => setServings(clampServings(next))}
      />
    </div>
  );

  return (
    <div
      data-slot="make-mode"
      className="mx-auto flex min-h-full w-full max-w-xl flex-col bg-background"
    >
      <header className="flex items-center gap-2 px-2 pt-3">
        <button
          type="button"
          onClick={() => {
            feedback("press");
            leave();
          }}
          aria-label="Leave Make mode"
          className="grid size-11 shrink-0 place-items-center rounded-md text-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97"
        >
          <X aria-hidden className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="t-head m-0 truncate text-ink">{recipe.name}</h1>
          {keepsAwake && (
            <p className="t-cap m-0 flex items-center gap-1 text-ink-2">
              <Sun aria-hidden className="size-3.5 text-glyph" />
              Screen stays on
            </p>
          )}
        </div>
        {stage > 0 && recipe.ingredients.length > 0 && (
          <Button variant="quiet" onClick={() => setSheetOpen(true)}>
            Ingredients
          </Button>
        )}
      </header>

      <div className="flex items-center gap-2 px-4 pt-4">
        <ol
          aria-label={stage === 0 ? "Ingredients" : `Step ${stage} of ${total}`}
          className="m-0 flex flex-1 list-none gap-1 p-0"
        >
          {Array.from({ length: total + 1 }, (_, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are positions
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= stage ? "bg-ink-2" : "bg-raised",
              )}
            />
          ))}
        </ol>
        {running !== null && (
          <TimerChip timer={running} onOpen={() => go(running.stepIndex + 1)} />
        )}
      </div>

      {stage === 0 ? (
        <section
          aria-label="Ingredients"
          className="flex flex-1 flex-col gap-4 px-4 py-6"
        >
          {ingredientsHead}
          {checklist("make-ing")}
          {total === 0 && (
            <p
              data-testid="no-steps"
              className="t-body m-0 flex min-h-14 items-center gap-3 rounded-md border border-edge-2 border-dashed px-4 text-ink-2"
            >
              No steps yet
            </p>
          )}
        </section>
      ) : (
        <section
          aria-label={`Step ${stage} of ${total}`}
          className="flex flex-1 touch-pan-y flex-col gap-4 px-4 py-6"
          onPointerDown={(event) => {
            swipeFrom.current = event.clientX;
          }}
          onPointerUp={(event) => {
            const from = swipeFrom.current;
            swipeFrom.current = null;
            if (from === null) return;
            const dx = event.clientX - from;
            if (dx <= -SWIPE_PX && !last) go(stage + 1);
            else if (dx >= SWIPE_PX) go(stage - 1);
          }}
        >
          <p className="t-cap m-0 text-ink-2">
            Step {stage} of {total}
          </p>
          <p aria-live="polite" className="t-title m-0 text-ink">
            {step?.text}
          </p>
          {step?.timerSeconds != null && (
            <StepTimer
              timer={timers.view(stepIndex)}
              onToggle={() => timers.toggle(stepIndex)}
            />
          )}
        </section>
      )}

      <footer
        className={cn(
          "sticky bottom-0 grid gap-3 border-rule border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]",
          stage > 0 && "grid-cols-2",
        )}
      >
        {stage > 0 && (
          <Button variant="outline" onClick={() => go(stage - 1)}>
            Back
          </Button>
        )}
        <Button
          disabled={logState.fetching}
          onClick={() => (last ? void madeIt() : go(stage + 1))}
        >
          {last ? "Made it" : stage === 0 ? "Start" : "Next"}
        </Button>
      </footer>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Ingredients"
        hideTitle
      >
        <div className="flex flex-col gap-4 pb-2">
          {ingredientsHead}
          {checklist("make-sheet-ing")}
        </div>
      </BottomSheet>
    </div>
  );
};

/** A step's countdown card: the clock, Start / Pause / Resume, its bar. */
const StepTimer = ({
  timer,
  onToggle,
}: {
  timer: StepTimerView | null;
  onToggle: () => void;
}) => {
  if (timer === null) return null;
  const clock = formatClock(timer.remainingMs);
  const label =
    timer.status === "idle"
      ? "Start"
      : timer.status === "running"
        ? "Pause"
        : timer.status === "paused"
          ? "Resume"
          : "Again";
  const left =
    timer.durationMs === 0 ? 0 : timer.remainingMs / timer.durationMs;
  return (
    <div
      data-slot="step-timer"
      className="flex flex-col gap-3 rounded-md border border-edge bg-card p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          role="timer"
          aria-live={timer.status === "running" ? "off" : "polite"}
          className="font-semibold text-5xl text-ink tabular-nums leading-none"
        >
          {timer.status === "done" ? "Done" : clock}
        </span>
        <Button variant="outline" className="min-w-28" onClick={onToggle}>
          {label}
        </Button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-ink-2 transition-[width] duration-(--ca-dur-short) ease-linear motion-reduce:transition-none"
          style={{ width: `${Math.round(left * 100)}%` }}
        />
      </div>
    </div>
  );
};

/** A timer running on another step, in the segment bar: tap to go to it. */
const TimerChip = ({
  timer,
  onOpen,
}: {
  timer: StepTimerView;
  onOpen: () => void;
}) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={`${formatClock(timer.remainingMs)} left on step ${timer.stepIndex + 1}`}
    className="group grid h-11 shrink-0 place-items-center outline-none"
  >
    <span className="t-cap flex h-7 items-center gap-1.5 rounded-full border border-edge-2 bg-card px-3 text-ink tabular-nums group-focus-visible:outline-2 group-focus-visible:outline-act-ink group-active:scale-97">
      <Clock aria-hidden className="size-4 text-glyph" />
      {formatClock(timer.remainingMs)}
    </span>
  </button>
);
