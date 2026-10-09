import { Suspense } from "react";
import { Page } from "@/components/app/Page";
import {
  BarEntryCard,
  BarEntryCardFallback,
} from "@/components/bar/BarEntryCard";
import { CellarSegments } from "@/components/cellar/CellarSegments";
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

/**
 * `/recipes` — the Cellar tab's **Bar** (D1): your drafts and your recipes
 * (X15), what you can make (X14), then every recipe you may see, searchable.
 *
 * The header mirrors `/cellars`: the title and a full-width "New recipe"
 * (Photo · Paste · Type), then the Cellars · Bar switch. The old "Recipe
 * Groups" heading and its paragraph about voting are gone — a group is how
 * versions of one drink are filed, not something to explain on arrival.
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
  const [data, mine] = await Promise.all([
    apiServerQuery(RecipeGroupsQuery, {
      first: RECIPE_GROUPS_PAGE_SIZE,
      after: null,
      term: initialQuery.trim() === "" ? null : initialQuery.trim(),
      category: null,
      baseSpirit: null,
    }),
    apiServerQuery(MyRecipesQuery, { first: MY_RECIPES_PAGE_SIZE }),
  ]);
  const result = unwrapResult(data.recipeGroups, "RecipeGroupConnection");
  const own = unwrapResult(mine.myRecipes, "RecipeConnection");

  return (
    <Page wide>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-h-11 items-center">
          <h1 className="type-headline truncate">Bar</h1>
        </div>
        <NewRecipeButton className="sm:ml-auto" />
      </div>
      {/* The Cellar tab's Bar (D1): recipes live beside your cellars. */}
      <CellarSegments current="bar" />

      {own.ok && <MyRecipes rows={own.data.edges.map((edge) => edge.node)} />}

      {/* X14 / G29: the bar's verdict. */}
      <Suspense fallback={<BarEntryCardFallback />}>
        <BarEntryCard />
      </Suspense>

      <section aria-labelledby="all-recipes" className="flex flex-col gap-3">
        <h2 id="all-recipes" className="px-1 type-overline text-ink-3">
          All recipes
        </h2>
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
            Couldn't load recipes: {result.error.message}
          </p>
        )}
      </section>
    </Page>
  );
}
