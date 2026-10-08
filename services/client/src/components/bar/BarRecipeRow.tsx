import { Cocktail, Missing, Success, Swap } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ListRow } from "@/components/app/Page";
import { cn } from "@/lib/utils";
import { type MakeabilityLike, matchDescription } from "./copy";

/**
 * One cocktail judged against the viewer's bar — a row of What can I make
 * and of an item's "Cocktails with this". The whole row links to the recipe;
 * the description says what it takes ("Needs Campari", "Make it with 1
 * swap"). The leading glyph carries the verdict, and its word is always in
 * the description beside it, so colour is never the only signal.
 */
export function BarRecipeRow({
  recipeId,
  name,
  makeability,
}: {
  recipeId: string;
  name: string;
  makeability: MakeabilityLike;
}) {
  const Verdict =
    makeability.status === "MAKE_NOW"
      ? makeability.substituteCount === 0
        ? Success
        : Swap
      : makeability.status === "ONE_AWAY"
        ? Missing
        : Cocktail;
  return (
    <ListRow
      data-recipe-match={makeability.status.toLowerCase()}
      leading={
        <Verdict
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "size-5",
            makeability.status === "MAKE_NOW" ? "text-success" : "text-ink-3",
          )}
        />
      }
      title={
        <Link
          href={`/recipes/${recipeId}`}
          overlay
          underline="none"
          className="text-ink-1"
        >
          {name}
        </Link>
      }
      description={matchDescription(makeability)}
    />
  );
}
