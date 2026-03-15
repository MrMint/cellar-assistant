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
import { isNotNil } from "ramda";
import beer1 from "@/images/beer1.png";
import wine1 from "@/images/wine1.png";
import { AddRecipeReview } from "./AddRecipeReview";
import { RecipeDetailsCard } from "./RecipeDetailsCard";
import { RecipeHeaderServer } from "./RecipeHeaderServer";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { type RecipeReview, RecipeReviews } from "./RecipeReviews";
import { RecipeShare } from "./RecipeShare";

const getFallback = (type: "food" | "cocktail") => {
  return type === "food"
    ? { image: beer1, alt: "A food dish" }
    : { image: wine1, alt: "A cocktail" };
};

const _getDifficultyColor = (level: number) => {
  if (level <= 2) return "success";
  if (level <= 3) return "warning";
  return "danger";
};

const _getDifficultyText = (level: number) => {
  if (level === 1) return "Very Easy";
  if (level === 2) return "Easy";
  if (level === 3) return "Medium";
  if (level === 4) return "Hard";
  return "Very Hard";
};

export type RecipeInstruction = {
  id: string;
  step_number: number;
  instruction_text: string;
  instruction_type?: string | null;
  equipment_needed?: string | null;
  time_minutes?: number | null;
};

export type RecipeIngredient = {
  id: string;
  quantity?: number | null;
  unit?: string | null;
  is_optional?: boolean;
  substitution_notes?: string | null;
  wine_id?: string | null;
  beer_id?: string | null;
  spirit_id?: string | null;
  coffee_id?: string | null;
  generic_item_id?: string | null;
  wine?: { id: string; name: string; vintage?: string | null } | null;
  beer?: { id: string; name: string } | null;
  spirit?: { id: string; name: string } | null;
  coffee?: { id: string; name: string } | null;
  generic_item?: {
    id: string;
    name: string;
    category?: string | null;
    subcategory?: string | null;
    item_type?: string | null;
  } | null;
};

export type RecipeDetailsItem = {
  id: string;
  name: string;
  description?: string | null;
  type: "food" | "cocktail";
  difficulty_level?: number | null;
  prep_time_minutes?: number | null;
  serving_size?: number | null;
  image_url?: string | null;
  version?: number | null;
  canonical_recipe_id?: string | null;
  instructions: RecipeInstruction[];
  ingredients: RecipeIngredient[];
  recipe_reviews?: RecipeReview[];
  canonical_recipe?: {
    id: string;
    name: string;
    type: string;
  } | null;
  recipe_variations?: {
    id: string;
    name: string;
    version?: number | null;
    difficulty_level?: number | null;
  }[];
};

export type RecipeDetailsProps = {
  recipe: RecipeDetailsItem;
  userId?: string; // For checking ingredient availability in user's cellar
  showGroupInfo?: boolean; // Whether to show recipe group information
  showVotingInfo?: boolean; // Whether to show voting UI
};

export const RecipeDetails = ({
  recipe,
  userId,
}: RecipeDetailsProps) => {
  const fallback = getFallback(recipe.type);

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
                  <Image
                    src={recipe.image_url}
                    alt={recipe.name}
                    fill
                    style={{
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
                favoriteId={undefined} // TODO: Implement recipe favorites
                title={recipe.name}
                type={recipe.type}
                difficulty_level={recipe.difficulty_level}
                prep_time_minutes={recipe.prep_time_minutes}
                serving_size={recipe.serving_size}
                version={recipe.version}
                description={recipe.description}
              />

              {/* Recipe variations */}
              {(isNotNil(recipe.canonical_recipe) ||
                (isNotNil(recipe.recipe_variations) &&
                  recipe.recipe_variations.length > 0)) && (
                <Card>
                  <CardContent>
                    <Stack spacing={2}>
                      {isNotNil(recipe.canonical_recipe) && (
                        <Box>
                          <Typography
                            level="body-sm"
                            sx={{ color: "text.secondary" }}
                          >
                            Variation of:{" "}
                            <Typography
                              component="span"
                              level="body-sm"
                              fontWeight="md"
                            >
                              {recipe.canonical_recipe.name}
                            </Typography>
                          </Typography>
                        </Box>
                      )}

                      {isNotNil(recipe.recipe_variations) &&
                        recipe.recipe_variations.length > 0 && (
                          <Box>
                            <Typography
                              level="body-sm"
                              sx={{ color: "text.secondary", mb: 1 }}
                            >
                              Other variations:
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              {recipe.recipe_variations.map((variation) => (
                                <Chip
                                  key={variation.id}
                                  variant="outlined"
                                  size="sm"
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
                  <RecipeIngredientList
                    ingredients={recipe.ingredients}
                    userId={userId}
                  />
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
              <AddRecipeReview recipeId={recipe.id} />
              {isNotNil(recipe.recipe_reviews) && (
                <RecipeReviews reviews={recipe.recipe_reviews} />
              )}
            </Stack>
          </Grid>
        </Grid>
      </Grid>
    </Stack>
  );
};
