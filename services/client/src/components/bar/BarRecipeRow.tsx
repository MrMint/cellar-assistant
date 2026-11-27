import { ChevronRight } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { Button } from "@/components/ui/button";
import { type MakeabilityLike, matchDescription } from "./copy";

/**
 * One cocktail judged against the viewer's bar (Recipes-Make board): a row
 * of Your bar and of an item's "Cocktails with this" / "Use it up".
 *
 * The recipe face (a 44 label plate, tumbler glyph), the name, and one or two
 * lines of what it takes. The whole row links to the recipe; a drink you can
 * make tonight, swaps included, carries an outlined Make straight into Make
 * mode (the screen's teal primary is never a row's), and anything else a
 * chevron. The words always say the verdict, so nothing rests on a glyph.
 */
export function BarRecipeRow({
  recipeId,
  name,
  makeability,
  detail,
}: {
  recipeId: string;
  name: string;
  makeability: MakeabilityLike;
  /** The line under the name; defaults to `matchDescription`. */
  detail?: string;
}) {
  const makeable = makeability.status === "MAKE_NOW";
  return (
    <div
      data-slot="bar-recipe-row"
      data-recipe-match={makeability.status.toLowerCase()}
      data-swap={makeability.substituteCount > 0 ? "" : undefined}
      className="relative flex min-h-16 items-center gap-3 py-2.5 pr-3 pl-3.5 has-[a[data-slot=link]:active]:bg-raised"
    >
      <div className="size-11 shrink-0 overflow-hidden rounded-sm">
        <LabelPlate type="SPIRIT" face="recipe" plate={{ name }} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/recipes/${recipeId}`}
          overlay
          underline="none"
          className="t-head truncate text-ink"
        >
          {name}
        </Link>
        <p className="t-cap m-0 line-clamp-2 text-ink-2">
          {detail ?? matchDescription(makeability)}
        </p>
      </div>
      {makeable ? (
        <Button asChild variant="outline" className="relative z-10">
          <Link
            href={`/recipes/${recipeId}/make`}
            underline="none"
            aria-label={`Make ${name}`}
          >
            Make
          </Link>
        </Button>
      ) : (
        <ChevronRight aria-hidden className="size-5 shrink-0 text-glyph" />
      )}
    </div>
  );
}
