"use client";

import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/joy";
import { useState } from "react";
import { RecipeSearch } from "@/components/search/RecipeSearch";
import { RecipePhotoProcessor } from "./RecipePhotoProcessor";
import { RecipeRecommendations } from "./RecipeRecommendations";

export type RecipeDashboardProps = {
  userId?: string;
  view?: "recommendations" | "search" | "ai-generator";
};

export const RecipeDashboard = ({
  userId,
  view = "recommendations",
}: RecipeDashboardProps) => {
  const [currentView, setCurrentView] = useState(view);

  return (
    <Box>
      {/* Dashboard Header */}
      <Box sx={{ mb: 4 }}>
        <Typography level="h2" component="h1" sx={{ mb: 1 }}>
          Recipe Center
        </Typography>
        <Typography level="body-lg" sx={{ color: "text.secondary" }}>
          Discover recipes you can make with your cellar contents
        </Typography>
      </Box>

      {/* Navigation */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2}>
            <Box
              component="button"
              onClick={() => setCurrentView("recommendations")}
              sx={{
                px: 2,
                py: 1,
                borderRadius: "sm",
                border: "1px solid",
                borderColor:
                  currentView === "recommendations"
                    ? "primary.500"
                    : "neutral.300",
                bgcolor:
                  currentView === "recommendations"
                    ? "primary.50"
                    : "transparent",
                color:
                  currentView === "recommendations"
                    ? "primary.700"
                    : "text.primary",
                cursor: "pointer",
                "&:hover": {
                  bgcolor:
                    currentView === "recommendations"
                      ? "primary.100"
                      : "neutral.50",
                },
              }}
            >
              <Typography
                level="body-md"
                fontWeight={currentView === "recommendations" ? "md" : "normal"}
              >
                Recommendations
              </Typography>
            </Box>

            <Box
              component="button"
              onClick={() => setCurrentView("search")}
              sx={{
                px: 2,
                py: 1,
                borderRadius: "sm",
                border: "1px solid",
                borderColor:
                  currentView === "search" ? "primary.500" : "neutral.300",
                bgcolor:
                  currentView === "search" ? "primary.50" : "transparent",
                color:
                  currentView === "search" ? "primary.700" : "text.primary",
                cursor: "pointer",
                "&:hover": {
                  bgcolor:
                    currentView === "search" ? "primary.100" : "neutral.50",
                },
              }}
            >
              <Typography
                level="body-md"
                fontWeight={currentView === "search" ? "md" : "normal"}
              >
                Search & Filter
              </Typography>
            </Box>

            <Box
              component="button"
              onClick={() => setCurrentView("ai-generator")}
              sx={{
                px: 2,
                py: 1,
                borderRadius: "sm",
                border: "1px solid",
                borderColor:
                  currentView === "ai-generator"
                    ? "primary.500"
                    : "neutral.300",
                bgcolor:
                  currentView === "ai-generator" ? "primary.50" : "transparent",
                color:
                  currentView === "ai-generator"
                    ? "primary.700"
                    : "text.primary",
                cursor: "pointer",
                "&:hover": {
                  bgcolor:
                    currentView === "ai-generator"
                      ? "primary.100"
                      : "neutral.50",
                },
              }}
            >
              <Typography
                level="body-md"
                fontWeight={currentView === "ai-generator" ? "md" : "normal"}
              >
                AI Recipe Generator
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Main Content */}
      {currentView === "recommendations" && (
        <Box>
          <Grid container spacing={3}>
            <Grid xs={12}>
              <RecipeRecommendations
                userId={userId}
                limit={12}
                minCompatibilityScore={50}
                title="Recipes You Can Make"
                showCompatibilityBadge={true}
              />
            </Grid>
          </Grid>
        </Box>
      )}

      {currentView === "search" && (
        <RecipeSearch
          userId={userId}
          showCompatibility={true}
          initialFilters={{
            recipeType: "all",
            minCompatibilityScore: 0,
          }}
        />
      )}

      {currentView === "ai-generator" && (
        <Box>
          <Typography level="h3" component="h2" sx={{ mb: 3 }}>
            AI Recipe Generator
          </Typography>
          <Typography level="body-md" sx={{ mb: 3, color: "text.secondary" }}>
            Upload any photo and our AI will intelligently extract all visible
            recipes.
          </Typography>
          <RecipePhotoProcessor
            onRecipesCreated={(recipeIds) => {
              console.log("New recipes created:", recipeIds);
              // Optionally refresh recommendations or navigate to created recipes
            }}
            onProcessingComplete={() => {
              console.log("Recipe processing completed");
            }}
          />
        </Box>
      )}
    </Box>
  );
};

