"use client";

import { useQuery } from "urql";
import { Link } from "@/components/app/Link";
import { InsetSection } from "@/components/app/Page";
import { unwrapResult } from "@/lib/api/result";
import { BarRecipeRow } from "./BarRecipeRow";
import { ItemCocktailsQuery } from "./queries";

export type ItemCocktailsProps = {
  itemId: string;
  type: "WINE" | "BEER" | "SPIRIT" | "COFFEE" | "SAKE" | "TEA";
};

/**
 * X14: **"Cocktails with this"** on an item or bottle page — every cocktail
 * that uses this bottle or any of its kind (a bourbon lists recipes asking
 * for bourbon and for whiskey), the makeable ones first. When the viewer has
 * an open bottle of it, the section is **"Use it up"** instead: the same
 * list, read as an invitation.
 *
 * Self-fetching on purpose. The judging scans the recipe catalog against the
 * viewer's bar (`BarActor.cocktailsFor`), which the item page's own server
 * render should not wait on; and it keeps this section a one-line insertion
 * on both the item and the bottle page. Renders nothing for an item no
 * cocktail uses — an empty "Cocktails with this" on a Pinot Noir is noise —
 * and nothing while loading: a skeleton that then vanished on every wine and
 * coffee page would be a layout jump for a section most of them never have.
 */
export function ItemCocktails({ itemId, type }: ItemCocktailsProps) {
  const [{ data }] = useQuery({
    query: ItemCocktailsQuery,
    variables: { itemId, type },
  });

  const result = unwrapResult(data?.item, "QueryItemSuccess");
  const cocktails = result.ok ? result.data.data.cocktails : null;
  if (
    cocktails === null ||
    cocktails === undefined ||
    cocktails.recipes.edges.length === 0
  ) {
    return null;
  }

  const shown = cocktails.recipes.edges.length;
  const more = cocktails.total - shown;
  return (
    <InsetSection
      data-testid="item-cocktails"
      label={cocktails.useItUp ? "Use it up" : "Cocktails with this"}
      action={
        <Link
          href="/recipes/bar"
          underline="none"
          className="relative t-cap font-medium text-ink-2 after:absolute after:-inset-3 after:content-['']"
        >
          What can I make
        </Link>
      }
    >
      {cocktails.recipes.edges.map(({ node }) => (
        <BarRecipeRow
          key={node.recipeId}
          recipeId={node.recipeId}
          name={node.name}
          makeability={node.makeability}
        />
      ))}
      {more > 0 && (
        <p className="t-cap px-4 py-2.5 text-ink-3">
          {`${more} more ${more === 1 ? "cocktail" : "cocktails"}`}
        </p>
      )}
    </InsetSection>
  );
}
