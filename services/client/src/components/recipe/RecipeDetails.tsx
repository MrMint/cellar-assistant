"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { isNotNil } from "ramda";
import { Link } from "@/components/app/Link";
import { MakeabilitySummary } from "@/components/bar/Availability";
import { Badge } from "@/components/ui/badge";
import beer1 from "@/images/beer1.png";
import wine1 from "@/images/wine1.png";
import { AddRecipeReview } from "./AddRecipeReview";
import type { RecipeDetailsItem } from "./adapter";
import { CanonicalRecipeBadge } from "./CanonicalRecipeBadge";
import { RecipeDetailsCard } from "./RecipeDetailsCard";
import { RecipeHeaderServer } from "./RecipeHeaderServer";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { RecipeReviews } from "./RecipeReviews";
import { RecipeShare } from "./RecipeShare";

export type {
  RecipeDetailsItem,
  RecipeIngredient,
  RecipeInstruction,
} from "./adapter";

const getFallback = (type: "food" | "cocktail") => {
  return type === "food"
    ? { image: beer1, alt: "A food dish" }
    : { image: wine1, alt: "A cocktail" };
};

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
}: RecipeDetailsProps) => {
  const router = useRouter();
  const fallback = getFallback(recipe.type);
  const reviews = recipe.recipe_reviews ?? [];
  const mine =
    viewerId === null
      ? null
      : (reviews.find((review) => review.userId === viewerId) ?? null);
  const variations = recipe.recipe_variations ?? [];
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
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-1">
            {isNotNil(recipe.image_url) ? (
              // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
              <img
                src={recipe.image_url}
                alt={recipe.name}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <Image
                src={fallback.image}
                alt={fallback.alt}
                fill
                className="object-cover"
              />
            )}
          </div>
          <RecipeShare recipeId={recipe.id} recipeType={recipe.type} />
        </div>

        <div className="grid gap-4 sm:col-span-2 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <RecipeDetailsCard
              recipeId={recipe.id}
              title={recipe.name}
              type={recipe.type}
              difficulty_level={recipe.difficulty_level}
              prep_time_minutes={recipe.prep_time_minutes}
              serving_size={recipe.serving_size}
              version={recipe.version}
              description={recipe.description}
              isLoved={recipe.is_loved}
            />

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

          <div className="flex flex-col gap-4">
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
    </div>
  );
};
