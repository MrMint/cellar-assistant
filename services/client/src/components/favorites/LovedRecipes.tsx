"use client";

import Image from "next/image";
import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { ICON_STROKE, Love, Recipe } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow, Page } from "@/components/app/Page";
import { ApiError } from "@/components/cellar-api/ApiError";
import { RecipeLoveButton } from "@/components/recipe/RecipeLoveButton";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/lib/api/result";
import type { Page as ListPage } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { LovedSegment } from "./LovedSegment";
import { LovedSubtitle } from "./LovedSubtitle";
import type { LovedCounts } from "./loved-counts";
import {
  LOVED_RECIPES_PAGE_SIZE,
  type LovedRecipeRow,
  LovedRecipesQuery,
  lovedRecipesPage,
} from "./loved-recipes";

/** 44 pt: the recipe's photo, or the recipe glyph. */
function Thumbnail({ row }: { row: LovedRecipeRow }) {
  return row.imageUrl === null ? (
    <span className="flex size-11 items-center justify-center rounded-sm bg-raised text-glyph">
      <Recipe aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
    </span>
  ) : (
    <span className="relative block size-11 overflow-hidden rounded-sm bg-raised">
      <Image
        src={row.imageUrl}
        alt=""
        fill
        sizes="44px"
        className="object-cover"
      />
    </span>
  );
}

/**
 * Loved › Recipes (X18, D9): every recipe the viewer loved, newest Love
 * first, each with its Love toggle. Un-Loving one leaves the row where it is
 * until the next visit, so a mis-tap never makes a row jump from under the
 * thumb — tap again to put it back.
 */
export function LovedRecipes({
  initialPage,
  initialFailure,
  counts = null,
}: {
  initialPage: ListPage<LovedRecipeRow> | null;
  initialFailure: ApiFailure | null;
  /** F-135: `me.lovedCounts` for the subtitle; null shows none. */
  counts?: LovedCounts | null;
}) {
  const list = usePagedConnection({
    query: LovedRecipesQuery,
    variables: (_args: "recipes", after) => ({
      first: LOVED_RECIPES_PAGE_SIZE,
      after,
    }),
    select: (data) => lovedRecipesPage(data?.lovedRecipes),
    initial: initialPage,
    initialArgs: "recipes",
    initialFailure,
  });

  return (
    // gap-4, as the drinks half spaces its bar and segment: the segment sits
    // at the same height in both halves.
    <Page className="gap-4">
      <AppBar title="Loved" parent="/me" />
      <LovedSubtitle counts={counts} />
      <LovedSegment value="recipes" />
      {list.failure !== null && <ApiError error={list.failure} title="Loved" />}
      {list.rows.length === 0 && list.failure === null ? (
        <EmptyState
          illustration={<Love aria-hidden strokeWidth={1.5} />}
          title="No recipes loved yet."
          description="Love a recipe in the Bar, and it waits here."
          action={
            <Button asChild variant="secondary">
              <Link href="/recipes">Open the Bar</Link>
            </Button>
          }
        />
      ) : (
        list.rows.length > 0 && (
          <InsetSection
            label={
              typeof list.totalCount === "number"
                ? `${list.totalCount} loved`
                : undefined
            }
          >
            {list.rows.map((row) => (
              <ListRow
                key={row.id}
                data-loved-recipe={row.id}
                leading={<Thumbnail row={row} />}
                title={
                  <Link
                    href={row.href}
                    overlay
                    underline="none"
                    className="text-ink"
                  >
                    {row.name}
                  </Link>
                }
                description={row.description}
                trailing={
                  <RecipeLoveButton
                    recipeId={row.id}
                    loved={row.loved}
                    name={row.name}
                  />
                }
              />
            ))}
          </InsetSection>
        )
      )}
      {list.canLoadMore && (
        <Button
          variant="secondary"
          onClick={() => void list.loadMore()}
          disabled={list.status === "loadingMore"}
          aria-busy={list.status === "loadingMore" || undefined}
        >
          {list.status === "loadingMore" ? "Loading…" : "Show more"}
        </Button>
      )}
    </Page>
  );
}
