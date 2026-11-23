"use client";

import { useRouter } from "next/navigation";
import { isNotNil } from "ramda";
import { useState } from "react";
import { useMutation } from "urql";
import { AIDraftField } from "@/components/app/AIDraftField";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import { Lock, People, Public } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { useNavigate } from "@/components/app/useNavigate";
import { MakeabilitySummary } from "@/components/bar/Availability";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { AddRecipeReview } from "./AddRecipeReview";
import type { RecipeDetailsItem } from "./adapter";
import { CanonicalRecipeBadge } from "./CanonicalRecipeBadge";
import { DeleteRecipeMutation } from "./editor/documents";
import { PRIVACY_COPY } from "./editor/recipe-draft";
import { RecipeDetailsCard } from "./RecipeDetailsCard";
import { RecipeHeaderServer } from "./RecipeHeaderServer";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { RecipePlate } from "./RecipePlate";
import { RecipeReviews } from "./RecipeReviews";
import { useRecipeShareItem } from "./RecipeShare";

export type {
  RecipeDetailsItem,
  RecipeIngredient,
  RecipeInstruction,
} from "./adapter";

const PRIVACY_ICON = {
  PRIVATE: Lock,
  FRIENDS: People,
  PUBLIC: Public,
} as const;

export type RecipeDetailsProps = {
  recipe: RecipeDetailsItem;
  /** The signed-in viewer: picks their own review out for editing. */
  viewerId?: string | null;
  /** Whether this is the group's community pick (shows the old badge). */
  isCanonical?: boolean;
  /** The reviews connection's paging, beyond the first page in `recipe`. */
  reviewsEndCursor?: string | null;
  reviewsHasNextPage?: boolean;
  /**
   * After a review write. Defaults to `router.refresh()`, which re-runs the
   * server page that rendered this — the old pages did the same with
   * `revalidatePath`. A client-rendered caller (the photo page) refetches.
   */
  onChanged?: () => void;
  /**
   * The recipe name's heading level (X21): `h1` where it is the page's
   * heading (`/recipes/[id]`), `h2` under a page's own h1 (a group's name,
   * the AI generator's title).
   */
  titleLevel?: "h1" | "h2";
};

/**
 * `82450ad1:src/components/recipe/RecipeDetails.tsx`, restored — the page that
 * threw on load in production (`recipe_reviews` had no Hasura permission), now
 * over `recipe(id:)`. Props are the old snake_case shape, from `adapter.ts`.
 *
 * Changes, each forced by the data:
 *
 * - The picture is a plain `<img>`: `Recipe.imageUrl` is a free-form URL, and
 *   `next/image` would need its host allowlisted. The fallback art is still
 *   `next/image`.
 * - "Variation of" / "Other variations" come from the recipe's group (the old
 *   relationships never existed in Hasura). The chips link to each version,
 *   which the old ones did not — the only way off this page to a sibling.
 * - The canonical version wears `CanonicalRecipeBadge` (the old versions-tab
 *   badge) in that card — the rewrite's "Community pick".
 * - The favourite heart came back as Love (D9, `RecipeDetailsCard`), and the
 *   ingredient availability icons as real availability from the viewer's
 *   bottles and Bar pantry (D9, `RecipeIngredientList`), with the recipe's
 *   verdict — You can make this / One bottle away — above the list (X14).
 */
