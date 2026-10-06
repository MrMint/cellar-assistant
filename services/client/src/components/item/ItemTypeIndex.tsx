import { Button, Grid, Stack, Typography } from "@mui/joy";
import { HeaderBar } from "@/components/common/HeaderBar";
import { Link } from "@/components/common/Link";
import { favoriteRowFromNode } from "@/components/favorites/adapter";
import { FavoritesQuery } from "@/components/favorites/fragments";
import { ItemCard } from "@/components/item/ItemCard";
import {
  type ApiItemType,
  addItemHref,
  ITEM_TYPE_PLURAL,
  itemHref,
} from "@/components/item-api/itemTypes";
import { apiServerQuery } from "@/lib/api/urql-server";
import { formatItemType } from "@/utilities";

/** One page of cards; the rest is on `/favorites`, which pages. */
const FIRST = 48;

/**
 * `/{type}s` — new-only (there was no old per-type index), kept under
 * decision 2 and restyled with restored pieces: `HeaderBar` breadcrumbs, the
 * old `ItemCard` grid, and the old favourites copy. What it lists is still
 * the viewer's favourites of this type, because the schema has no field that
 * enumerates a type (`migration-plan.md`, the declined list-by-type root);
 * past one page it links to `/favorites` filtered to the type, which pages.
 */
export async function ItemTypeIndex({ type }: { type: ApiItemType }) {
  const data = await apiServerQuery(FavoritesQuery, {
    first: FIRST,
    after: null,
    types: [type],
  });
  const favorites = data.me?.favorites ?? null;
  const rows = (favorites?.edges ?? []).map((edge) =>
    favoriteRowFromNode(edge.node),
  );
  const plural = ITEM_TYPE_PLURAL[type];

  return (
    <Stack spacing={2}>
      <HeaderBar
        serverBreadcrumbs={{}}
        endComponent={
          <Button component={Link} href={addItemHref(type)}>
            Add a {formatItemType(type).toLowerCase()}
          </Button>
        }
      />
      <Typography level="title-lg">Favorite {plural}</Typography>
      {rows.length === 0 ? (
        <Typography level="body-lg" textAlign="center" padding="1rem">
          No favorites found
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {rows.map((row) => (
            <Grid key={row.item.id} xs={12} sm={6} md={4} lg={3}>
              <ItemCard
                item={row.item}
                type={row.type}
                href={itemHref(row.type, row.item.id)}
              />
            </Grid>
          ))}
        </Grid>
      )}
      {favorites?.pageInfo.hasNextPage === true && (
        <Link
          href={`/favorites?types=${encodeURIComponent(JSON.stringify([type]))}`}
        >
          See all {favorites.totalCount ?? ""} favorite {plural.toLowerCase()}
        </Link>
      )}
    </Stack>
  );
}
