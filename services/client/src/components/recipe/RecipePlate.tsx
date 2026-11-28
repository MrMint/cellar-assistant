import { Restaurant } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { TumblerGlyph } from "@/components/app/parts/glyphs";
import { cn } from "@/lib/utils";
import type { GlassIngredient } from "./glass-colors";

/**
 * What a recipe looks like with no photo: the kit's recipe face (KIT
 * amendments, "Recipe face"), a label plate holding the tumbler glyph and the
 * recipe's name on the raised well. Recipes-Browse, -Page and -Make all draw
 * it (lead's ruling 3, FIX-recipes-a). Decorative (`aria-hidden`) unless
 * `labelled`, when it is an image named by the recipe.
 *
 * `type` and `ingredients` are kept for callers: the plate no longer draws a
 * coupe coloured by what is in it, but `glass-colors.ts` still answers that.
 */
export function RecipePlate({
  name,
  type,
  labelled = false,
  className,
}: {
  name: string;
  type: "cocktail" | "food";
  ingredients?: readonly GlassIngredient[];
  labelled?: boolean;
  className?: string;
}) {
  return (
    <div
      data-slot="recipe-plate"
      data-recipe-type={type}
      {...(labelled
        ? { role: "img", "aria-label": name }
        : { "aria-hidden": true })}
      className={cn("relative size-full", className)}
    >
      <LabelPlate type="SPIRIT" face="recipe" plate={{ name }} />
    </div>
  );
}

/**
 * A recipe's thumbnail with no photo: the same plate, which under 75 px is
 * the tumbler glyph alone at half its size (KIT amendments, "Small plates").
 */
export function RecipeThumb({
  type,
  name = "",
  glyphOnly = false,
  className,
}: {
  type: string;
  ingredients?: readonly GlassIngredient[];
  /** The recipe's name, drawn on the plate when the thumb is 75 px or more. */
  name?: string;
  /**
   * Draw the kind glyph alone, whatever the size: a row or card thumb that
   * is wider than 75 px would otherwise draw a clipped label plate (the
   * boards draw a glass, or a fork and knife for food).
   */
  glyphOnly?: boolean;
  className?: string;
}) {
  if (glyphOnly) {
    const Glyph = type === "food" ? Restaurant : TumblerGlyph;
    return (
      <span
        aria-hidden
        data-slot="recipe-thumb"
        data-recipe-type={type === "food" ? "food" : "cocktail"}
        className={cn(
          "relative flex size-full items-center justify-center overflow-hidden bg-raised",
          className,
        )}
      >
        <Glyph aria-hidden strokeWidth={1.25} className="size-1/2 text-glyph" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      data-slot="recipe-thumb"
      data-recipe-type={type === "food" ? "food" : "cocktail"}
      className={cn("relative flex size-full overflow-hidden", className)}
    >
      <LabelPlate type="SPIRIT" face="recipe" plate={{ name }} />
    </span>
  );
}
