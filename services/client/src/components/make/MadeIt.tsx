"use client";

import { LabelPlate } from "@/components/app/LabelPlate";
import type { RecipeDetailsItem } from "@/components/recipe/adapter";
import { Button } from "@/components/ui/button";
import { RateIt } from "./RateIt";
import { ingredientName } from "./scaling";

type Ingredient = RecipeDetailsItem["ingredients"][number];

export type UsedBottle = {
  readonly id: string;
  readonly line: string;
  readonly label: string;
};

/**
 * The bottles a made drink poured from: each ingredient a bottle answered,
 * by the bottle's name, with the swap said where there was one. Only names:
 * Made it changes no bottle (#677), so there are no levels to show.
 */
export const usedBottles = (ingredients: readonly Ingredient[]): UsedBottle[] =>
  ingredients.flatMap((ingredient) => {
    const availability = ingredient.availability ?? null;
    if (
      availability === null ||
      availability.source !== "BOTTLE" ||
      !availability.label ||
      (availability.status !== "HAVE" && availability.status !== "SUBSTITUTE")
    ) {
      return [];
    }
    return [
      {
        id: ingredient.id,
        label: availability.label,
        line:
          availability.status === "SUBSTITUTE"
            ? `Swap for ${ingredientName(ingredient).toLowerCase()}`
            : ingredientName(ingredient),
      },
    ];
  });

/**
 * The Made it screen (Recipes-Make board): the recipe's plate, "Made it",
 * "Rate it" in place (stars that save on the tap, and Add a note: `RateIt`;
 * L29, never PourSheet), the bottles it came from, and Recipe / Done. The log
 * itself and its Undo are Make mode's; this screen only shows what happened.
 *
 * Not built: the board's "Your 3rd <drink>" and "Your log" link. The API has
 * no count of the viewer's logs of a recipe and the app has no log page
 * (hand-off, F-120).
 */
export function MadeIt({
  recipe,
  viewerId,
  onRecipe,
  onDone,
}: {
  recipe: RecipeDetailsItem;
  viewerId: string | null;
  onRecipe: () => void;
  onDone: () => void;
}) {
  const mine =
    viewerId === null
      ? null
      : (recipe.recipe_reviews?.find((r) => r.userId === viewerId) ?? null);
  const bottles = usedBottles(recipe.ingredients);
  return (
    <div
      data-slot="made-it"
      className="mx-auto flex min-h-full w-full max-w-xl flex-col bg-background"
    >
      <div className="flex justify-center bg-gradient-to-b from-raised to-background px-4 pt-8 pb-6">
        <div className="size-40 overflow-hidden rounded-md">
          <LabelPlate
            type="SPIRIT"
            face="recipe"
            plate={{ name: recipe.name }}
            labelled
            className="bg-transparent"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-5 px-4 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="t-title m-0 text-ink">Made it</h1>
          <p className="t-body m-0 text-ink-2">
            {recipe.name} is in your drinks
          </p>
        </div>
        <RateIt
          key={mine?.id ?? "new"}
          recipeId={recipe.id}
          myReview={
            mine === null
              ? null
              : { id: mine.id, score: mine.score, text: mine.text }
          }
        />
        {bottles.length > 0 && (
          <section aria-labelledby="made-from" className="flex flex-col gap-2">
            <h2 id="made-from" className="t-head m-0 px-1 text-ink">
              From your bar
            </h2>
            <ul className="m-0 flex list-none flex-col divide-y divide-rule overflow-hidden rounded-md border border-edge bg-card p-0">
              {bottles.map((bottle) => (
                <li
                  key={bottle.id}
                  className="flex min-h-14 flex-col justify-center px-3.5 py-2.5"
                >
                  <span className="t-head text-ink">{bottle.label}</span>
                  <span className="t-cap text-ink-2">{bottle.line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="sticky bottom-0 grid grid-cols-2 gap-3 border-rule border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="outline" onClick={onRecipe}>
          Recipe
        </Button>
        <Button onClick={onDone}>Done</Button>
      </footer>
    </div>
  );
}
