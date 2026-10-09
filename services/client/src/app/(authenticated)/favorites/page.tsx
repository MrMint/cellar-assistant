import type { Metadata } from "next";
import {
  favoriteRowFromNode,
  favoritesVariables,
} from "@/components/favorites/adapter";
import { Favorites } from "@/components/favorites/Favorites";
import {
  FavoritesQuery,
  LOVED_RECIPES_PAGE_SIZE,
  LovedRecipesQuery,
} from "@/components/favorites/fragments";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { toPage } from "@/lib/paging/paged-connection";
import { parseTypesParam } from "@/utilities/types-param";

/**
 * `/favorites` — the old `Favorites` → `FavoritesClient` (`82450ad1`), with
 * the server's first page actually used, for the URL's `?types=` filter.
 *
 * `me` is null for a session that ended between the `(authenticated)`
 * layout's check and this read: that is a message, not a throw (the old page
 * said "User not found").
 */
export const dynamic = "force-dynamic";

/** D27: favourites read "Loved" wherever a person sees them, the tab too. */
export const metadata: Metadata = { title: "Loved · Cellar Assistant" };

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).types;
  const types = parseTypesParam(typeof raw === "string" ? raw : null);
  const [data, loved] = await Promise.all([
    apiServerQuery(FavoritesQuery, favoritesVariables(types, null)),
    apiServerQuery(LovedRecipesQuery, {
      first: LOVED_RECIPES_PAGE_SIZE,
      after: null,
    }),
  ]);
  // D9 / X15: the recipes you Love sit on the same page as the bottles. A
  // failed read leaves them out rather than failing the bottles too.
  const recipes = unwrapResult(loved.lovedRecipes, "RecipeConnection");

  if (data.me === null || data.me === undefined) {
    return (
      <p className="type-body text-ink-2">
        Your session has expired for this part of the app. Sign in again to see
        what you love.
      </p>
    );
  }

  return (
    <Favorites
      initialPage={toPage(data.me.favorites, (edge) =>
        favoriteRowFromNode(edge.node),
      )}
      initialTypes={types}
      lovedRecipes={
        recipes.ok
          ? {
              rows: recipes.data.edges.map((edge) => edge.node),
              totalCount: recipes.data.totalCount ?? recipes.data.edges.length,
            }
          : undefined
      }
    />
  );
}