/**
 * Feature showcase component demonstrating all recipe system capabilities
 */
export const RecipeFeatureShowcase = ({ userId }: { userId?: string }) => {
  return (
    <Box>
      <Typography level="h3" component="h2" sx={{ mb: 3 }}>
        Recipe System Features
      </Typography>

      <Grid container spacing={3}>
        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                🎯 Smart Compatibility Analysis
              </Typography>
              <Stack spacing={2}>
                <Typography level="body-md">
                  • Analyzes your cellar contents against recipe ingredients
                </Typography>
                <Typography level="body-md">
                  • Suggests substitutions for missing ingredients
                </Typography>
                <Typography level="body-md">
                  • Scores recipes by how well you can make them
                </Typography>
                <Typography level="body-md">
                  • Supports both specific items and generic ingredients
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                🔍 Advanced Search & Filtering
              </Typography>
              <Stack spacing={2}>
                <Typography level="body-md">
                  • Search by recipe name, description, or ingredients
                </Typography>
                <Typography level="body-md">
                  • Filter by difficulty, prep time, serving size
                </Typography>
                <Typography level="body-md">
                  • Filter by compatibility with your cellar
                </Typography>
                <Typography level="body-md">
                  • "Can Make Now" filter for available recipes
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                🤖 Intelligent Recommendations
              </Typography>
              <Stack spacing={2}>
                <Typography level="body-md">
                  • Personalized recipe suggestions based on your cellar
                </Typography>
                <Typography level="body-md">
                  • Prioritizes recipes you can make completely
                </Typography>
                <Typography level="body-md">
                  • Suggests recipes with high compatibility scores
                </Typography>
                <Typography level="body-md">
                  • Adapts to your ingredient collection over time
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                📋 Shopping List Generation
              </Typography>
              <Stack spacing={2}>
                <Typography level="body-md">
                  • Automatically generates shopping lists for missing
                  ingredients
                </Typography>
                <Typography level="body-md">
                  • Suggests specific products for generic ingredients
                </Typography>
                <Typography level="body-md">
                  • Prioritizes essential vs. optional ingredients
                </Typography>
                <Typography level="body-md">
                  • Estimates quantities needed for recipes
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12}>
          <Card>
            <CardContent>
              <Typography level="title-lg" sx={{ mb: 2 }}>
                🧬 Polymorphic Ingredient System
              </Typography>
              <Grid container spacing={2}>
                <Grid xs={12} md={4}>
                  <Typography level="body-md" fontWeight="md" sx={{ mb: 1 }}>
                    Specific Items
                  </Typography>
                  <Typography level="body-sm">
                    Recipes can reference specific wines, beers, spirits, or
                    coffees in your collection
                  </Typography>
                </Grid>
                <Grid xs={12} md={4}>
                  <Typography level="body-md" fontWeight="md" sx={{ mb: 1 }}>
                    Generic Ingredients
                  </Typography>
                  <Typography level="body-sm">
                    Template ingredients like "Whiskey" that match multiple
                    specific items
                  </Typography>
                </Grid>
                <Grid xs={12} md={4}>
                  <Typography level="body-md" fontWeight="md" sx={{ mb: 1 }}>
                    Smart Matching
                  </Typography>
                  <Typography level="body-sm">
                    AI-powered ingredient matching across categories with
                    confidence scoring
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
