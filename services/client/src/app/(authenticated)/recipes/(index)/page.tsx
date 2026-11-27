import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState } from "@/components/app/EmptyState";
import { Page } from "@/components/app/Page";
import {
  BarEntryCard,
  BarEntryCardFallback,
} from "@/components/bar/BarEntryCard";
import {
  MY_RECIPES_PAGE_SIZE,
  MyRecipesQuery,
} from "@/components/recipe/editor/documents";
import { MyRecipes } from "@/components/recipe/editor/MyRecipes";
import { NewRecipeButton } from "@/components/recipe/editor/NewRecipeButton";
import {
  RECIPE_GROUPS_PAGE_SIZE,
  RecipeGroupsQuery,
} from "@/components/recipe/queries";
import { RecipeGroupSearch } from "@/components/search/RecipeGroupSearch";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Recipes" };

/**
 * `/recipes` — Recipes (Recipes-Browse 01, desktop 01): the title with an
 * outlined "New recipe" (Photo · Paste · Type; CROSS-LOT "Header create
 * buttons"), the search field, then — while nothing is searched — Your bar
 * (X14) and your drafts and recipes (X15), then every recipe you may see.
 *
 * The first page of the list is server-rendered (`recipeGroups`, with `?q=` —
 * or the old `?semantic=` alias — as its term) and the search pages on from
 * the client. Signed-out viewers never reach this: the authenticated layout
 * redirects.
 */
export const dynamic = "force-dynamic";

const firstParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialQuery = firstParam(params.q) || firstParam(params.semantic);
  const [data, draftsRead, publishedRead] = await Promise.all([
    apiServerQuery(RecipeGroupsQuery, {
      first: RECIPE_GROUPS_PAGE_SIZE,
      after: null,
      term: initialQuery.trim() === "" ? null : initialQuery.trim(),
      category: null,
      baseSpirit: null,
    }),
    // Read apart, so each section's count is its own and drafts never crowd
    // published recipes out of the first page.
    apiServerQuery(MyRecipesQuery, {
      first: MY_RECIPES_PAGE_SIZE,
      drafts: true,
    }),
    apiServerQuery(MyRecipesQuery, {
      first: MY_RECIPES_PAGE_SIZE,
      drafts: false,
    }),
  ]);
  const result = unwrapResult(data.recipeGroups, "RecipeGroupConnection");
  const drafts = unwrapResult(draftsRead.myRecipes, "RecipeConnection");
  const published = unwrapResult(publishedRead.myRecipes, "RecipeConnection");

  const mine = (
    <>
      {/* X14 / G29: the bar's verdict. */}
      <Suspense fallback={<BarEntryCardFallback />}>
        <BarEntryCard />
      </Suspense>
      <MyRecipes
        rows={[
          ...(drafts.ok ? drafts.data.edges.map((edge) => edge.node) : []),
          ...(published.ok
            ? published.data.edges.map((edge) => edge.node)
            : []),
        ]}
        publishedTotal={
          published.ok ? (published.data.totalCount ?? undefined) : undefined
        }
      />
    </>
  );

  return (
    <Page wide>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="t-title m-0 truncate text-ink">Recipes</h1>
        <NewRecipeButton className="shrink-0" />
      </div>

      {result.ok ? (
        <RecipeGroupSearch
          initialQuery={initialQuery}
          initialEdges={[...result.data.edges]}
          initialEndCursor={result.data.pageInfo.endCursor ?? null}
          initialHasNextPage={result.data.pageInfo.hasNextPage}
          initialTotalCount={result.data.totalCount ?? null}
          between={mine}
        />
      ) : (
        <>
          {mine}
          <ErrorState
            title="Couldn't load recipes"
            reason={result.error.message}
          />
        </>
      )}
    </Page>
  );
}
