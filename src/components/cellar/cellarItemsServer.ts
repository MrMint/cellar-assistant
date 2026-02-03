import type {
  ItemTypeValue,
  ResultOf,
  VariablesOf,
} from "@cellar-assistant/shared";
import { getSearchVectorQuery } from "@cellar-assistant/shared/queries";
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
import { serverQuery } from "@/lib/urql/server";
import { formatVintage, getItemType } from "@/utilities";
import type { GetCellarItemsQuery } from "./queries";

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
 * Generate search vector from text (server-side)
 */
export async function generateSearchVector(
  searchText: string,
): Promise<string | undefined> {
  if (!searchText || searchText.trim() === "") {
    return undefined;
  }

  const vectorData = await serverQuery(getSearchVectorQuery, {
    text: searchText.trim(),
  });

  if (isNil(vectorData?.create_search_vector)) {
    return undefined;
  }

  return JSON.stringify(vectorData.create_search_vector);
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
