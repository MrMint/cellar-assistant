import { Suspense } from "react";
import {
  BarEntryCard,
  BarEntryCardFallback,
} from "@/components/bar/BarEntryCard";
import {
  RECIPE_GROUPS_PAGE_SIZE,
  RecipeGroupsQuery,
} from "@/components/recipe/queries";
import { RecipeGroupSearch } from "@/components/search/RecipeGroupSearch";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/recipes` — `82450ad1:src/app/(authenticated)/recipes/page.tsx`, restored:
 * "Recipe Groups", the old blurb, and `RecipeGroupSearch`.
 *
 * The first page is server-rendered (`recipeGroups`, with `?q=` — or the old
 * `?semantic=` alias — as its term), and the search pages on from the client.
 * Signed-out viewers never reach this: the authenticated layout redirects, as
 * the old page's own `redirect("/sign-in")` did.
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
  const data = await apiServerQuery(RecipeGroupsQuery, {
    first: RECIPE_GROUPS_PAGE_SIZE,
    after: null,
    term: initialQuery.trim() === "" ? null : initialQuery.trim(),
    category: null,
    baseSpirit: null,
  });
  const result = unwrapResult(data.recipeGroups, "RecipeGroupConnection");

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <h1 className="mb-6 type-large-title">Recipe Groups</h1>

      {/* X14 / G29: the bar's verdict, first thing on the recipes tab. */}
      <div className="mb-6">
        <Suspense fallback={<BarEntryCardFallback />}>
          <BarEntryCard />
        </Suspense>
      </div>

      <p className="mb-8 type-body text-ink-2">
        Discover and explore cocktail recipes. Each recipe group shows the
        community's preferred version based on voting, with alternative versions
        available for comparison.
      </p>

      {result.ok ? (
        <RecipeGroupSearch
          initialQuery={initialQuery}
          initialEdges={[...result.data.edges]}
          initialEndCursor={result.data.pageInfo.endCursor ?? null}
          initialHasNextPage={result.data.pageInfo.hasNextPage}
          initialTotalCount={result.data.totalCount ?? null}
        />
      ) : (
        <p className="type-body text-destructive">
          Error searching recipe groups: {result.error.message}
        </p>
      )}
    </div>
  );
}
