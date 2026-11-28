import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppBar } from "@/components/app/AppBar";
import { ErrorState } from "@/components/app/EmptyState";
import { Page } from "@/components/app/Page";
import { RecipeEditQuery } from "@/components/recipe/editor/documents";
import { RecipeEditor } from "@/components/recipe/editor/RecipeEditor";
import { formFromRecipe } from "@/components/recipe/editor/recipe-draft";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/recipes/[recipeId]/edit` (X15): the author's editor — and where a draft
 * the AI read is reviewed before it is saved. Anyone but the author gets the
 * standard "doesn't exist or isn't shared with you" page (D24): a recipe they
 * can see but did not write is no more editable than one they cannot see.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit recipe" };

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  const data = await apiServerQuery(RecipeEditQuery, { recipeId });
  const result = unwrapResult(data.recipe, "Recipe");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <Page>
        <AppBar title="Edit recipe" parent={`/recipes/${recipeId}`} />
        <ErrorState
          title="Couldn't open the editor"
          reason={result.error.message}
        />
      </Page>
    );
  }
  const recipe = result.data;
  const viewer = data.me?.id ?? null;
  if (viewer === null || recipe.createdBy?.id !== viewer) notFound();
  // Saving replaces the whole ingredient list and method, so an editor that
  // held only the first page would delete the rest. Refuse rather than truncate.
  if (
    recipe.ingredients.pageInfo.hasNextPage ||
    recipe.instructions.pageInfo.hasNextPage
  ) {
    return (
      <Page>
        <AppBar title="Edit recipe" parent={`/recipes/${recipeId}`} />
        <ErrorState
          title="Too long to edit here"
          reason="It has more ingredients or steps than the editor holds, and saving would lose some."
        />
      </Page>
    );
  }

  return (
    <RecipeEditor
      mode="edit"
      recipeId={recipe.id}
      isDraft={recipe.isDraft}
      initial={formFromRecipe({
        name: recipe.name,
        type: recipe.type,
        description: recipe.description ?? null,
        privacy: recipe.privacy,
        isDraft: recipe.isDraft,
        ingredients: recipe.ingredients.edges.map(({ node }) => ({
          id: node.id,
          quantity: node.quantity ?? null,
          unit: node.unit ?? null,
          quantityText: node.quantityText ?? null,
          amount: node.amount,
          isOptional: node.isOptional,
          substitutionNotes: node.substitutionNotes ?? null,
          role: node.role ?? null,
          kind: node.kind ?? null,
          kindLabel: node.kindLabel ?? null,
          brandMentioned: node.brandMentioned ?? null,
          item:
            node.item === null || node.item === undefined
              ? null
              : {
                  id: node.item.id,
                  name: node.item.name,
                  type: node.item.type,
                },
          genericItem:
            node.genericItem === null || node.genericItem === undefined
              ? null
              : {
                  id: node.genericItem.id,
                  name: node.genericItem.name,
                  category: node.genericItem.category,
                  kind: node.genericItem.kind,
                },
        })),
        steps: recipe.instructions.edges.map(({ node }) => ({
          id: node.id,
          instructionText: node.instructionText,
          instructionType: node.instructionType ?? null,
          equipmentNeeded: node.equipmentNeeded ?? null,
          timeMinutes: node.timeMinutes ?? null,
        })),
      })}
    />
  );
}
