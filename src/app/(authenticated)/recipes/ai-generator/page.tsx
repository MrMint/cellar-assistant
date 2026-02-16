"use client";

import { graphql } from "@cellar-assistant/shared";
import {
  MdAutoFixHigh,
  MdPhotoCamera,
  MdPsychology,
  MdSpeed,
  MdTrendingUp,
  MdVisibility,
} from "react-icons/md";
import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import { useState } from "react";
import { useQuery } from "urql";
import { RecipeDetails } from "@/components/recipe/RecipeDetails";
import { RecipePhotoProcessor } from "@/components/recipe/RecipePhotoProcessor";

const GetRecipeDetailsQuery = graphql(`
  query GetRecipeDetails($recipeIds: [uuid!]!) {
    recipes(where: { id: { _in: $recipeIds } }) {
      id
      name
      description
      type
      difficulty_level
      prep_time_minutes
      serving_size
      image_url
      version
      canonical_recipe_id
      canonical_recipe {
        id
        name
        type
      }
      recipe_variations {
        id
        name
        version
        difficulty_level
      }
      recipe_ingredients {
        id
        quantity
        unit
        is_optional
        substitution_notes
        wine_id
        beer_id
        spirit_id
        coffee_id
        generic_item_id
        wine {
          id
          name
          vintage
        }
        beer {
          id
          name
        }
        spirit {
          id
          name
        }
        coffee {
          id
          name
        }
        generic_item {
          id
          name
          category
          subcategory
          item_type
        }
      }
      recipe_instructions {
        id
        step_number
        instruction_text
        instruction_type
        equipment_needed
        time_minutes
      }
      recipe_reviews {
        id
        rating
        comment
        created_at
        user {
          id
          displayName
          avatarUrl
        }
      }
    }
  }
`);

