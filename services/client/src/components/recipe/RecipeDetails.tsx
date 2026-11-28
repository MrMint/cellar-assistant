"use client";

import { useRouter } from "next/navigation";
import { isNotNil } from "ramda";
import { type ReactNode, useCallback, useState } from "react";
import { useMutation } from "urql";
import { AIDraftField } from "@/components/app/AIDraftField";
import { AppBar } from "@/components/app/AppBar";
import { ConfirmSheet } from "@/components/app/ConfirmSheet";
import {
  ChevronRight,
  Lock,
  People,
  Public,
  Share,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { notify } from "@/components/app/notify";
import { afterHistorySettles } from "@/components/app/overlays/layers";
import { TumblerGlyph } from "@/components/app/parts/glyphs";
import { useNavigate } from "@/components/app/useNavigate";
import { ApiError } from "@/components/cellar-api/ApiError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WantToTryButton } from "@/components/want-to-try/WantToTryButton";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import { AddRecipeReview } from "./AddRecipeReview";
import type { RecipeDetailsItem } from "./adapter";
import { DeleteRecipeMutation } from "./editor/documents";
import { PRIVACY_WHO } from "./editor/recipe-draft";
import { RecipeIngredientList } from "./RecipeIngredientList";
import { RecipeLoveButton } from "./RecipeLoveButton";
import {
  MakeabilityCard,
  missingCount,
  QUIET_ACTION,
  RecipeHeroPhoto,
  RecipeTitle,
} from "./RecipePageParts";
import { RecipePlate, RecipeThumb } from "./RecipePlate";
import { RecipeReviews } from "./RecipeReviews";
import { RecipeShareSheet, useRecipeShareItem } from "./RecipeShare";
import { minutesLabel, recipeMetaLine } from "./recipe-meta";

export type {
  RecipeDetailsItem,
  RecipeIngredient,
  RecipeInstruction,
} from "./adapter";

const PRIVACY_ICON = {
  PRIVATE: Lock,
  FRIENDS: People,
  PUBLIC: Public,
} as const;

export type RecipeDetailsProps = {
  recipe: RecipeDetailsItem;
  /** The signed-in viewer: picks their own review out for editing. */
  viewerId?: string | null;
  /** Kept for callers; the group page draws its own pick card (`aside`). */
  isCanonical?: boolean;
  /** The reviews connection's paging, beyond the first page in `recipe`. */
  reviewsEndCursor?: string | null;
  reviewsHasNextPage?: boolean;
  /**
   * After a review write. Defaults to `router.refresh()`, which re-runs the
   * server page that rendered this. A client-rendered caller refetches.
   */
  onChanged?: () => void;
  /** The recipe name's heading level (X21). */
  titleLevel?: "h1" | "h2";
  /** A line above the name: the group page's "Negroni · 3 versions". */
  eyebrow?: ReactNode;
  /** A card under the description: the group page's pick card. */
  aside?: ReactNode;
  /** Where Back goes on a cold open. */
  parent?: string;
};

/**
 * The recipe page (Recipes-Page 01 to 16, desktop 01 to 09): the hero (the
 * photo or the kit's recipe face) with Back and More on glass discs, the
 * name with Want to try and Love, one meta line, the description, who can
 * see it, Make it (the one primary, lead's ruling 1, "· 3 missing" when the
 * bar is short), the makeability card, Ingredients, Method and Reviews.
 *
 * More holds Share (the share sheet with its QR code, L34), Edit recipe or
 * Review draft, and Delete or Discard, which asks first with the trash
 * glyph on the outlined danger button (KIT § 4 "Toast or confirm").
 *
 * From `md` up: the page's own bar with crumbs and Share, the plate sticky
 * in its column and the content beside it.
 */
export const RecipeDetails = ({
  recipe,
  viewerId = null,
  reviewsEndCursor = null,
  reviewsHasNextPage = false,
  onChanged,
  titleLevel = "h2",
  eyebrow,
  aside,
  parent = "/recipes",
}: RecipeDetailsProps) => {
  const router = useRouter();
  const navigate = useNavigate();
  const desktop = useMediaQuery(breakpointUp("md"));
  const reviews = recipe.recipe_reviews ?? [];
  const isOwner =
    viewerId !== null &&
    recipe.created_by_id !== undefined &&
    recipe.created_by_id === viewerId;
  const isDraft = recipe.is_draft === true;
  const privacy =
    recipe.privacy === "FRIENDS" || recipe.privacy === "PUBLIC"
      ? recipe.privacy
      : recipe.privacy === "PRIVATE"
        ? "PRIVATE"
        : null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<ApiFailure | null>(null);
  const [sharing, setSharing] = useState(false);
  const [, deleteRecipe] = useMutation(DeleteRecipeMutation);
  const mine =
    viewerId === null
      ? null
      : (reviews.find((review) => review.userId === viewerId) ?? null);
  const openShare = useCallback(() => setSharing(true), []);
  const shareItem = useRecipeShareItem({
    privacy: recipe.privacy,
    isDraft,
    isOwner,
    onOpen: openShare,
  });
  const remove = async () => {
    setDeleting(true);
    setDeleteFailure(null);
    const result = unwrapResult(
      (await deleteRecipe({ recipeId: recipe.id })).data?.deleteRecipe,
      "DeletedRecipe",
    );
    setDeleting(false);
    if (!result.ok) {
      setDeleteFailure(result.error);
      return;
    }
    // Close first, then leave once the sheet's Back has landed: a replace in
    // the same tick is undone by that Back, and the page stays (F-45).
    setConfirmingDelete(false);
    notify(isDraft ? "Draft discarded" : `Deleted ${recipe.name}`);
    afterHistorySettles(() => {
      navigate.replace("/recipes", { kind: "back" });
      router.refresh();
    });
  };
  const changed = () => {
    if (onChanged === undefined) router.refresh();
    else onChanged();
  };

  const ownerItems = isOwner
    ? [
        {
          label: isDraft ? "Review draft" : "Edit recipe",
          onSelect: () =>
            navigate.push(`/recipes/${recipe.id}/edit`, { kind: "forward" }),
        },
        {
          label: isDraft ? "Discard draft" : "Delete recipe",
          onSelect: () => setConfirmingDelete(true),
          destructive: true,
        },
      ]
    : [];
  const missing = missingCount(recipe.makeability);
  // The group's other versions: its canonical, then its siblings.
  const otherVersions = [
    ...(isNotNil(recipe.canonical_recipe)
      ? [
          {
            id: recipe.canonical_recipe.id,
            name: recipe.canonical_recipe.name,
            label: null as string | null,
          },
        ]
      : []),
    ...(recipe.recipe_variations ?? []).map((variation) => ({
      id: variation.id,
      name: variation.name,
      label: isNotNil(variation.version) ? `v${variation.version}` : null,
    })),
  ];
  const canMake = !isDraft && recipe.instructions.length > 0;

  const photo = isNotNil(recipe.image_url) ? (
    // biome-ignore lint/performance/noImgElement: a free-form URL; next/image would need its host allowlisted.
    <img
      src={recipe.image_url}
      alt={recipe.name}
      className="absolute inset-0 size-full object-cover"
    />
  ) : (
    <RecipePlate name={recipe.name} type={recipe.type} labelled />
  );

  return (
    <div data-slot="recipe-page" className="flex flex-col gap-4">
      {desktop ? (
        <AppBar
          parent={parent}
          breadcrumbs={[
            { label: "Recipes", href: "/recipes" },
            { label: recipe.name },
          ]}
          actions={[
            { label: "Share", icon: Share, onSelect: shareItem.onSelect },
          ]}
          overflow={ownerItems}
        />
      ) : null}
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,360px)_minmax(0,1fr)] md:items-start md:gap-8">
        <div className="relative md:sticky md:top-4">
          <RecipeHeroPhoto>{photo}</RecipeHeroPhoto>
          {!desktop && (
            // No title: the name's heading sits under the hero, and the
            // bar's would be a second h1 (F-106, CR-13).
            <AppBar
              tone="photo"
              parent={parent}
              overflow={[shareItem, ...ownerItems]}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <RecipeTitle
            eyebrow={eyebrow}
            title={recipe.name}
            titleLevel={titleLevel}
            meta={recipeMetaLine({
              type: recipe.type,
              difficulty: recipe.difficulty_level,
              minutes: recipe.prep_time_minutes,
              serves: recipe.serving_size,
            })}
            actions={
              isDraft ? undefined : (
                <>
                  {recipe.is_want_to_try !== undefined && (
                    <WantToTryButton
                      target={{ kind: "RECIPE", recipeId: recipe.id }}
                      saved={recipe.is_want_to_try}
                      variant="button"
                      className="rounded-full aria-pressed:border-ink aria-pressed:bg-raised"
                    />
                  )}
                  {recipe.is_loved !== undefined && (
                    <RecipeLoveButton
                      recipeId={recipe.id}
                      loved={recipe.is_loved}
                      name={recipe.name}
                    />
                  )}
                </>
              )
            }
          />

          {isNotNil(recipe.description) && recipe.description !== "" && (
            <p className="t-body m-0 text-ink-2">{recipe.description}</p>
          )}

          {/* X15 / D22: what the AI read is the author's alone until saved. */}
          {isOwner && isDraft && (
            <AIDraftField source="suggested" drafted>
              <div className="flex flex-col gap-3 pr-24">
                <p className="t-cap m-0 text-ink-2">
                  Read by AI. Only you see it until you save it.
                </p>
                <Button asChild className="self-start">
                  <Link href={`/recipes/${recipe.id}/edit`} underline="none">
                    Review draft
                  </Link>
                </Button>
              </div>
            </AIDraftField>
          )}
          {isOwner && !isDraft && privacy !== null && (
            <PrivacyLine privacy={privacy} recipeId={recipe.id} />
          )}

          {aside}

          {/* ux-c L08: the recipe, full screen, step by step. The one
              primary, even when the bar is short (lead's ruling 1). */}
          {canMake && (
            <Button asChild size="lg" className="w-full">
              <Link
                href={`/recipes/${recipe.id}/make`}
                underline="none"
                data-testid="make-it"
              >
                <TumblerGlyph aria-hidden strokeWidth={1.75} />
                Make it
                {missing > 0 && (
                  <span className="t-cap font-normal">· {missing} missing</span>
                )}
              </Link>
            </Button>
          )}

          {isNotNil(recipe.makeability) && recipe.type === "cocktail" && (
            <MakeabilityCard makeability={recipe.makeability} />
          )}

          <section
            aria-labelledby="recipe-ingredients"
            className="flex flex-col gap-2"
          >
            <h2
              id="recipe-ingredients"
              className="t-head m-0 flex items-baseline gap-2 text-ink"
            >
              Ingredients
              <span className="t-cap tabular text-ink-3">
                {recipe.ingredients.length}
              </span>
            </h2>
            <RecipeIngredientList
              ingredients={recipe.ingredients}
              // The bar vocabulary is drinks: on a dish every line would
              // read "Not tracked", which is noise, not information.
              showAvailability={recipe.type === "cocktail"}
            />
          </section>

          {recipe.instructions.length > 0 && (
            <section
              aria-labelledby="recipe-method"
              className="flex flex-col gap-3"
            >
              <h2 id="recipe-method" className="t-head m-0 text-ink">
                Method
              </h2>
              <ol className="m-0 flex list-none flex-col gap-3 p-0">
                {recipe.instructions.map((instruction) => (
                  <li key={instruction.id} className="flex items-start gap-3">
                    <span className="t-cap tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-ink">
                      {instruction.step_number}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                      <p className="t-body m-0 text-ink">
                        {instruction.instruction_text}
                      </p>
                      {(isNotNil(instruction.instruction_type) ||
                        isNotNil(instruction.equipment_needed) ||
                        isNotNil(instruction.time_minutes)) && (
                        <div className="flex flex-wrap items-center gap-2">
                          {isNotNil(instruction.instruction_type) && (
                            <Badge variant="outline">
                              {instruction.instruction_type}
                            </Badge>
                          )}
                          {isNotNil(instruction.equipment_needed) && (
                            <span className="t-cap text-ink-2">
                              {instruction.equipment_needed}
                            </span>
                          )}
                          {isNotNil(instruction.time_minutes) && (
                            <span className="t-cap tabular text-ink-2">
                              {minutesLabel(instruction.time_minutes)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {otherVersions.length > 0 && (
            <section
              aria-labelledby="recipe-versions"
              className="flex flex-col gap-1"
            >
              <h2
                id="recipe-versions"
                className="t-head m-0 flex items-baseline gap-2 text-ink"
              >
                Other versions
                <span className="t-cap tabular text-ink-3">
                  {otherVersions.length}
                </span>
              </h2>
              <ul className="m-0 flex list-none flex-col p-0">
                {otherVersions.map((version) => (
                  <li
                    key={version.id}
                    className="relative flex min-h-14 items-center gap-3 border-hair border-b py-2 last:border-b-0"
                  >
                    <span className="size-10 shrink-0 overflow-hidden rounded-sm">
                      <RecipeThumb type={recipe.type} />
                    </span>
                    <Link
                      href={`/recipes/${version.id}`}
                      overlay
                      underline="none"
                      className="t-body min-w-0 flex-1 truncate text-ink"
                    >
                      {version.name}
                    </Link>
                    {version.label !== null && (
                      <span className="t-cap shrink-0 text-ink-2">
                        {version.label}
                      </span>
                    )}
                    <ChevronRight
                      aria-hidden
                      className="size-5 shrink-0 text-glyph"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!isDraft && (
            <section
              aria-labelledby="recipe-reviews"
              className="flex flex-col gap-3"
            >
              <h2 id="recipe-reviews" className="t-head m-0 text-ink">
                Reviews
              </h2>
              <AddRecipeReview
                key={mine?.id ?? "new"}
                recipeId={recipe.id}
                viewerId={viewerId}
                hasReviews={reviews.some(
                  (review) => review.userId !== viewerId,
                )}
                myReview={
                  mine === null
                    ? null
                    : {
                        id: mine.id,
                        userId: mine.userId,
                        score: mine.score,
                        text: mine.text,
                      }
                }
                onReviewAdded={changed}
              />
              {isNotNil(recipe.recipe_reviews) && (
                <RecipeReviews
                  reviews={recipe.recipe_reviews}
                  recipeId={recipe.id}
                  endCursor={reviewsEndCursor}
                  viewerId={viewerId}
                  hasNextPage={reviewsHasNextPage}
                />
              )}
            </section>
          )}
        </div>
      </div>

      <RecipeShareSheet
        open={sharing}
        onOpenChange={setSharing}
        recipeId={recipe.id}
        recipeName={recipe.name}
        privacy={recipe.privacy}
        isOwner={isOwner}
        authorName={recipe.created_by_name}
      />

      {isOwner && (
        <ConfirmSheet
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={isDraft ? "Discard this draft?" : "Delete this recipe?"}
          description={
            isDraft
              ? "What the AI read goes."
              : "Its reviews, votes and Loves go with it."
          }
          confirmLabel={isDraft ? "Discard" : "Delete"}
          cancelLabel="Keep it"
          pending={deleting}
          onConfirm={() => void remove()}
        >
          {deleteFailure !== null && (
            <ApiError title="Couldn't delete" error={deleteFailure} />
          )}
        </ConfirmSheet>
      )}
    </div>
  );
};

/** Who can see your recipe, with the way to change it (X15 / D22). */
function PrivacyLine({
  privacy,
  recipeId,
}: {
  privacy: "PRIVATE" | "FRIENDS" | "PUBLIC";
  recipeId: string;
}) {
  const Icon = PRIVACY_ICON[privacy];
  return (
    <div
      data-slot="recipe-privacy"
      className="flex min-h-11 items-center gap-3"
    >
      <Icon aria-hidden className="size-5 shrink-0 text-glyph" />
      <p className="t-cap m-0 min-w-0 flex-1 text-ink-2">
        {PRIVACY_WHO[privacy]} can see it
      </p>
      <Link
        href={`/recipes/${recipeId}/edit`}
        underline="none"
        className={QUIET_ACTION}
      >
        Change
      </Link>
    </div>
  );
}
