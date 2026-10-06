"use client";

import {
  Alert,
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
import { useCallback, useEffect, useState } from "react";
import { MdAccessTime, MdGroup, MdPerson } from "react-icons/md";
import { useClient } from "urql";
import { createLatestOnly, runLatest } from "@/lib/latest-only";
import { readRecipeGroupVoteSnapshot } from "@/lib/recipes/group-snapshot";
import { Timestamp } from "../common/Timestamp";
import {
  applyVoteSnapshot,
  formatNetScore,
  type RecipeVersionData,
  sortVersions,
} from "./adapter";
import { CanonicalRecipeBadge } from "./CanonicalRecipeBadge";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { RecipeVoteButtons } from "./RecipeVoteButtons";

export type { RecipeVersionData };

/** The rewrite's replacement for the deleted subscription: a 15 s poll. */
const POLL_INTERVAL_MS = 15_000;

export type RecipeVersionsTabProps = {
  recipes: RecipeVersionData[];
  canonicalRecipeId?: string | null;
  groupId: string;
};

// Format difficulty display
const getDifficultyDisplay = (level?: number | null) => {
  if (!level) return "Not specified";
  const labels = ["", "Very Easy", "Easy", "Medium", "Hard", "Very Hard"];
  return labels[level] || "Unknown";
};

/**
 * `82450ad1:src/components/recipe/RecipeVersionsTab.tsx`, restored — one Joy
 * tab per version, best-scoring first, each with its picture, the vote card,
 * "Recipe Info", description, ingredients and steps. In production the page
 * threw before rendering it (`recipe_votes` had no Hasura permission).
 *
 * Data:
 *
 * - Scores are G27's `upvotes`/`downvotes`/`netScore`/`myVote`, not the old
 *   three unaliased `votes_aggregate` blocks (whose "downvotes" were always 0).
 * - Kept from the rewrite: the 15 s poll and the post-vote re-read, through one
 *   `createLatestOnly` gate so an older answer never lands over a newer one
 *   (`lib/recipes/group-snapshot.ts`). The selected tab follows its recipe,
 *   not its index, when a vote re-orders the tabs.
 * - "By …" is `Recipe.createdBy` (G4); "Created …" is `common/Timestamp`
 *   rather than `toLocaleDateString()` (the hydration rule).
 * - A version with no picture keeps the old "No Image" box.
 */
export const RecipeVersionsTab = ({
  recipes,
  canonicalRecipeId: initialCanonicalRecipeId = null,
  groupId,
}: RecipeVersionsTabProps) => {
  const client = useClient();
  const [versions, setVersions] = useState(() => sortVersions(recipes));
  const [canonicalRecipeId, setCanonicalRecipeId] = useState(
    initialCanonicalRecipeId,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    versions[0]?.id ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [canonicalMoved, setCanonicalMoved] = useState(false);
  /** Newest-answer-wins for the poll and the post-vote re-read. */
  const [gate] = useState(createLatestOnly);

  const refresh = useCallback(async () => {
    await runLatest(
      gate,
      () => readRecipeGroupVoteSnapshot(client, groupId),
      (result) => {
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setVersions((current) =>
          sortVersions(applyVoteSnapshot(current, result.data.votes)),
        );
        setCanonicalRecipeId(result.data.canonicalRecipeId);
      },
    );
  }, [client, gate, groupId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const recipesWithScores = versions.map((recipe) => ({
    ...recipe,
    isCanonical: recipe.id === canonicalRecipeId,
  }));
  const selectedVersion = Math.max(
    0,
    recipesWithScores.findIndex((recipe) => recipe.id === selectedId),
  );

  return (
    <Box>
      {error !== null && (
        <Alert color="danger" variant="soft" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {canonicalMoved && (
        <Typography level="body-sm" sx={{ color: "success.plainColor", mb: 2 }}>
          That changed which version the community prefers.
        </Typography>
      )}
      <Tabs
        value={selectedVersion}
        onChange={(_, value) =>
          setSelectedId(recipesWithScores[value as number]?.id ?? null)
        }
      >
        {/* Tab List - Recipe Versions */}
        <TabList variant="outlined" sx={{ mb: 3 }}>
          {recipesWithScores.map((recipe, index) => (
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
                      Score: {formatNetScore(recipe.netScore)}
                    </Typography>
                    {recipe.isCanonical && <CanonicalRecipeBadge size="sm" />}
                  </Stack>
                </Box>
              </Stack>
            </Tab>
          ))}
        </TabList>

        {/* Tab Panels - Recipe Details */}
        {recipesWithScores.map((recipe, index) => (
          <TabPanel key={recipe.id} value={index} sx={{ px: 0 }}>
            <Grid container spacing={3}>
              {/* Recipe Image and Voting */}
              <Grid xs={12} md={4}>
                <Stack spacing={2}>
                  {/* Recipe Image */}
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
                          recipeGroupId={groupId}
                          recipeName={recipe.name}
                          currentVote={recipe.userVote}
                          upvotes={recipe.upvotes}
                          downvotes={recipe.downvotes}
                          onVoted={({ canonicalChanged }) => {
                            setError(null);
                            setCanonicalMoved(canonicalChanged);
                            void refresh();
                          }}
                          onError={setError}
                        />

                        <Typography
                          level="body-xs"
                          textAlign="center"
                          sx={{ color: "text.secondary" }}
                        >
                          Net Score: {formatNetScore(recipe.netScore)}
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

                        {recipe.created_at !== null && (
                          <Typography
                            level="body-xs"
                            sx={{ color: "text.secondary" }}
                          >
                            Created{" "}
                            <Timestamp
                              iso={recipe.created_at}
                              precision="date"
                            />
                          </Typography>
                        )}
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
                      <RecipeIngredientList ingredients={recipe.ingredients} />
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
