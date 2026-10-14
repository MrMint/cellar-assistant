import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { Page } from "@/lib/paging/paged-connection";
import type { FavoriteGridRow } from "./adapter";
import { FavoritesClient } from "./FavoritesClient";
import type { LovedRecipeRow } from "./LovedRecipes";

interface FavoritesProps {
  initialPage: Page<FavoriteGridRow>;
  initialTypes: ApiItemType[];
  lovedRecipes?: {
    readonly rows: readonly LovedRecipeRow[];
    readonly totalCount: number;
  };
}

/**
 * `82450ad1:src/components/favorites/Favorites.tsx`, restored as the same
 * server → client hand-off — except the server's rows now reach the client
 * (the old one read them and passed only `userId`).
 */
export function Favorites({
  initialPage,
  initialTypes,
  lovedRecipes,
}: FavoritesProps) {
  return (
    <FavoritesClient
      initialPage={initialPage}
      initialTypes={initialTypes}
      lovedRecipes={lovedRecipes}
    />
  );
}
