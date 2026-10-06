"use client";

import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { isNotNil } from "ramda";
import { Link } from "@/components/common/Link";
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
 * - The favourite heart is gone (`RecipeDetailsCard`), and the ingredient
 *   availability icons with it (`RecipeIngredientList`).
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
    <Stack spacing={2}>
      <RecipeHeaderServer
        recipeId={recipe.id}
        recipeName={recipe.name}
        recipeType={recipe.type}
      />

      <Grid container spacing={2}>
        <Grid xs={12} sm={4}>
          <Stack spacing={1}>
            <Card sx={{ aspectRatio: "1" }}>
              <CardContent sx={{ p: 0, position: "relative" }}>
                {isNotNil(recipe.image_url) ? (
                  <Box
                    component="img"
                    src={recipe.image_url}
                    alt={recipe.name}
                    sx={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <Image
                    src={fallback.image}
                    alt={fallback.alt}
                    fill
                    style={{
                      objectFit: "cover",
                    }}
                  />
                )}
              </CardContent>
            </Card>
            <RecipeShare recipeId={recipe.id} recipeType={recipe.type} />
          </Stack>
        </Grid>

        <Grid container xs={12} sm={8}>
          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              <RecipeDetailsCard
                recipeId={recipe.id}
                title={recipe.name}
                type={recipe.type}
                difficulty_level={recipe.difficulty_level}
                prep_time_minutes={recipe.prep_time_minutes}
                serving_size={recipe.serving_size}
                version={recipe.version}
                description={recipe.description}
              />

              {/* Recipe variations */}
              {(isNotNil(recipe.canonical_recipe) || variations.length > 0) && (
                <Card>
                  <CardContent>
                    <Stack spacing={2}>
                      {isCanonical && <CanonicalRecipeBadge size="sm" />}
                      {isNotNil(recipe.canonical_recipe) && (
                        <Box>
                          <Typography
                            level="body-sm"
                            sx={{ color: "text.secondary" }}
                          >
                            Variation of:{" "}
                            <Link
                              href={`/recipes/${recipe.canonical_recipe.id}`}
                              level="body-sm"
                              fontWeight="md"
                            >
                              {recipe.canonical_recipe.name}
                            </Link>
                          </Typography>
                        </Box>
                      )}

                      {variations.length > 0 && (
                        <Box>
                          <Typography
                            level="body-sm"
                            sx={{ color: "text.secondary", mb: 1 }}
                          >
                            Other variations:
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            {variations.map((variation) => (
                              <Chip
                                key={variation.id}
                                variant="outlined"
                                size="sm"
                                slotProps={{
                                  action: {
                                    component: NextLink,
                                    href: `/recipes/${variation.id}`,
                                  },
                                }}
                              >
                                {variation.name}
                                {isNotNil(variation.version) &&
                                  ` v${variation.version}`}
                              </Chip>
                            ))}
                          </Stack>
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              )}

              {/* Ingredients */}
              <Card>
                <CardContent>
                  <Typography level="h4" component="h2" sx={{ mb: 2 }}>
                    Ingredients
                  </Typography>
                  <RecipeIngredientList ingredients={recipe.ingredients} />
                </CardContent>
              </Card>
            </Stack>
          </Grid>

          <Grid xs={12} sm={12} lg={6}>
            <Stack spacing={2}>
              {/* Instructions */}
              <Card>
                <CardContent>
                  <Typography level="h4" component="h2" sx={{ mb: 2 }}>
                    Instructions
                  </Typography>
                  <Stack spacing={2}>
                    {recipe.instructions.map((instruction, index) => (
                      <Box key={instruction.id}>
                        <Stack
                          direction="row"
                          spacing={2}
                          alignItems="flex-start"
                        >
                          <Chip
                            variant="solid"
                            color="primary"
                            size="sm"
                            sx={{ minWidth: "32px", fontWeight: "bold" }}
                          >
                            {instruction.step_number}
                          </Chip>
                          <Stack spacing={1} sx={{ flex: 1 }}>
                            <Typography level="body-md">
                              {instruction.instruction_text}
                            </Typography>

                            <Stack direction="row" spacing={2} flexWrap="wrap">
                              {isNotNil(instruction.instruction_type) && (
                                <Chip variant="outlined" size="sm">
                                  {instruction.instruction_type}
                                </Chip>
                              )}

                              {isNotNil(instruction.equipment_needed) && (
                                <Typography
                                  level="body-sm"
                                  sx={{ color: "text.secondary" }}
                                >
                                  Equipment: {instruction.equipment_needed}
                                </Typography>
                              )}

                              {isNotNil(instruction.time_minutes) && (
                                <Typography
                                  level="body-sm"
                                  sx={{ color: "text.secondary" }}
                                >
                                  Time: {instruction.time_minutes}m
                                </Typography>
                              )}
                            </Stack>
                          </Stack>
                        </Stack>

                        {index < recipe.instructions.length - 1 && (
                          <Divider sx={{ my: 2 }} />
                        )}
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>

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
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
};
