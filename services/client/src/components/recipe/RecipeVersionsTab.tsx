"use client";

import { isNotNil } from "ramda";
import { useCallback, useEffect, useState } from "react";
import { useClient } from "urql";
import { People, Person, Time } from "@/components/app/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * `82450ad1:src/components/recipe/RecipeVersionsTab.tsx`, restored — one
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
  const selected =
    recipesWithScores.find((recipe) => recipe.id === selectedId) ??
    recipesWithScores[0];

  return (
    <div>
      {error !== null && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canonicalMoved && (
        <p className="mb-4 type-callout text-success">
          That changed which version the community prefers.
        </p>
      )}
      <Tabs
        value={selected?.id ?? ""}
        onValueChange={(value) => setSelectedId(value)}
        className="gap-6"
      >
        {/* Tab List - Recipe Versions */}
        <TabsList className="w-full justify-start overflow-x-auto rounded-md p-1 group-data-[orientation=horizontal]/tabs:h-auto">
          {recipesWithScores.map((recipe) => (
            <TabsTrigger
              key={recipe.id}
              value={recipe.id}
              className="h-auto min-h-11 flex-none justify-start px-3 py-2 text-left"
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="type-callout font-semibold">
                  {recipe.name}
                  {recipe.version && ` v${recipe.version}`}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular type-footnote text-ink-2">
                    Score: {formatNetScore(recipe.netScore)}
                  </span>
                  {recipe.isCanonical && <CanonicalRecipeBadge size="sm" />}
                </span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab Panels - Recipe Details */}
        {recipesWithScores.map((recipe) => (
          <TabsContent key={recipe.id} value={recipe.id}>
            <div className="grid gap-6 md:grid-cols-3">
              {/* Recipe Image and Voting */}
              <div className="flex flex-col gap-4">
                {/* Recipe Image */}
                <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-1">
                  {isNotNil(recipe.image_url) ? (
                    // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
                    <img
                      src={recipe.image_url}
                      alt={recipe.name}
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-surface-2 text-ink-3">
                      <p className="type-body">No Image</p>
                    </div>
                  )}
                </div>

                {/* Voting Section */}
                <section className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
                  {recipe.isCanonical && <CanonicalRecipeBadge size="lg" />}

                  <p className="text-center type-callout font-semibold">
                    Community Vote
                  </p>

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

                  <p className="tabular text-center type-footnote text-ink-2">
                    Net Score: {formatNetScore(recipe.netScore)}
                  </p>
                </section>

                {/* Recipe Metadata */}
                <section className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
                  <p className="type-callout font-semibold">Recipe Info</p>

                  {recipe.difficulty_level && (
                    <div className="flex items-center gap-2 type-callout">
                      <span className="font-bold">Difficulty:</span>
                      <span>
                        {getDifficultyDisplay(recipe.difficulty_level)}
                      </span>
                    </div>
                  )}

                  {recipe.prep_time_minutes && (
                    <div className="flex items-center gap-2 type-callout">
                      <Time aria-hidden className="size-4" />
                      <span>{recipe.prep_time_minutes} minutes</span>
                    </div>
                  )}

                  {recipe.serving_size && (
                    <div className="flex items-center gap-2 type-callout">
                      <People aria-hidden className="size-4" />
                      <span>Serves {recipe.serving_size}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 type-callout">
                    <Person aria-hidden className="size-4" />
                    <span>
                      By {recipe.created_by_user?.displayName || "Unknown"}
                    </span>
                  </div>

                  {recipe.created_at !== null && (
                    <p className="type-footnote text-ink-2">
                      Created{" "}
                      <Timestamp iso={recipe.created_at} precision="date" />
                    </p>
                  )}
                </section>
              </div>

              {/* Recipe Content */}
              <div className="flex flex-col gap-6 md:col-span-2">
                {/* Recipe Description */}
                {recipe.description && (
                  <section className="rounded-lg bg-surface-1 p-4">
                    <p className="mb-2 type-callout font-semibold">
                      Description
                    </p>
                    <p className="type-body">{recipe.description}</p>
                  </section>
                )}

                {/* Ingredients */}
                <section className="rounded-lg bg-surface-1 p-4">
                  <p className="mb-4 type-callout font-semibold">Ingredients</p>
                  <RecipeIngredientList ingredients={recipe.ingredients} />
                </section>

                {/* Instructions */}
                <section className="rounded-lg bg-surface-1 p-4">
                  <p className="mb-4 type-callout font-semibold">
                    Instructions
                  </p>
                  <div className="flex flex-col gap-4">
                    {recipe.instructions.map((instruction) => (
                      <div key={instruction.id}>
                        <p className="mb-1 type-callout font-semibold">
                          Step {instruction.step_number}
                          {instruction.time_minutes && (
                            <span className="ml-2 font-normal type-footnote text-ink-2">
                              ({instruction.time_minutes}min)
                            </span>
                          )}
                        </p>
                        <p className="type-body">
                          {instruction.instruction_text}
                        </p>
                        {instruction.equipment_needed && (
                          <p className="mt-1 type-footnote text-ink-2">
                            Equipment: {instruction.equipment_needed}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
