import { cn } from "@/lib/utils";

/**
 * Two silhouettes, in `VesselSilhouette`'s 64 × 160 box and manner: a coupe
 * for a drink, a covered dish for food. Never a wine bottle — the hero of a
 * cocktail used to be one (review #44, X15).
 */
const SHAPES = {
  // A coupe: a wide shallow bowl, a long stem, a round foot.
  cocktail:
    "M4 40H60Q60 72 36 78V140H50Q54 140 54 144V148H10V144Q10 140 14 140H28V78Q4 72 4 40Z",
  // A cloche over a plate: the knob, the dome, the rim.
  food: "M28 52Q28 46 32 46Q36 46 36 52V56Q56 60 60 96H4Q8 60 28 56ZM2 100H62V108H2Z",
} as const;

/**
 * What a recipe looks like with no photo (X15): the drink's silhouette, faint,
 * behind its name in Fraunces — the recipe's version of `LabelPlate`, drawn
 * from nothing the recipe does not have. Decorative (`aria-hidden`) unless
 * `labelled`, when it is an image named by the recipe.
 */
export function RecipePlate({
  name,
  type,
  labelled = false,
  className,
}: {
  name: string;
  type: "cocktail" | "food";
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
        "relative flex size-full flex-col items-center justify-end overflow-hidden bg-surface-2 p-4",
        className,
      )}
    >
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 64 160"
        className="absolute inset-y-[8%] left-1/2 h-[84%] -translate-x-1/2 fill-current text-ink-1/10"
      >
        <path d={SHAPES[type]} />
      </svg>
      <p className="relative line-clamp-2 text-center font-display text-ink-2 text-xl leading-tight">
        {name}
      </p>
    </div>
  );
}
