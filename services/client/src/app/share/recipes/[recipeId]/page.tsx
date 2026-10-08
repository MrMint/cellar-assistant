import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadSharedRecipe, nodesOf } from "@/components/share/loaders";
import {
  NOT_SHARED_METADATA,
  recipeDescription,
  shareMetadata,
} from "@/components/share/metadata";
import { SharedRecipeView } from "@/components/share/SharedRecipeView";
import { ShareFrame } from "@/components/share/ShareFrame";
import { isNotFound } from "@/lib/api/result";
import { canonicalPath } from "@/lib/share/routes";
import { getOptionalServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ recipeId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { recipeId } = await params;
  const result = await loadSharedRecipe(recipeId);
  if (!result.ok) return NOT_SHARED_METADATA;
  const recipe = result.data;
  return shareMetadata({
    title: recipe.name,
    description: recipeDescription({
      description: recipe.description,
      ingredients: nodesOf(recipe.ingredients),
    }),
    canonicalPath: canonicalPath({ kind: "recipe", id: recipe.id }),
  });
}

/**
 * `/recipes/<id>` for a signed-out viewer (`src/proxy.ts` rewrites it here).
 * Which recipes may be shared is the API's to say (`canShareRecipeAnonymously`
 * — every recipe until D22 gives recipes a privacy column).
 */
export default async function SharedRecipePage({ params }: Props) {
  const { recipeId } = await params;
  const canonical = canonicalPath({ kind: "recipe", id: recipeId });
  if ((await getOptionalServerUser()) !== null) redirect(canonical);

  const result = await loadSharedRecipe(recipeId);
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    throw new Error(result.error.message);
  }
  const recipe = result.data;
  return (
    <ShareFrame
      canonicalPath={canonical}
      pitch="Save recipes and see what you can make from your own bar."
      cta="Join Cellar Assistant"
    >
      <SharedRecipeView
        name={recipe.name}
        description={recipe.description}
        type={recipe.type}
        difficultyLevel={recipe.difficultyLevel}
        prepTimeMinutes={recipe.prepTimeMinutes}
        servingSize={recipe.servingSize}
        imageUrl={recipe.imageUrl}
        ingredients={nodesOf(recipe.ingredients)}
        instructions={nodesOf(recipe.instructions)}
      />
    </ShareFrame>
  );
}