export const RecipeDetails = ({
  recipe,
  viewerId = null,
  isCanonical = false,
  reviewsEndCursor = null,
  reviewsHasNextPage = false,
  onChanged,
  titleLevel = "h2",
}: RecipeDetailsProps) => {
  const router = useRouter();
  const navigate = useNavigate();
  const reviews = recipe.recipe_reviews ?? [];
  const isOwner =
    viewerId !== null &&
    recipe.created_by_id !== undefined &&
    recipe.created_by_id === viewerId;
  const isDraft = recipe.is_draft === true;
  const privacy =
    recipe.privacy === "FRIENDS" || recipe.privacy === "PUBLIC"
      ? recipe.privacy
      : recipe.privacy === "PRIVATE"
        ? "PRIVATE"
        : null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<ApiFailure | null>(null);
  const [, deleteRecipe] = useMutation(DeleteRecipeMutation);
  const mine =
    viewerId === null
      ? null
      : (reviews.find((review) => review.userId === viewerId) ?? null);
  const variations = recipe.recipe_variations ?? [];
  const shareItem = useRecipeShareItem({
    recipeId: recipe.id,
    recipeName: recipe.name,
    privacy: recipe.privacy,
    isDraft,
    isOwner,
  });
  const remove = async () => {
    setDeleting(true);
    setDeleteFailure(null);
    const result = unwrapResult(
      (await deleteRecipe({ recipeId: recipe.id })).data?.deleteRecipe,
      "DeletedRecipe",
    );
    setDeleting(false);
    if (!result.ok) {
      setDeleteFailure(result.error);
      return;
    }
    setConfirmingDelete(false);
    notify(`Deleted ${recipe.name}.`);
    navigate.replace("/recipes", { kind: "back" });
    router.refresh();
  };
  const changed = () => {
    if (onChanged === undefined) router.refresh();
    else onChanged();
  };

  return (
    <div className="flex flex-col gap-4">
      <RecipeHeaderServer
        recipeId={recipe.id}
        recipeName={recipe.name}
        recipeType={recipe.type}
        overflow={
          isOwner
            ? [
                shareItem,
                {
                  label: isDraft ? "Review draft" : "Edit recipe",
                  onSelect: () =>
                    navigate.push(`/recipes/${recipe.id}/edit`, {
                      kind: "forward",
                    }),
                },
                {
                  label: isDraft ? "Discard draft" : "Delete recipe",
                  onSelect: () => setConfirmingDelete(true),
                  destructive: true,
                },
              ]
            : [shareItem]
        }
      />

      {/* X15 / D22: what the AI read is the author's alone until saved. */}
      {isOwner && isDraft && (
        <AIDraftField source="suggested" drafted>
          <div className="flex flex-col gap-2 pr-24">
            <p className="type-callout text-ink-2">
              The AI read this recipe. Only you can see it until you check it
              and save it.
            </p>
            <Button asChild className="self-start">
              <Link href={`/recipes/${recipe.id}/edit`} underline="none">
                Review draft
              </Link>
            </Button>
          </div>
        </AIDraftField>
      )}
      {isOwner && !isDraft && privacy !== null && (
        <PrivacyLine privacy={privacy} recipeId={recipe.id} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-1 sm:aspect-square">
            {isNotNil(recipe.image_url) ? (
              // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
              <img
                src={recipe.image_url}
                alt={recipe.name}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              // X15: a drawn plate, never a wine bottle for a cocktail; B03
              // colours its glass from the ingredients.
              <RecipePlate
                name={recipe.name}
                type={recipe.type}
                ingredients={recipe.ingredients}
              />
            )}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 sm:col-span-2 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <RecipeDetailsCard
              titleLevel={titleLevel}
              recipeId={recipe.id}
              title={recipe.name}
              type={recipe.type}
              difficulty_level={recipe.difficulty_level}
              prep_time_minutes={recipe.prep_time_minutes}
              serving_size={recipe.serving_size}
              version={recipe.version}
              description={recipe.description}
              isWantToTry={recipe.is_want_to_try}
              isLoved={recipe.is_loved}
            />

            {/* ux-c L08: the recipe, full screen, step by step. */}
            {!isDraft && recipe.instructions.length > 0 && (
              <Button asChild size="lg" className="self-start">
                <Link
                  href={`/recipes/${recipe.id}/make`}
                  underline="none"
                  data-testid="make-it"
                >
                  Make it
                </Link>
              </Button>
            )}

            {/* Recipe variations */}
            {(isNotNil(recipe.canonical_recipe) || variations.length > 0) && (
              <section className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
                {isCanonical && <CanonicalRecipeBadge size="sm" />}
                {isNotNil(recipe.canonical_recipe) && (
                  <p className="type-callout text-ink-2">
                    Variation of:{" "}
                    <Link
                      href={`/recipes/${recipe.canonical_recipe.id}`}
                      className="font-medium text-ink-1"
                    >
                      {recipe.canonical_recipe.name}
                    </Link>
                  </p>
                )}

                {variations.length > 0 && (
                  <div>
                    <p className="mb-2 type-callout text-ink-2">
                      Other variations:
                    </p>
                    {/* A 28 px chip with a 44 px target: the pseudo-element
                        reaches 8 px above and below, and the 16 px row gap
                        keeps neighbouring rows' targets from overlapping. */}
                    <div className="flex flex-wrap gap-x-2 gap-y-4">
                      {variations.map((variation) => (
                        <Badge key={variation.id} variant="outline" asChild>
                          <Link
                            href={`/recipes/${variation.id}`}
                            underline="none"
                            className="relative h-7 max-w-full overflow-visible px-3 text-sm after:absolute after:inset-x-0 after:-inset-y-2 after:content-['']"
                          >
                            <span className="min-w-0 truncate">
                              {variation.name}
                              {isNotNil(variation.version) &&
                                ` v${variation.version}`}
                            </span>
                          </Link>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Ingredients */}
            <section className="rounded-lg bg-surface-1 p-4">
              <h2 className="mb-4 type-title-2">Ingredients</h2>
              {isNotNil(recipe.makeability) && (
                <MakeabilitySummary
                  makeability={recipe.makeability}
                  className="mb-4"
                />
              )}
              <RecipeIngredientList
                ingredients={recipe.ingredients}
                // The bar vocabulary is drinks: on a dish every line would
                // read "Not tracked", which is noise, not information.
                showAvailability={recipe.type === "cocktail"}
              />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {/* Instructions */}
            <section className="rounded-lg bg-surface-1 p-4">
              <h2 className="mb-4 type-title-2">Instructions</h2>
              <ol className="flex flex-col divide-y divide-line">
                {recipe.instructions.map((instruction) => (
                  <li
                    key={instruction.id}
                    className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <span className="tabular inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 px-2 font-bold text-ink-1 text-xs">
                      {instruction.step_number}
                    </span>
                    <div className="flex flex-1 flex-col gap-2">
                      <p className="type-body">
                        {instruction.instruction_text}
                      </p>

                      <div className="flex flex-wrap items-center gap-4">
                        {isNotNil(instruction.instruction_type) && (
                          <Badge variant="outline">
                            {instruction.instruction_type}
                          </Badge>
                        )}

                        {isNotNil(instruction.equipment_needed) && (
                          <p className="type-callout text-ink-2">
                            Equipment: {instruction.equipment_needed}
                          </p>
                        )}

                        {isNotNil(instruction.time_minutes) && (
                          <p className="type-callout text-ink-2">
                            Time: {instruction.time_minutes}m
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Reviews */}
            <AddRecipeReview
              key={mine?.id ?? "new"}
              recipeId={recipe.id}
              viewerId={viewerId}
              myReview={
                mine === null
                  ? null
                  : { id: mine.id, score: mine.score, text: mine.text }
              }
              onReviewAdded={changed}
            />
            {isNotNil(recipe.recipe_reviews) && (
              <RecipeReviews
                reviews={recipe.recipe_reviews}
                recipeId={recipe.id}
                endCursor={reviewsEndCursor}
                hasNextPage={reviewsHasNextPage}
              />
            )}
          </div>
        </div>
      </div>

      {isOwner && (
        <ConfirmSheet
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={isDraft ? "Discard this draft?" : "Delete this recipe?"}
          description={
            isDraft
              ? "What the AI read is thrown away."
              : "Its reviews, votes and Loves go with it."
          }
          confirmLabel={isDraft ? "Discard" : "Delete"}
          pending={deleting}
          onConfirm={() => void remove()}
        >
          {deleteFailure !== null && (
            <ApiError title="Couldn't delete" error={deleteFailure} />
          )}
        </ConfirmSheet>
      )}
    </div>
  );
};

/** Who can see your recipe, with the way to change it (X15 / D22). */
function PrivacyLine({
  privacy,
  recipeId,
}: {
  privacy: "PRIVATE" | "FRIENDS" | "PUBLIC";
  recipeId: string;
}) {
  const Icon = PRIVACY_ICON[privacy];
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-1 px-4 py-2">
      <Icon aria-hidden className="size-4 shrink-0 text-ink-2" />
      <p className="min-w-0 flex-1 type-callout text-ink-2">
        <span className="font-semibold text-ink-1">
          {PRIVACY_COPY[privacy].label}.
        </span>{" "}
        {PRIVACY_COPY[privacy].line}
      </p>
      <Link
        href={`/recipes/${recipeId}/edit`}
        underline="always"
        className="-mr-2 inline-flex min-h-11 shrink-0 items-center px-2 type-callout text-ink-1"
      >
        Change
      </Link>
    </div>
  );
}
