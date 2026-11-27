"use client";

import { Minus, Plus } from "lucide-react";
import { availabilityText } from "@/components/bar/copy";
import type { RecipeDetailsItem } from "@/components/recipe/adapter";
import { Checkbox } from "@/components/ui/checkbox";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import {
  ingredientName,
  MAX_SERVINGS,
  MIN_SERVINGS,
  scaledAmount,
} from "./scaling";

type Ingredient = RecipeDetailsItem["ingredients"][number];

/**
 * The caption under an ingredient (Recipes-Make board): the bottle it pours,
 * "In your pantry", or "Swap: …" — never a guess ("Not tracked").
 */
export const ingredientCaption = (ingredient: Ingredient): string | null => {
  const availability = ingredient.availability ?? null;
  if (availability === null) return null;
  if (
    availability.status === "HAVE" &&
    availability.source === "BOTTLE" &&
    availability.label
  ) {
    return availability.label;
  }
  return availabilityText(availability);
};

/** "1 drink", "3 drinks". */
export const servingsText = (servings: number): string =>
  `${servings} ${servings === 1 ? "drink" : "drinks"}`;

/**
 * The servings stepper (board: an edged 44 box, "− 1 drink +"). Each step
 * ticks; the ends are the same buttons at 40 %.
 */
export function ServingsStepper({
  servings,
  onChange,
}: {
  servings: number;
  onChange: (next: number) => void;
}) {
  const step = (by: number) => {
    feedback("tick");
    onChange(servings + by);
  };
  const button =
    "grid size-11 shrink-0 place-items-center rounded-md text-ink outline-none transition-transform duration-(--ca-dur-micro) focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 disabled:opacity-40 motion-reduce:active:scale-100";
  return (
    <div
      data-slot="servings-stepper"
      className="flex h-11 items-center rounded-md border border-edge-2"
    >
      <button
        type="button"
        aria-label="Fewer drinks"
        disabled={servings <= MIN_SERVINGS}
        onClick={() => step(-1)}
        className={button}
      >
        <Minus aria-hidden className="size-5" />
      </button>
      <output
        aria-live="polite"
        className="t-head min-w-20 px-1 text-center text-ink tabular-nums"
      >
        {servingsText(servings)}
      </output>
      <button
        type="button"
        aria-label="More drinks"
        disabled={servings >= MAX_SERVINGS}
        onClick={() => step(1)}
        className={button}
      >
        <Plus aria-hidden className="size-5" />
      </button>
    </div>
  );
}

/**
 * The check-off list (board: one card, rows split by rules): a box, the
 * scaled amount, the ingredient and its caption. The whole row is the
 * box's label, so the row is the 44 target.
 */
export function MakeChecklist({
  ingredients,
  factor,
  checked,
  onToggle,
  idPrefix,
}: {
  ingredients: readonly Ingredient[];
  factor: number;
  checked: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  idPrefix: string;
}) {
  if (ingredients.length === 0) return null;
  return (
    <ul
      aria-label="Ingredients"
      className="m-0 flex list-none flex-col divide-y divide-rule overflow-hidden rounded-md border border-edge bg-card p-0"
    >
      {ingredients.map((ingredient) => {
        const id = `${idPrefix}-${ingredient.id}`;
        const done = checked.has(ingredient.id);
        const caption = ingredientCaption(ingredient);
        return (
          <li key={ingredient.id}>
            <label
              htmlFor={id}
              className="flex min-h-14 cursor-pointer items-center gap-3 px-3.5 py-2.5"
            >
              <Checkbox
                id={id}
                checked={done}
                onCheckedChange={(next) => {
                  feedback("toggle");
                  onToggle(ingredient.id, next === true);
                }}
                className="size-7 shrink-0"
              />
              <span
                className={cn(
                  "t-body w-20 shrink-0 text-ink-2 tabular-nums",
                  done && "text-ink-3",
                )}
              >
                {scaledAmount(ingredient, factor)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("t-body text-ink", done && "text-ink-3")}>
                  {ingredientName(ingredient)}
                </span>
                {caption !== null && (
                  <span className="t-cap text-ink-2">{caption}</span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
