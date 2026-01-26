"use client";

import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import { isNotNil } from "ramda";
import { MdCheckCircle, MdRestaurant, MdStar } from "react-icons/md";
import { useRecipeRecommendations } from "@/hooks/useRecipeCompatibility";
import { RecipeCard } from "./RecipeCard";

export type RecipeRecommendationsProps = {
  userId?: string;
  limit?: number;
  minCompatibilityScore?: number;
  recipeTypes?: ("food" | "cocktail")[];
  title?: string;
  showCompatibilityBadge?: boolean;
};

export const RecipeRecommendations = ({
  userId,
  limit = 6,
  minCompatibilityScore = 60,
  recipeTypes = ["cocktail"],
  title = "Recommended Recipes",
  showCompatibilityBadge = true,
}: RecipeRecommendationsProps) => {
  const { recommendations, isLoading, error } = useRecipeRecommendations({
    userId,
    limit,
    minCompatibilityScore,
    recipeTypes,
    enabled: isNotNil(userId),
  });

  if (!userId) {
    return (
      <Card>
        <CardContent>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            {title}
          </Typography>
          <Typography level="body-md" sx={{ color: "text.secondary" }}>
            Sign in to get personalized recipe recommendations based on your
            cellar contents.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            {title}
          </Typography>
          <Typography level="body-md">
            Finding recipes you can make...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            {title}
          </Typography>
          <Typography level="body-md" sx={{ color: "danger.500" }}>
            Unable to load recommendations. Please try again.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography level="h4" component="h2" sx={{ mb: 2 }}>
            {title}
          </Typography>
          <Stack spacing={2} sx={{ textAlign: "center", py: 3 }}>
            <MdRestaurant
              size={48}
              style={{
                color: "var(--joy-palette-neutral-400)",
                margin: "0 auto",
              }}
            />
            <Typography level="body-md" sx={{ color: "text.secondary" }}>
              No recipes found that match your current cellar contents.
            </Typography>
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              Try adding more items to your cellar or lowering the compatibility
              threshold.
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Typography level="h4" component="h2" sx={{ mb: 3 }}>
        {title}
      </Typography>

      {/* Summary stats */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <Chip
            variant="soft"
            color="success"
            startDecorator={<MdCheckCircle />}
          >
            {recommendations.filter((r) => r.compatibility?.can_make).length}{" "}
            recipes you can make
          </Chip>
          <Chip variant="soft" color="neutral">
            {recommendations.length} total recommendations
          </Chip>
          {recipeTypes.length < 2 && (
            <Chip variant="outlined" size="sm">
              {recipeTypes[0] === "food" ? "Food" : "Cocktails"} only
            </Chip>
          )}
        </Stack>
      </Box>

      <Grid container spacing={2}>
        {recommendations.map((recipe) => (
          <Grid key={recipe.id} xs={12} sm={6} md={4}>
            <Box sx={{ position: "relative" }}>
              <RecipeCard
                recipe={{
                  id: recipe.id,
                  name: recipe.name,
                  type: recipe.type as "cocktail",
                  difficulty_level: recipe.difficulty_level,
                  image_url: recipe.image_url,
                  compatibility_score: recipe.compatibility?.overall_score,
                }}
                href={`/recipes/${recipe.id}`}
                showCompatibility={showCompatibilityBadge}
              />

              {/* Compatibility badge overlay */}
              {showCompatibilityBadge && recipe.compatibility && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    zIndex: 2,
                  }}
                >
                  <Stack direction="row" spacing={1}>
                    {recipe.compatibility.can_make && (
                      <Chip
                        color="success"
                        size="sm"
                        startDecorator={<MdCheckCircle />}
                        sx={{ fontWeight: "bold" }}
                      >
                        Can Make
                      </Chip>
                    )}

                    <Chip
                      color={getCompatibilityColor(
                        recipe.compatibility.overall_score,
                      )}
                      size="sm"
                      startDecorator={<MdStar />}
                    >
                      {recipe.compatibility.overall_score}%
                    </Chip>
                  </Stack>
                </Box>
              )}
            </Box>
          </Grid>
        ))}
      </Grid>

      {/* Show more link or pagination could go here */}
      {recommendations.length === limit && (
        <Box sx={{ textAlign: "center", mt: 3 }}>
          <Typography level="body-sm" sx={{ color: "text.secondary" }}>
            Showing top {limit} recommendations
          </Typography>
        </Box>
      )}
    </Box>
  );
};

// Helper function to get compatibility color
function getCompatibilityColor(score: number) {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "neutral";
}

/**
 * Compact version for smaller spaces
 */
export type CompactRecipeRecommendationsProps = {
  userId?: string;
  limit?: number;
  orientation?: "horizontal" | "vertical";
};

export const CompactRecipeRecommendations = ({
  userId,
  limit = 3,
  orientation = "horizontal",
}: CompactRecipeRecommendationsProps) => {
  const { recommendations, isLoading } = useRecipeRecommendations({
    userId,
    limit,
    minCompatibilityScore: 70, // Higher threshold for compact view
    enabled: isNotNil(userId),
  });

  if (!userId || isLoading || recommendations.length === 0) {
    return null;
  }

  return (
    <Box>
      <Typography level="title-sm" sx={{ mb: 2 }}>
        Recipes You Can Make
      </Typography>

      <Stack
        direction={orientation === "horizontal" ? "row" : "column"}
        spacing={2}
        sx={{
          overflowX: orientation === "horizontal" ? "auto" : "visible",
          pb: orientation === "horizontal" ? 1 : 0,
        }}
      >
        {recommendations.slice(0, limit).map((recipe) => (
          <Box
            key={recipe.id}
            sx={{
              minWidth: orientation === "horizontal" ? 200 : "auto",
              flexShrink: 0,
            }}
          >
            <Card variant="outlined" size="sm">
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  {recipe.image_url && (
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "sm",
                        background: `url(${recipe.image_url}) center/cover`,
                      }}
                    />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography level="body-sm" noWrap>
                      {recipe.name}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip color="success" size="sm" variant="soft">
                        {recipe.compatibility?.overall_score}%
                      </Chip>
                      {recipe.compatibility?.can_make && (
                        <MdCheckCircle
                          size={14}
                          style={{ color: "var(--joy-palette-success-500)" }}
                        />
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};
