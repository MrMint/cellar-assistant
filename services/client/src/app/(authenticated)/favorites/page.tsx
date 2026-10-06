import { Typography } from "@mui/joy";
import {
  favoriteRowFromNode,
  favoritesVariables,
} from "@/components/favorites/adapter";
import { Favorites } from "@/components/favorites/Favorites";
import { FavoritesQuery } from "@/components/favorites/fragments";
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

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).types;
  const types = parseTypesParam(typeof raw === "string" ? raw : null);
  const data = await apiServerQuery(
    FavoritesQuery,
    favoritesVariables(types, null),
  );

  if (data.me === null || data.me === undefined) {
    return (
      <Typography level="body-md" sx={{ color: "text.secondary" }}>
        Your session has expired for this part of the app. Sign in again to see
        your favorites.
      </Typography>
    );
  }

  return (
    <Favorites
      initialPage={toPage(data.me.favorites, (edge) =>
        favoriteRowFromNode(edge.node),
      )}
      initialTypes={types}
    />
  );
}