export default function AIRecipeGeneratorPage() {
  const [createdRecipeIds, setCreatedRecipeIds] = useState<string[]>([]);

  const [{ data: recipesData }] = useQuery({
    query: GetRecipeDetailsQuery,
    variables: { recipeIds: createdRecipeIds },
    pause: createdRecipeIds.length === 0,
  });

  const handleRecipesCreated = (recipeIds: string[]) => {
    setCreatedRecipeIds((prev) => [...prev, ...recipeIds]);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 6, textAlign: "center" }}>
        <Typography level="h1" component="h1" sx={{ mb: 2 }}>
          AI Recipe Generator
        </Typography>
        <Typography
          level="body-lg"
          sx={{ color: "text.secondary", maxWidth: 600, mx: "auto" }}
        >
          Transform any menu photo, recipe card, or cookbook page into detailed,
          executable recipes automatically matched to your cellar contents.
        </Typography>
      </Box>

      {/* Main Generator */}
      <Grid container spacing={4}>
        <Grid xs={12} lg={8}>
          <RecipePhotoProcessor onRecipesCreated={handleRecipesCreated} />
        </Grid>

        <Grid xs={12} lg={4}>
          <Stack spacing={3}>
            {/* Features */}
            <Card variant="outlined">
              <CardContent>
                <Typography level="h3" sx={{ mb: 2 }}>
                  AI Features
                </Typography>
                <Stack spacing={2}>
                  <Box
                    sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}
                  >
                    <MdPsychology
                      style={{
                        color: "var(--joy-palette-primary-500)",
                        marginTop: 4,
                      }}
                    />
                    <Box>
                      <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                        Smart Vision Analysis
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "text.tertiary" }}
                      >
                        Advanced OCR and computer vision to extract recipes from
                        photos
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}
                  >
                    <MdAutoFixHigh
                      style={{
                        color: "var(--joy-palette-primary-500)",
                        marginTop: 4,
                      }}
                    />
                    <Box>
                      <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                        Ingredient Classification
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "text.tertiary" }}
                      >
                        Automatically categorizes ingredients and links to your
                        cellar
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}
                  >
                    <MdSpeed
                      style={{
                        color: "var(--joy-palette-primary-500)",
                        marginTop: 4,
                      }}
                    />
                    <Box>
                      <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                        Instant Processing
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "text.tertiary" }}
                      >
                        Generate complete recipes in seconds, not hours
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}
                  >
                    <MdVisibility
                      style={{
                        color: "var(--joy-palette-primary-500)",
                        marginTop: 4,
                      }}
                    />
                    <Box>
                      <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                        Quality Assurance
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "text.tertiary" }}
                      >
                        AI confidence scoring ensures high-quality recipe output
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card variant="outlined">
              <CardContent>
                <Typography level="h3" sx={{ mb: 2 }}>
                  Best Results Tips
                </Typography>
                <Stack spacing={1.5}>
                  <Typography level="body-sm">
                    📱 <strong>Clear photos:</strong> Ensure text is readable
                    and well-lit
                  </Typography>
                  <Typography level="body-sm">
                    📋 <strong>Full menus:</strong> Use "Full Menu Analysis" for
                    comprehensive extraction
                  </Typography>
                  <Typography level="body-sm">
                    🍸 <strong>Cocktail focus:</strong> Select "Cocktail Focus"
                    for bar menus
                  </Typography>
                  <Typography level="body-sm">
                    🍽️ <strong>Food focus:</strong> Select "Food Focus" for
                    restaurant menus
                  </Typography>
                  <Typography level="body-sm">
                    ✨ <strong>Auto-enhance:</strong> Keep enabled to match
                    ingredients to your cellar
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card variant="soft" color="primary">
              <CardContent>
                <Typography
                  level="h3"
                  sx={{ mb: 2, color: "primary.plainColor" }}
                >
                  System Capabilities
                </Typography>
                <Grid container spacing={2}>
                  <Grid xs={6}>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography
                        level="h2"
                        sx={{ color: "primary.plainColor" }}
                      >
                        95%
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "primary.plainColor" }}
                      >
                        OCR Accuracy
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid xs={6}>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography
                        level="h2"
                        sx={{ color: "primary.plainColor" }}
                      >
                        150+
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "primary.plainColor" }}
                      >
                        Ingredients Known
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid xs={6}>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography
                        level="h2"
                        sx={{ color: "primary.plainColor" }}
                      >
                        &lt;30s
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "primary.plainColor" }}
                      >
                        Processing Time
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid xs={6}>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography
                        level="h2"
                        sx={{ color: "primary.plainColor" }}
                      >
                        4+
                      </Typography>
                      <Typography
                        level="body-xs"
                        sx={{ color: "primary.plainColor" }}
                      >
                        Item Categories
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      {/* How It Works */}
      <Box sx={{ mt: 8 }}>
        <Typography
          level="h2"
          component="h2"
          sx={{ mb: 4, textAlign: "center" }}
        >
          How It Works
        </Typography>
        <Grid container spacing={4}>
          <Grid xs={12} md={3}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent sx={{ textAlign: "center" }}>
                <MdPhotoCamera
                  size={40}
                  style={{
                    color: "var(--joy-palette-primary-500)",
                    marginBottom: 16,
                  }}
                />
                <Typography level="h4" sx={{ mb: 1 }}>
                  1. Upload Photo
                </Typography>
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  Take or upload a photo of any menu, recipe card, or cookbook
                  page
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={3}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent sx={{ textAlign: "center" }}>
                <MdPsychology
                  size={40}
                  style={{
                    color: "var(--joy-palette-primary-500)",
                    marginBottom: 16,
                  }}
                />
                <Typography level="h4" sx={{ mb: 1 }}>
                  2. AI Analysis
                </Typography>
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  Advanced AI extracts recipes, ingredients, and cooking
                  instructions
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={3}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent sx={{ textAlign: "center" }}>
                <MdAutoFixHigh
                  size={40}
                  style={{
                    color: "var(--joy-palette-primary-500)",
                    marginBottom: 16,
                  }}
                />
                <Typography level="h4" sx={{ mb: 1 }}>
                  3. Smart Matching
                </Typography>
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  Ingredients are automatically matched to items in your cellar
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={3}>
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent sx={{ textAlign: "center" }}>
                <MdTrendingUp
                  size={40}
                  style={{
                    color: "var(--joy-palette-primary-500)",
                    marginBottom: 16,
                  }}
                />
                <Typography level="h4" sx={{ mb: 1 }}>
                  4. Ready to Cook
                </Typography>
                <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                  Get complete recipes with compatibility scores and
                  substitutions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Generated Recipes Display */}
      {recipesData?.recipes && recipesData.recipes.length > 0 && (
        <Box sx={{ mt: 8 }}>
          <Typography
            level="h2"
            component="h2"
            sx={{ mb: 4, textAlign: "center" }}
          >
            Your Generated Recipes
          </Typography>
          <Stack spacing={6}>
            {recipesData.recipes.map((recipe) => (
              <RecipeDetails
                key={recipe.id}
                recipe={{
                  id: recipe.id,
                  name: recipe.name,
                  description: recipe.description,
                  type: recipe.type as "food" | "cocktail",
                  difficulty_level: recipe.difficulty_level,
                  prep_time_minutes: recipe.prep_time_minutes,
                  serving_size: recipe.serving_size,
                  image_url: recipe.image_url,
                  version: recipe.version,
                  canonical_recipe_id: recipe.canonical_recipe_id,
                  canonical_recipe: recipe.canonical_recipe as
                    | { id: string; name: string; type: string }
                    | null
                    | undefined,
                  recipe_variations: recipe.recipe_variations as
                    | {
                        id: string;
                        name: string;
                        version?: number | null;
                        difficulty_level?: number | null;
                      }[]
                    | undefined,
                  instructions: (
                    recipe.recipe_instructions as Array<{
                      id: string;
                      step_number: number;
                      instruction_text: string;
                      instruction_type?: string | null;
                      equipment_needed?: string | null;
                      time_minutes?: number | null;
                    }>
                  ).map((instruction) => ({
                    id: instruction.id,
                    step_number: instruction.step_number,
                    instruction_text: instruction.instruction_text,
                    instruction_type: instruction.instruction_type,
                    equipment_needed: instruction.equipment_needed,
                    time_minutes: instruction.time_minutes,
                  })),
                  ingredients: (
                    recipe.recipe_ingredients as Array<{
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
                      wine?: {
                        id: string;
                        name: string;
                        vintage?: string | null;
                      } | null;
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
                    }>
                  ).map((ingredient) => ({
                    id: ingredient.id,
                    quantity: ingredient.quantity,
                    unit: ingredient.unit,
                    is_optional: ingredient.is_optional,
                    substitution_notes: ingredient.substitution_notes,
                    wine_id: ingredient.wine_id,
                    beer_id: ingredient.beer_id,
                    spirit_id: ingredient.spirit_id,
                    coffee_id: ingredient.coffee_id,
                    generic_item_id: ingredient.generic_item_id,
                    wine: ingredient.wine,
                    beer: ingredient.beer,
                    spirit: ingredient.spirit,
                    coffee: ingredient.coffee,
                    generic_item: ingredient.generic_item,
                  })),
                  recipe_reviews:
                    (recipe.recipe_reviews as Array<{
                      id: string;
                      score?: number;
                      text?: string | null;
                      created_at: string;
                      user: { displayName: string; avatarUrl: string };
                    }>) || [],
                }}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Container>
  );
}
