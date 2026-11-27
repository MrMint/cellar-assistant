"use client";

import { useCallback, useEffect, useState } from "react";
import { useClient } from "urql";
import { ChevronRight } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { PRESS_CLASS, pressFeedback } from "@/components/app/overlays/press";
import { unwrapResult } from "@/lib/api/result";
import { createLatestOnly, runLatest } from "@/lib/latest-only";
import { readRecipeGroupVoteSnapshot } from "@/lib/recipes/group-snapshot";
import { cn } from "@/lib/utils";
import {
  applyVoteSnapshot,
  type RecipeVersionData,
  sortVersions,
} from "./adapter";
import { shownVersion } from "./group-pick";
import { RecipeGroupPickQuery } from "./queries";
import { getIngredientDisplay } from "./RecipeIngredientList";
import { RecipeThumb } from "./RecipePlate";
import { RecipeVoteButtons } from "./RecipeVoteButtons";
import { recipeRowLine } from "./recipe-meta";
import { versionLines } from "./version-diff";
import { canVote } from "./vote-plan";

export type { RecipeVersionData };

/** The rewrite's replacement for the deleted subscription: a 15 s poll. */
const POLL_INTERVAL_MS = 15_000;

export type RecipeVersionsTabProps = {
  recipes: RecipeVersionData[];
  canonicalRecipeId?: string | null;
  /** MC-pick: the label, which never moves the canonical. */
  communityPickId?: string | null;
  groupId: string;
  /** Who is looking: authors get no vote buttons on their own version. */
  viewerId?: string | null;
};

const nameOf = (ingredient: RecipeVersionData["ingredients"][number]) =>
  getIngredientDisplay(ingredient).name;

/**
 * Every version of one drink (Recipes-Browse 16–20, desktop 03): a card
 * each, the original first, then by votes. A card is the version's face,
 * name and "By you · Very easy · 3 min" (the whole head links to it), its
 * ingredients with what it changes from the original in ink and bold ("No
 * gin" for a dropped one), then the vote row — or, on your own version,
 * only its score: authors never vote on their own (lead's ruling).
 *
 * Kept from the restore: the 15 s poll and the post-vote re-read, through one
 * `createLatestOnly` gate so an older answer never lands over a newer one.
 */
export const RecipeVersionsTab = ({
  recipes,
  communityPickId: initialPickId = null,
  groupId,
  viewerId = null,
}: RecipeVersionsTabProps) => {
  const client = useClient();
  const [versions, setVersions] = useState(() => sortVersions(recipes));
  const [pickId, setPickId] = useState(initialPickId);
  const [error, setError] = useState<string | null>(null);
  const [gate] = useState(createLatestOnly);

  const refresh = useCallback(async () => {
    await runLatest(
      gate,
      async () => {
        const [votes, pick] = await Promise.all([
          readRecipeGroupVoteSnapshot(client, groupId),
          client.query(RecipeGroupPickQuery, { groupId }).toPromise(),
        ]);
        return { votes, pick };
      },
      ({ votes, pick }) => {
        if (!votes.ok) {
          setError(votes.error.message);
          return;
        }
        setVersions((current) =>
          sortVersions(applyVoteSnapshot(current, votes.data.votes)),
        );
        const group = unwrapResult(pick.data?.recipeGroup, "RecipeGroup");
        if (group.ok) setPickId(group.data.communityPickId ?? null);
      },
    );
  }, [client, gate, groupId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The original: the oldest version (what the group shows with no pick).
  const originalId =
    shownVersion(
      null,
      versions.map((v) => ({ id: v.id, createdAt: v.created_at })),
    )?.id ?? null;
  const original = versions.find((v) => v.id === originalId) ?? null;
  const ordered =
    original === null
      ? versions
      : [original, ...versions.filter((v) => v.id !== originalId)];

  return (
    <div className="flex flex-col gap-4">
      {error !== null && (
        <p role="alert" className="t-cap m-0 text-danger">
          {error}
        </p>
      )}
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
        {ordered.map((recipe) => {
          const mine =
            viewerId !== null && recipe.created_by_user?.id === viewerId;
          const by = mine
            ? "By you"
            : recipe.created_by_user?.displayName
              ? `By ${recipe.created_by_user.displayName}`
              : null;
          const lines = versionLines(
            recipe.ingredients,
            recipe.id === originalId || original === null
              ? null
              : original.ingredients,
            nameOf,
          );
          const noVotes = recipe.upvotes === 0 && recipe.downvotes === 0;
          return (
            <li
              key={recipe.id}
              data-slot="recipe-version"
              data-pick={recipe.id === pickId || undefined}
              className="flex flex-col gap-4 rounded-lg border border-edge bg-card p-4"
            >
              <div
                {...pressFeedback()}
                className={cn("relative flex items-center gap-3", PRESS_CLASS)}
              >
                <span className="relative block size-11 shrink-0 overflow-hidden rounded-md bg-raised">
                  {recipe.image_url ? (
                    // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
                    <img
                      src={recipe.image_url}
                      alt=""
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <RecipeThumb type={recipe.type} name={recipe.name} />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <h2 className="t-head m-0 truncate text-ink">
                    <Link
                      href={`/recipes/${recipe.id}`}
                      overlay
                      underline="none"
                    >
                      {recipe.name}
                    </Link>
                  </h2>
                  <p className="t-cap m-0 truncate text-ink-2">
                    {recipeRowLine(
                      by,
                      recipe.difficulty_level,
                      recipe.prep_time_minutes,
                    )}
                  </p>
                  {recipe.id === pickId && (
                    <p className="t-cap m-0 text-act-ink">Community pick</p>
                  )}
                </div>
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-ink-3"
                />
              </div>

              <ul
                aria-label={`${recipe.name} ingredients`}
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {lines.map((line) => (
                  <li
                    key={line.key}
                    data-changed={line.changed || undefined}
                    className={cn(
                      "t-body flex gap-3",
                      line.changed ? "font-semibold text-ink" : "text-ink-2",
                    )}
                  >
                    <span className="tabular w-20 shrink-0">{line.amount}</span>
                    <span className="min-w-0">{line.name}</span>
                  </li>
                ))}
              </ul>

              {canVote(viewerId, recipe.created_by_user?.id) ? (
                <RecipeVoteButtons
                  recipeId={recipe.id}
                  recipeGroupId={groupId}
                  recipeName={recipe.name}
                  currentVote={recipe.userVote}
                  upvotes={recipe.upvotes}
                  downvotes={recipe.downvotes}
                  onVoted={() => {
                    setError(null);
                    void refresh();
                  }}
                  onError={setError}
                />
              ) : (
                <p className="t-cap m-0 text-ink-2">
                  {noVotes
                    ? "No votes yet"
                    : `${recipe.upvotes} up · ${recipe.downvotes} down`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
