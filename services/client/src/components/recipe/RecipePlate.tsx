import { cn } from "@/lib/utils";
import { type GlassIngredient, glassColors, HUE_COLOR } from "./glass-colors";

/**
 * A covered dish for food, in `VesselSilhouette`'s 64 × 160 box and manner:
 * the cloche's knob, its dome, the plate's rim.
 */
const CLOCHE =
  "M28 52Q28 46 32 46Q36 46 36 52V56Q56 60 60 96H4Q8 60 28 56ZM2 100H62V108H2Z";

/**
 * A coupe — the one cocktail glass, since no glassware data exists (L36) —
 * on the Main board's 64 × 88 grid: the drink's body, its top band, then the
 * rim, stem and foot drawn over both. Never a wine bottle (review #44, X15).
 */
function Coupe({
  ingredients,
  className = "relative h-[55%] w-auto",
}: {
  ingredients?: readonly GlassIngredient[];
  className?: string;
}) {
  const { base, top } = glassColors(ingredients);
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 64 88"
      data-slot="recipe-glass"
      data-glass="coupe"
      data-base={base}
      data-top={top}
      className={className}
    >
      <path
        d="M6 10h52c0 18-12 30-26 30S6 28 6 10z"
        style={{ fill: HUE_COLOR[base] }}
      />
      <path
        d="M9 10h46c-1 5-3 9-6 12H15c-3-3-5-7-6-12z"
        style={{ fill: HUE_COLOR[top] }}
      />
      <path
        d="M4 8h56M32 40v34M18 80h28"
        className="fill-none stroke-ink-2"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * What a recipe looks like with no photo (X15, B03): a cocktail is a coupe
 * coloured by what is in it (`glass-colors.ts`), food a faint cloche, above
 * the recipe's name in Fraunces — the recipe's version of `LabelPlate`,
 * drawn from nothing the recipe does not have. Decorative (`aria-hidden`)
 * unless `labelled`, when it is an image named by the recipe.
 */
export function RecipePlate({
  name,
  type,
  ingredients,
  labelled = false,
  className,
}: {
  name: string;
  type: "cocktail" | "food";
  /** The lines the glass is coloured from; without them it is neutral. */
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
      className={cn(
        "relative flex size-full flex-col items-center justify-center gap-4 overflow-hidden bg-surface-2 p-4",
        className,
      )}
    >
      {type === "cocktail" ? (
        <Coupe ingredients={ingredients} />
      ) : (
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 0 64 160"
          className="absolute inset-y-[8%] left-1/2 h-[84%] -translate-x-1/2 fill-current text-ink-1/10"
        >
          <path d={CLOCHE} />
        </svg>
      )}
      <p
        className={cn(
          "relative line-clamp-2 text-center font-display text-ink-2 text-xl leading-tight",
          type === "food" && "mt-auto",
        )}
      >
        {name}
      </p>
    </div>
  );
}

/**
 * A recipe's thumbnail with no photo (B03, replacing the old wine and beer
 * PNGs in a 48 px row): the same coupe, or the cloche, without the name.
 */
export function RecipeThumb({
  type,
  ingredients,
  className,
}: {
  type: string;
  ingredients?: readonly GlassIngredient[];
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-slot="recipe-thumb"
      data-recipe-type={type === "food" ? "food" : "cocktail"}
      className={cn(
        "flex size-full items-center justify-center bg-surface-2",
        className,
      )}
    >
      {type === "food" ? (
        <svg
          aria-hidden
          focusable="false"
          viewBox="0 40 64 72"
          className="h-[60%] w-auto fill-current text-ink-3"
        >
          <path d={CLOCHE} />
        </svg>
      ) : (
        <Coupe ingredients={ingredients} className="h-[70%] w-auto" />
      )}
    </span>
  );
}
