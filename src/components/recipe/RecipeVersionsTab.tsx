"use client";

import {
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@mui/joy";
import { isNotNil } from "ramda";
import { useState } from "react";
import { MdAccessTime, MdGroup, MdPerson } from "react-icons/md";
import { CanonicalRecipeBadge } from "./CanonicalRecipeBadge";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { RecipeVoteButtons } from "./RecipeVoteButtons";

export type RecipeVersionData = {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  difficulty_level?: number | null;
  prep_time_minutes?: number | null;
  serving_size?: number | null;
  image_url?: string | null;
  version?: number | null;
  created_at: string;
  created_by?: string | null;
  created_by_user?: {
    id: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  ingredients: Array<{
    id: string;
    quantity?: number | null;
    unit?: string | null;
    is_optional?: boolean | null;
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
      style: string;
    } | null;
    beer?: {
      id: string;
      name: string;
      style: string;
    } | null;
    spirit?: {
      id: string;
      name: string;
      type: string;
    } | null;
    coffee?: {
      id: string;
      name: string;
      roast_level?: string | null;
    } | null;
    generic_item?: {
      id: string;
      name: string;
      category?: string | null;
      subcategory?: string | null;
      item_type?: string | null;
    } | null;
  }>;
  instructions: Array<{
    id: string;
    step_number: number;
    instruction_text: string;
    instruction_type?: string | null;
    equipment_needed?: string | null;
    time_minutes?: number | null;
  }>;
  votes_aggregate: {
    aggregate: {
      count: number;
    };
  };
  votes: Array<{
    id: string;
    vote_type: string;
  }>;
};

export type RecipeVersionsTabProps = {
  recipes: RecipeVersionData[];
  canonicalRecipeId?: string | null;
  groupId: string;
};

export const RecipeVersionsTab = ({
  recipes,
  canonicalRecipeId,
  groupId,
}: RecipeVersionsTabProps) => {
  const [selectedVersion, setSelectedVersion] = useState(0);

  // Calculate vote scores for each recipe
  const recipesWithScores = recipes.map((recipe) => {
    // Note: The GraphQL query returns multiple votes_aggregate fields
    // We need to extract upvotes and downvotes from the query result
    const upvotes = recipe.votes_aggregate?.aggregate?.count || 0; // This will be upvotes from the specific query
    const totalVotes = recipe.votes_aggregate?.aggregate?.count || 0;
    const downvotes = totalVotes - upvotes; // Calculate downvotes
    const netScore = upvotes - downvotes;
    const userVote = recipe.votes?.[0]?.vote_type || null;

    return {
      ...recipe,
      upvotes,
      downvotes,
      netScore,
      userVote,
      isCanonical: recipe.id === canonicalRecipeId,
    };
  });

  // Sort recipes by net score (highest first) with creation date tiebreaker
  const sortedRecipes = [...recipesWithScores].sort((a, b) => {
    if (a.netScore !== b.netScore) {
      return b.netScore - a.netScore;
    }
    // Tiebreaker: older recipes win
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const _selectedRecipe = sortedRecipes[selectedVersion];

  // Format difficulty display
  const getDifficultyDisplay = (level?: number | null) => {
    if (!level) return "Not specified";
    const labels = ["", "Very Easy", "Easy", "Medium", "Hard", "Very Hard"];
    return labels[level] || "Unknown";
  };

  // Format creation date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Box>
      <Tabs
        value={selectedVersion}
        onChange={(_, value) => setSelectedVersion(value as number)}
      >
        {/* Tab List - Recipe Versions */}
        <TabList variant="outlined" sx={{ mb: 3 }}>
          {sortedRecipes.map((recipe, index) => (
            <Tab key={recipe.id} value={index}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box>
                  <Typography level="title-sm">
                    {recipe.name}
                    {recipe.version && ` v${recipe.version}`}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography
                      level="body-xs"
                      sx={{ color: "text.secondary" }}
                    >
                      Score:{" "}
                      {recipe.netScore > 0
                        ? `+${recipe.netScore}`
                        : recipe.netScore}
                    </Typography>
                    {recipe.isCanonical && <CanonicalRecipeBadge size="sm" />}
                  </Stack>
                </Box>
              </Stack>
            </Tab>
          ))}
        </TabList>

        {/* Tab Panels - Recipe Details */}
        {sortedRecipes.map((recipe, index) => (
          <TabPanel key={recipe.id} value={index} sx={{ px: 0 }}>
            <Grid container spacing={3}>
              {/* Recipe Image and Voting */}
              <Grid xs={12} md={4}>
                <Stack spacing={2}>
                  {/* Recipe Image */}
                  <Card sx={{ aspectRatio: "1" }}>
                    <CardContent sx={{ p: 0 }}>
                      {isNotNil(recipe.image_url) ? (
                        <img
                          src={recipe.image_url}
                          alt={recipe.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: "neutral.100",
                            color: "neutral.400",
                          }}
                        >
                          <Typography level="body-lg">No Image</Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>

                  {/* Voting Section */}
                  <Card>
                    <CardContent>
                      <Stack spacing={2}>
                        {recipe.isCanonical && (
                          <CanonicalRecipeBadge size="lg" />
                        )}

                        <Typography level="title-sm" textAlign="center">
                          Community Vote
                        </Typography>

                        <RecipeVoteButtons
                          recipeId={recipe.id}
                          currentVote={recipe.userVote}
                          upvotes={recipe.upvotes}
                          downvotes={recipe.downvotes}
                        />

                        <Typography
                          level="body-xs"
                          textAlign="center"
                          sx={{ color: "text.secondary" }}
                        >
                          Net Score:{" "}
                          {recipe.netScore > 0
                            ? `+${recipe.netScore}`
                            : recipe.netScore}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>

                  {/* Recipe Metadata */}
                  <Card>
                    <CardContent>
                      <Stack spacing={1}>
                        <Typography level="title-sm">Recipe Info</Typography>

                        {recipe.difficulty_level && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography
                              level="body-sm"
                              sx={{ fontWeight: "bold" }}
                            >
                              Difficulty:
                            </Typography>
                            <Typography level="body-sm">
                              {getDifficultyDisplay(recipe.difficulty_level)}
                            </Typography>
                          </Box>
                        )}

                        {recipe.prep_time_minutes && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <MdAccessTime size={16} />
                            <Typography level="body-sm">
                              {recipe.prep_time_minutes} minutes
                            </Typography>
                          </Box>
                        )}

                        {recipe.serving_size && (
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <MdGroup size={16} />
                            <Typography level="body-sm">
                              Serves {recipe.serving_size}
                            </Typography>
                          </Box>
                        )}

                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <MdPerson size={16} />
                          <Typography level="body-sm">
                            By{" "}
                            {recipe.created_by_user?.displayName || "Unknown"}
                          </Typography>
                        </Box>

                        <Typography
                          level="body-xs"
                          sx={{ color: "text.secondary" }}
                        >
                          Created {formatDate(recipe.created_at)}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              </Grid>

              {/* Recipe Content */}
              <Grid xs={12} md={8}>
                <Stack spacing={3}>
                  {/* Recipe Description */}
                  {recipe.description && (
                    <Card>
                      <CardContent>
                        <Typography level="title-sm" sx={{ mb: 1 }}>
                          Description
                        </Typography>
                        <Typography level="body-md">
                          {recipe.description}
                        </Typography>
                      </CardContent>
                    </Card>
                  )}

                  {/* Ingredients */}
                  <Card>
                    <CardContent>
                      <Typography level="title-sm" sx={{ mb: 2 }}>
                        Ingredients
                      </Typography>
                      <RecipeIngredientList
                        ingredients={recipe.ingredients}
                        showAvailability={false}
                      />
                    </CardContent>
                  </Card>

                  {/* Instructions */}
                  <Card>
                    <CardContent>
                      <Typography level="title-sm" sx={{ mb: 2 }}>
                        Instructions
                      </Typography>
                      <Stack spacing={2}>
                        {recipe.instructions.map((instruction) => (
                          <Box key={instruction.id}>
                            <Typography level="title-sm" sx={{ mb: 0.5 }}>
                              Step {instruction.step_number}
                              {instruction.time_minutes && (
                                <Typography
                                  level="body-xs"
                                  sx={{ ml: 1, color: "text.secondary" }}
                                >
                                  ({instruction.time_minutes}min)
                                </Typography>
                              )}
                            </Typography>
                            <Typography level="body-md">
                              {instruction.instruction_text}
                            </Typography>
                            {instruction.equipment_needed && (
                              <Typography
                                level="body-xs"
                                sx={{ color: "text.secondary", mt: 0.5 }}
                              >
                                Equipment: {instruction.equipment_needed}
                              </Typography>
                            )}
                          </Box>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              </Grid>
            </Grid>
          </TabPanel>
        ))}
      </Tabs>
    </Box>
  );
};
