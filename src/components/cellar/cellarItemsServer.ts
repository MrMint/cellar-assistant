import type {
  ItemTypeValue,
  ResultOf,
  VariablesOf,
} from "@cellar-assistant/shared";
import { unstable_cache } from "next/cache";
import {
  ascend,
  defaultTo,
  isEmpty,
  isNil,
  isNotNil,
  nth,
  prop,
  sortWith,
  without,
} from "ramda";
import type { ItemCardItem } from "@/components/item/ItemCard";
import { CacheTags, getCachedSearchVector } from "@/lib/cache";
import { serverQuery } from "@/lib/urql/server";
import { buildItemSubtitle, formatVintage, getItemType } from "@/utilities";
import { GetCellarItemsQuery } from "./queries";

export interface TransformedCellarItem {
  type: ItemTypeValue;
  distance: number;
  item: ItemCardItem;
}

export interface CellarItemCounts {
  wines?: number;
  beers?: number;
  spirits?: number;
  coffees?: number;
  sakes?: number;
}

/**
 * Build the items where clause for the GraphQL query
 */
export function buildItemsWhereClause(
  types: ItemTypeValue[] | undefined,
): VariablesOf<typeof GetCellarItemsQuery>["itemsWhereClause"] {
  const whereClause: VariablesOf<
    typeof GetCellarItemsQuery
  >["itemsWhereClause"] = {
    empty_at: { _is_null: true },
  };

  if (types && types.length > 0 && types.length < 5) {
    whereClause.type = { _in: types };
  }

  return whereClause;
}

type CellarItemsResult = NonNullable<
  ResultOf<typeof GetCellarItemsQuery>["cellars_by_pk"]
>;
type CellarItem = CellarItemsResult["items"][number];

/**
 * Transform raw cellar items into the format needed for ItemCard
 */
export function transformCellarItems(
  items: CellarItem[],
): TransformedCellarItem[] {
  return items
    .map((x) => {
      const result = nth(
        0,
        without(
          [undefined, null],
          [
            x.beer,
            x.wine,
            x.spirit,
            isNotNil(x.coffee)
              ? { ...x.coffee, vintage: undefined }
              : undefined,
            x.sake,
          ],
        ),
      );

      if (isNil(result)) return undefined;

      const distances = result.item_vectors
        .map((y) => y.distance)
        .filter(isNotNil);

      return {
        type: getItemType(result.__typename),
        distance: isEmpty(distances) ? Infinity : Math.min(...distances),
        item: {
          id: x.id,
          itemId: result.id,
          name: result.name,
          vintage: formatVintage(result.vintage),
          subtitle: buildItemSubtitle(result),
          displayImageId: result.item_images[0]?.file_id,
          placeholder: result.item_images[0]?.placeholder,
          score: result.reviews_aggregate.aggregate?.avg?.score,
          reviewCount: result.reviews_aggregate.aggregate?.count,
          favoriteCount: result.item_favorites_aggregate.aggregate?.count,
          favoriteId: nth(0, result.item_favorites)?.id,
          reviewed: defaultTo(0, result.user_reviews.aggregate?.count) > 0,
        } satisfies ItemCardItem,
      };
    })
    .filter(isNotNil);
}

/**
 * Sort items by distance (for search) and name
 */
export function sortCellarItems(
  items: TransformedCellarItem[],
): TransformedCellarItem[] {
  return sortWith(
    [ascend(prop("distance")), ascend((x) => x.item.name)],
    items,
  );
}

/**
 * Cached fetch, transform, and sort of cellar items.
 *
 * Auth headers are captured via closure — they're NOT part of the cache key
 * so different JWTs for the same user share one cache entry. On cache miss
 * the current request's headers are used, preserving Hasura RLS. On cache
 * hit the function body never executes so headers aren't needed.
 *
 * Cache key: cellarId (keyParts) + userId + search + types (args)
 * TTL: 5 minutes (safety net)
 * Tag: cellar-items:{cellarId} (for on-demand revalidation)
 */
export function getCachedCellarItems(
  cellarId: string,
  authHeaders: Record<string, string>,
) {
  return unstable_cache(
    async (
      userId: string,
      search: string,
      types: ItemTypeValue[],
    ): Promise<CachedCellarItemsResult> => {
      const searchVector = search
        ? await getCachedSearchVector(search)
        : undefined;
      const itemsWhereClause = buildItemsWhereClause(
        types.length > 0 ? types : undefined,
      );

      const data = await serverQuery(
        GetCellarItemsQuery,
        {
          cellarId,
          userId,
          itemsWhereClause,
          search: searchVector,
        },
        authHeaders,
      );

      if (!data.cellars_by_pk) {
        return { items: [], totalCount: 0 };
      }

      const transformedItems = transformCellarItems(data.cellars_by_pk.items);
      const sortedItems = sortCellarItems(transformedItems);

      return { items: sortedItems, totalCount: sortedItems.length };
    },
    ["cellar-items", cellarId],
    {
      revalidate: 300,
      tags: [CacheTags.cellarItems(cellarId)],
    },
  );
}

export interface CachedCellarItemsResult {
  items: TransformedCellarItem[];
  totalCount: number;
}

/**
 * Shape of item counts from aggregate queries.
 * Works with both GetCellarItemsQuery and GetCellarInfoQuery results.
 */
interface ItemCountsInput {
  wines?: { count?: number | null } | null;
  beers?: { count?: number | null } | null;
  spirits?: { count?: number | null } | null;
  coffees?: { count?: number | null } | null;
  sakes?: { count?: number | null } | null;
}

/**
 * Extract item counts from query result
 */
export function extractItemCounts(
  itemCounts: ItemCountsInput | null | undefined,
): CellarItemCounts {
  return {
    wines: itemCounts?.wines?.count ?? undefined,
    beers: itemCounts?.beers?.count ?? undefined,
    spirits: itemCounts?.spirits?.count ?? undefined,
    coffees: itemCounts?.coffees?.count ?? undefined,
    sakes: itemCounts?.sakes?.count ?? undefined,
  };
}
