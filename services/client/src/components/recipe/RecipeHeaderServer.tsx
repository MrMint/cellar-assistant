import type { AppBarOverflowItem } from "@/components/app/AppBar";
import { HeaderBar } from "@/components/common/HeaderBar";

interface RecipeHeaderServerProps {
  recipeId: string;
  recipeName: string;
  recipeType: "food" | "cocktail";
  /** The bar's `⋯`: Share (X17). */
  overflow?: readonly AppBarOverflowItem[];
}

export function RecipeHeaderServer({
  recipeName,
  recipeType,
  overflow,
}: RecipeHeaderServerProps) {
  return (
    <HeaderBar
      overflow={overflow}
      serverBreadcrumbs={{
        recipeName,
      }}
      endComponent={
        <p className="type-callout text-ink-2 capitalize">{recipeType}</p>
      }
    />
  );
}
