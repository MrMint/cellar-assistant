import type { Metadata } from "next";
import {
  favoriteRowFromNode,
  favoritesVariables,
} from "@/components/favorites/adapter";
import { Favorites } from "@/components/favorites/Favorites";
import { FavoritesQuery } from "@/components/favorites/fragments";
import { LovedRecipes } from "@/components/favorites/LovedRecipes";
import { LovedCountsQuery } from "@/components/favorites/loved-counts";
import {
  LOVED_RECIPES_PAGE_SIZE,
  LovedRecipesQuery,
  lovedKindFromParam,
  lovedRecipesPage,
} from "@/components/favorites/loved-recipes";
import { apiServerQuery } from "@/lib/api/urql-server";
import { toPage } from "@/lib/paging/paged-connection";
import { parseTypesParam } from "@/utilities/types-param";

/**
 * `/favorites` — Me › Lists › Loved. Drinks: the old `Favorites` →
 * `FavoritesClient` (`82450ad1`), with the server's first page actually
 * used, for the URL's `?types=` filter. Recipes (`?kind=recipes`, X18): the
 * viewer's loved recipes (D9).
 *
 * `me` is null for a session that ended between the `(authenticated)`
 * layout's check and this read: that is a message, not a throw (the old page
 * said "User not found").
 */
export const dynamic = "force-dynamic";

/** D27: favourites read "Loved" wherever a person sees them, the tab too. */
export const metadata: Metadata = { title: "Loved" };

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // F-135: the subtitle and chip counts, read once (a failed read shows none).
  const countsRead = apiServerQuery(LovedCountsQuery, {}).then(
    (data) => data.me?.lovedCounts ?? null,
    () => null,
  );
  // X18: `?kind=recipes` is Loved's recipes half (D9); anything else, drinks.
  if (lovedKindFromParam(params.kind) === "recipes") {
    const [counts, answer] = await Promise.all([
      countsRead,
      apiServerQuery(LovedRecipesQuery, {
        first: LOVED_RECIPES_PAGE_SIZE,
        after: null,
      }),
    ]);
    const recipes = lovedRecipesPage(answer.lovedRecipes);
    return (
      <LovedRecipes
        counts={counts}
        initialPage={recipes.ok ? recipes.data : null}
        initialFailure={recipes.ok ? null : recipes.error}
      />
    );
  }
  const raw = params.types;
  const types = parseTypesParam(typeof raw === "string" ? raw : null);
  const [counts, data] = await Promise.all([
    countsRead,
    apiServerQuery(FavoritesQuery, favoritesVariables(types, null)),
  ]);

  if (data.me === null || data.me === undefined) {
    return (
      <p className="t-body text-ink-2">
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
      counts={counts}
    />
  );
}
