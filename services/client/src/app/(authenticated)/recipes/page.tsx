import { Box, Typography } from "@mui/joy";
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
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <Typography level="h1" sx={{ mb: 3 }}>
        Recipe Groups
      </Typography>

      <Typography level="body-lg" sx={{ mb: 4, color: "text.secondary" }}>
        Discover and explore cocktail recipes. Each recipe group shows the
        community's preferred version based on voting, with alternative versions
        available for comparison.
      </Typography>

      {result.ok ? (
        <RecipeGroupSearch
          initialQuery={initialQuery}
          initialEdges={[...result.data.edges]}
          initialEndCursor={result.data.pageInfo.endCursor ?? null}
          initialHasNextPage={result.data.pageInfo.hasNextPage}
          initialTotalCount={result.data.totalCount ?? null}
        />
      ) : (
        <Typography level="body-md" sx={{ color: "danger.500" }}>
          Error searching recipe groups: {result.error.message}
        </Typography>
      )}
    </Box>
  );
}
