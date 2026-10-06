"use client";

import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import { useMemo, useState } from "react";
import {
  MdAutoFixHigh,
  MdPhotoCamera,
  MdPsychology,
  MdTrendingUp,
  MdVisibility,
} from "react-icons/md";
import { useQuery } from "urql";
import { ApiError } from "@/components/cellar-api/ApiError";
import { readFragment } from "@/lib/api/graphql";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { recipeDetailsFromNode } from "./adapter";
import { RecipeDetailsFragment, RecipeReviewFragment } from "./fragments";
import { RecipePageQuery, recipePageVariables } from "./queries";
import { RecipeDetails } from "./RecipeDetails";
import { RecipePhotoProcessor } from "./RecipePhotoProcessor";

/**
 * One generated recipe, read back and shown as the old page did, inline. A
 * read-back that fails — a typed error, or the request itself — says so
 * instead of leaving a gap where the recipe should be; the old page never
 * read back (it had the recipe from the server action), so it had no such
 * state to show.
 */
export function GeneratedRecipe({ recipeId }: { recipeId: string }) {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: RecipePageQuery,
    variables: recipePageVariables(recipeId),
  });
  const result = useMemo(() => unwrapResult(data?.recipe, "Recipe"), [data]);
  const recipe = useMemo(
    () =>
      result.ok
        ? recipeDetailsFromNode(
            readFragment(RecipeDetailsFragment, result.data),
            {
              group: result.data.recipeGroup ?? null,
              reviews: result.data.reviews.edges.map((edge) =>
                readFragment(RecipeReviewFragment, edge.node),
              ),
            },
          )
        : null,
    [result],
  );
  if (!result.ok) {
    if (fetching && error === undefined) return null;
    return (
      <ApiError
        title="The new recipe could not be loaded"
        error={error === undefined ? result.error : failureFromTransport(error)}
      />
    );
  }
  if (recipe === null) return null;
  return (
    <RecipeDetails
      recipe={recipe}
      viewerId={data?.me?.id ?? null}
      reviewsEndCursor={result.data.reviews.pageInfo.endCursor ?? null}
      reviewsHasNextPage={result.data.reviews.pageInfo.hasNextPage}
      onChanged={() => refetch({ requestPolicy: "network-only" })}
    />
  );
}

const FEATURES = [
  {
    icon: MdPsychology,
    title: "Smart Vision Analysis",
    text: "Advanced OCR and computer vision to extract recipes from photos",
  },
  {
    icon: MdAutoFixHigh,
    title: "Ingredient Classification",
    text: "Automatically categorizes ingredients and links them to items in the catalog",
  },
  {
    icon: MdVisibility,
    title: "Recipe Groups",
    text: "Files the recipe beside other versions of the same drink or dish",
  },
] as const;

const STEPS = [
  {
    icon: MdPhotoCamera,
    title: "1. Upload Photo",
    text: "Take or upload a photo of any menu, recipe card, or cookbook page",
  },
  {
    icon: MdPsychology,
    title: "2. AI Analysis",
    text: "Advanced AI extracts recipes, ingredients, and cooking instructions",
  },
  {
    icon: MdAutoFixHigh,
    title: "3. Smart Matching",
    text: "Ingredients are automatically matched to items in the catalog",
  },
  {
    icon: MdTrendingUp,
    title: "4. Ready to Cook",
    text: "Get a complete recipe with ingredients and steps, ready to review",
  },
] as const;

/**
 * `82450ad1:src/app/(authenticated)/recipes/ai-generator/page.tsx`, restored:
 * the "AI Recipe Generator" header, `RecipePhotoProcessor` beside the
 * features and tips cards, "How It Works", and "Your Generated Recipes" with
 * each new recipe as `RecipeDetails`.
 *
 * Copy that described things the product does not do is corrected or gone
 * rather than restored (§7 and `lib/dev-checks/capability-claims.test.ts`):
 *
 * - the "System Capabilities" card ("95% OCR Accuracy", "150+ Ingredients
 *   Known", "<30s", "4+") — invented numbers;
 * - "matched to your cellar contents" / "links to your cellar" — the job
 *   matches ingredients against the item catalog, not the viewer's cellar;
 * - "Instant Processing … in seconds" — a job takes a minute or two;
 * - "Quality Assurance: AI confidence scoring" — nothing scores the output;
 *   replaced by what the job does do (files the recipe in a group);
 * - the tips for "Full Menu Analysis", "Cocktail Focus", "Food Focus" and
 *   "Auto-enhance" — modes the old processor never offered either;
 * - "compatibility scores and substitutions" — G29 is dropped.
 */
export function AIRecipeGenerator() {
  const [createdRecipeIds, setCreatedRecipeIds] = useState<string[]>([]);

  const handleRecipesCreated = (recipeIds: string[]) => {
    setCreatedRecipeIds((prev) => [
      ...prev,
      ...recipeIds.filter((id) => !prev.includes(id)),
    ]);
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
          Transform any menu photo, recipe card, or cookbook page into a
          detailed, executable recipe, with its ingredients matched to items in
          the catalog.
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
                  {FEATURES.map(({ icon: Icon, title, text }) => (
                    <Box
                      key={title}
                      sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}
                    >
                      <Icon
                        style={{
                          color: "var(--joy-palette-primary-500)",
                          marginTop: 4,
                        }}
                      />
                      <Box>
                        <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                          {title}
                        </Typography>
                        <Typography
                          level="body-xs"
                          sx={{ color: "text.tertiary" }}
                        >
                          {text}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
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
                    🍸 <strong>One recipe per photo:</strong> Each photo becomes
                    one recipe
                  </Typography>
                </Stack>
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
          {STEPS.map(({ icon: Icon, title, text }) => (
            <Grid key={title} xs={12} md={3}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Icon
                    size={40}
                    style={{
                      color: "var(--joy-palette-primary-500)",
                      marginBottom: 16,
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  />
                  <Typography level="h4" sx={{ mb: 1 }}>
                    {title}
                  </Typography>
                  <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                    {text}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Generated Recipes Display */}
      {createdRecipeIds.length > 0 && (
        <Box sx={{ mt: 8 }}>
          <Typography
            level="h2"
            component="h2"
            sx={{ mb: 4, textAlign: "center" }}
          >
            Your Generated Recipes
          </Typography>
          <Stack spacing={6}>
            {createdRecipeIds.map((recipeId) => (
              <GeneratedRecipe key={recipeId} recipeId={recipeId} />
            ))}
          </Stack>
        </Box>
      )}
    </Container>
  );
}
