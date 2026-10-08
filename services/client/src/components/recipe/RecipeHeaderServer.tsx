import { HeaderBar } from "@/components/common/HeaderBar";

interface RecipeHeaderServerProps {
  recipeId: string;
  recipeName: string;
  recipeType: "food" | "cocktail";
}

export function RecipeHeaderServer({
  recipeName,
  recipeType,
}: RecipeHeaderServerProps) {
  return (
    <HeaderBar
      serverBreadcrumbs={{
        recipeName,
      }}
      endComponent={
        <p className="type-callout text-ink-2 capitalize">{recipeType}</p>
      }
    />
  );
}
