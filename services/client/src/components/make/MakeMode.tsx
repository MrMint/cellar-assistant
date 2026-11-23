"use client";

import { Minus, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation } from "urql";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { useNavigate } from "@/components/app/useNavigate";
import {
  DeleteDrinkLogMutation,
  LogDrinkMutation,
} from "@/components/drink-log/queries";
import { AddRecipeReview } from "@/components/recipe/AddRecipeReview";
import type { RecipeDetailsItem } from "@/components/recipe/adapter";
import { Checkbox } from "@/components/ui/checkbox";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import {
  baseServings,
  clampServings,
  ingredientName,
  MAX_SERVINGS,
  MIN_SERVINGS,
  scaledAmount,
  scaleFactor,
} from "./scaling";
import { type MakeStep, stepsFrom } from "./steps";
import { formatClock } from "./timer";
import { useCountdown } from "./useCountdown";
import { useWakeLock } from "./useWakeLock";

export type MakeModeProps = {
  recipe: RecipeDetailsItem;
  viewerId: string | null;
};

const pill =
  "inline-flex h-14 items-center justify-center rounded-full px-6 font-semibold text-base outline-none transition-transform duration-(--ca-dur-micro) focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 disabled:opacity-50 motion-reduce:active:scale-100";

/**
 * ux-c L08: a recipe, full screen, one step at a time — `/recipes/[id]/make`.
 *
 * The screen stays on where the browser can promise it (`useWakeLock`,
 * feature-detected). Servings scale every amount (`scaling.ts`); a step that
 * names a time gets a countdown (`steps.ts`, `timer.ts`). The last step's
 * Next is "Made it": a recipe-only drink log (L23, L44 — CheckInActor's one
 * target), with Undo in its toast. The optional rating afterwards is the
 * recipe's own review form (L29), never PourSheet.
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
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logState, logDrink] = useMutation(LogDrinkMutation);
  const [, deleteLog] = useMutation(DeleteDrinkLogMutation);
  const keepsAwake = useWakeLock(loggedId === null);

  const total = steps.length;
  const step: MakeStep | undefined = steps[index];
  const last = index >= total - 1;
  const mine =
    viewerId === null
      ? null
      : (recipe.recipe_reviews?.find((r) => r.userId === viewerId) ?? null);

  const leave = () => navigate.push(`/recipes/${recipe.id}`, { kind: "back" });

  const madeIt = async () => {
    setError(null);
    const id = crypto.randomUUID();
    const result = unwrapResult(
      (await logDrink({ id, input: { recipeId: recipe.id } })).data?.logDrink,
      "LoggedDrinkPayload",
    );
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    const entryId = result.data.entry.id;
    setLoggedId(entryId);
    notify(`Made ${recipe.name}`, {
      tone: "success",
      description: "Logged to your drinks.",
      undo: () => {
        void (async () => {
          const undone = unwrapResult(
            (await deleteLog({ id: entryId })).data?.deleteDrinkLog,
            "DeletedDrinkLogPayload",
          );
          if (!undone.ok) {
            notify("Couldn't undo that log", {
              tone: "error",
              description: undone.error.message,
            });
            return;
          }
          setLoggedId(null);
          notify("Log removed");
        })();
      },
    });
  };

  if (loggedId !== null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 bg-background px-4 py-8">
        <p className="type-overline text-brass">Made it</p>
        <h1 className="font-display text-[32px] text-ink-1 leading-10">
          {recipe.name}
        </h1>
        <p className="type-body text-ink-2">
          It&rsquo;s in your drinks. Rate it if you like — or don&rsquo;t.
        </p>
        <AddRecipeReview
          key={mine?.id ?? "new"}
          recipeId={recipe.id}
          viewerId={viewerId}
          myReview={
            mine === null
              ? null
              : { id: mine.id, score: mine.score, text: mine.text }
          }
        />
        <Link
          href={`/recipes/${recipe.id}`}
          underline="none"
          className={cn(pill, "bg-surface-2 text-ink-1")}
        >
          Back to the recipe
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-background">
      <header className="flex items-center gap-3 px-4 pt-4">
        <button
          type="button"
          onClick={leave}
          aria-label="Leave Make mode"
          className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-1"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="type-headline truncate text-ink-1">{recipe.name}</h1>
          {keepsAwake && (
            <p className="type-footnote text-ink-3">
              Screen stays on while you make it
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Fewer servings"
            disabled={servings <= MIN_SERVINGS}
            onClick={() => setServings((n) => clampServings(n - 1))}
            className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-1 disabled:opacity-40"
          >
            <Minus className="size-4" />
          </button>
          <output aria-live="polite" className="type-callout w-8 text-center">
            {servings} ×
          </output>
          <button
            type="button"
            aria-label="More servings"
            disabled={servings >= MAX_SERVINGS}
            onClick={() => setServings((n) => clampServings(n + 1))}
            className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-1 disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </header>

      <section className="flex flex-1 flex-col gap-4 px-4 py-6">
        {total > 0 && (
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i <= index ? "bg-brass" : "bg-surface-3",
                )}
              />
            ))}
          </div>
        )}
        {step === undefined ? (
          <p className="type-body text-ink-2">
            This recipe has no steps yet — the ingredients below are all of it.
          </p>
        ) : (
          <>
            <p className="font-semibold text-[11px] text-brass uppercase tracking-wider">
              Step {index + 1} of {total}
            </p>
            <p
              aria-live="polite"
              className="font-display text-[32px] text-ink-1 leading-10"
            >
              {step.text}
            </p>
            {step.timerSeconds !== null && (
              <StepTimer key={step.id} seconds={step.timerSeconds} />
            )}
          </>
        )}
      </section>

      <section
        aria-label="Ingredients"
        className="rounded-t-[20px] bg-surface-1 px-4 py-5"
      >
        <h2 className="type-overline mb-3 text-ink-3">Ingredients</h2>
        <ul className="flex flex-col gap-3">
          {recipe.ingredients.map((ingredient) => {
            const id = `make-ing-${ingredient.id}`;
            const done = checked.has(ingredient.id);
            return (
              <li key={ingredient.id} className="flex items-center gap-3">
                <Checkbox
                  id={id}
                  checked={done}
                  onCheckedChange={(next) =>
                    setChecked((current) => {
                      const copy = new Set(current);
                      if (next === true) copy.add(ingredient.id);
                      else copy.delete(ingredient.id);
                      return copy;
                    })
                  }
                  className="size-5"
                />
                <label
                  htmlFor={id}
                  className={cn(
                    "type-body flex-1 text-ink-1",
                    done && "text-ink-3 line-through",
                  )}
                >
                  {ingredientName(ingredient)}
                </label>
                <span className="type-callout text-ink-2 tabular-nums">
                  {scaledAmount(ingredient, factor)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <footer className="sticky bottom-0 grid grid-cols-2 gap-3 bg-surface-1 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error !== null && (
          <p role="alert" className="type-footnote col-span-2 text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className={cn(pill, "bg-surface-3 text-ink-1")}
        >
          Back
        </button>
        <button
          type="button"
          disabled={logState.fetching}
          onClick={() =>
            last ? void madeIt() : setIndex((i) => Math.min(total - 1, i + 1))
          }
          className={cn(pill, "bg-brass text-on-brass")}
        >
          {last ? "Made it" : "Next"}
        </button>
      </footer>
    </main>
  );
};

/** A step's own countdown: one button, start / pause / resume. */
const StepTimer = ({ seconds }: { seconds: number }) => {
  const timer = useCountdown(seconds * 1000);
  const clock = formatClock(timer.remainingMs);
  const label =
    timer.status === "idle"
      ? `Start ${clock}`
      : timer.status === "running"
        ? `${clock} left · Pause`
        : timer.status === "paused"
          ? `${clock} left · Resume`
          : "Done · Start again";
  return (
    <button
      type="button"
      onClick={timer.toggle}
      aria-live="polite"
      className={cn(
        pill,
        "self-start bg-surface-2 text-ink-1 tabular-nums ring-2 ring-brass ring-inset",
      )}
    >
      {label}
    </button>
  );
};
