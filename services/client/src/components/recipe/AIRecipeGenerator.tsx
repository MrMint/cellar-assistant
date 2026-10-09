"use client";

import { useMemo, useState } from "react";
import { useQuery } from "urql";
import {
  AI,
  AutoFill,
  Camera,
  ICON_STROKE,
  Trending,
  Visible,
} from "@/components/app/icons";
import { ApiError } from "@/components/cellar-api/ApiError";
import { AiStatus } from "@/components/common/AiStatus";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { aiOutcome } from "@/lib/ai/outcome";
import { readFragment } from "@/lib/api/graphql";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
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
    icon: AI,
    title: "Smart Vision Analysis",
    text: "Advanced OCR and computer vision to extract recipes from photos",
  },
  {
    icon: AutoFill,
    title: "Ingredient Classification",
    text: "Automatically categorizes ingredients and links them to items in the catalog",
  },
  {
    icon: Visible,
    title: "Recipe Groups",
    text: "Files the recipe beside other versions of the same drink or dish",
  },
] as const;

const STEPS = [
  {
    icon: Camera,
    title: "1. Upload Photo",
    text: "Take or upload a photo of any menu, recipe card, or cookbook page",
  },
  {
    icon: AI,
    title: "2. AI Analysis",
    text: "Advanced AI extracts recipes, ingredients, and cooking instructions",
  },
  {
    icon: AutoFill,
    title: "3. Smart Matching",
    text: "Ingredients are automatically matched to items in the catalog",
  },
  {
    icon: Trending,
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
  return (
    <AIRecipeGeneratorView
      recipePhotoOffered={isOffered(useAiCapabilities(), "recipePhoto")}
    />
  );
}

/**
 * The page for a known capability. Where reading recipe photos is not
 * offered, the page is the notice alone: the pitch, the feature list, the
 * tips and "How It Works" all describe the photo flow, and around the notice
 * they contradicted it.
 */
export function AIRecipeGeneratorView({
  recipePhotoOffered,
}: {
  recipePhotoOffered: boolean;
}) {
  const [createdRecipeIds, setCreatedRecipeIds] = useState<string[]>([]);

  const handleRecipesCreated = (recipeIds: string[]) => {
    setCreatedRecipeIds((prev) => [
      ...prev,
      ...recipeIds.filter((id) => !prev.includes(id)),
    ]);
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] py-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="mb-4 type-large-title">AI Recipe Generator</h1>
        {recipePhotoOffered && (
          <p className="mx-auto max-w-[600px] type-body text-ink-2">
            Transform any menu photo, recipe card, or cookbook page into a
            detailed, executable recipe, with its ingredients matched to items
            in the catalog.
          </p>
        )}
      </div>

      {/* Main Generator */}
      <div
        className={cn(
          "grid grid-cols-1 gap-8",
          recipePhotoOffered && "lg:grid-cols-3",
        )}
      >
        <div className={cn(recipePhotoOffered && "lg:col-span-2")}>
          {recipePhotoOffered ? (
            <RecipePhotoProcessor onRecipesCreated={handleRecipesCreated} />
          ) : (
            // N07/D25: say so up front rather than offer a photo the server
            // will refuse.
            <AiStatus
              outcome={{
                ...aiOutcome({ code: "CONFLICT", reason: "AI_UNCONFIGURED" }),
                title: "Reading recipe photos isn't available here",
                message:
                  "You can still browse and search the recipes already here.",
              }}
            />
          )}
        </div>

        {recipePhotoOffered && (
          <div className="flex flex-col gap-6">
            {/* Features */}
            <section className="rounded-lg bg-surface-1 p-4">
              <h2 className="mb-4 type-title-2">AI Features</h2>
              <div className="flex flex-col gap-4">
                {FEATURES.map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-4">
                    <Icon
                      aria-hidden
                      strokeWidth={ICON_STROKE}
                      className="mt-1 size-4 shrink-0 text-ink-2"
                    />
                    <div>
                      <p className="type-callout font-semibold">{title}</p>
                      <p className="type-footnote">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Tips */}
            <section className="rounded-lg bg-surface-1 p-4">
              <h2 className="mb-4 type-title-2">Best Results Tips</h2>
              <div className="flex flex-col gap-3">
                <p className="type-callout">
                  📱 <strong>Clear photos:</strong> Ensure text is readable and
                  well-lit
                </p>
                <p className="type-callout">
                  🍸 <strong>One recipe per photo:</strong> Each photo becomes
                  one recipe
                </p>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* How It Works */}
      {recipePhotoOffered && (
        <div className="mt-16">
          <h2 className="mb-8 text-center type-title-1">How It Works</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }) => (
              <section
                key={title}
                className="flex h-full flex-col items-center rounded-lg bg-surface-1 p-4 text-center"
              >
                <Icon
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="mb-4 size-10 text-ink-2"
                />
                <h3 className="mb-2 type-title-2">{title}</h3>
                <p className="type-callout text-ink-2">{text}</p>
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Generated Recipes Display */}
      {createdRecipeIds.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-8 text-center type-title-1">
            Your Generated Recipes
          </h2>
          <div className="flex flex-col gap-12">
            {createdRecipeIds.map((recipeId) => (
              <GeneratedRecipe key={recipeId} recipeId={recipeId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
