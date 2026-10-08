import { cache } from "react";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { unwrapResult } from "@/lib/api/result";
import { anonymousApiQuery } from "@/lib/api/urql-anonymous";
import {
  SHARED_PAGE_SIZE,
  SharedItemQuery,
  SharedRecipeQuery,
  SharedTierListCardQuery,
  SharedTierListQuery,
} from "./queries";

/**
 * The share pages' reads, each once per request: `generateMetadata` and the
 * page both ask, and React's `cache` makes that one anonymous query. Each
 * answers the `unwrapResult` shape — a `NOT_FOUND` failure means missing or
 * not public, and the page says the same thing for both.
 *
 * Anonymous on purpose, even for a viewer with a session: the public page is
 * the same for everyone (`lib/api/urql-anonymous.ts`).
 */

export const loadSharedTierList = cache(async (id: string) =>
  unwrapResult(
    (
      await anonymousApiQuery(SharedTierListQuery, {
        id,
        first: SHARED_PAGE_SIZE,
      })
    ).sharedTierList,
    "SharedTierList",
  ),
);

/** The preview card's read: no photos (`SharedTierListCardQuery`). */
export const loadSharedTierListCard = cache(async (id: string) =>
  unwrapResult(
    (
      await anonymousApiQuery(SharedTierListCardQuery, {
        id,
        first: SHARED_PAGE_SIZE,
      })
    ).sharedTierList,
    "SharedTierList",
  ),
);

export const loadSharedItem = cache(async (type: ApiItemType, id: string) =>
  unwrapResult(
    (await anonymousApiQuery(SharedItemQuery, { id, type })).sharedItem,
    "SharedItem",
  ),
);

export const loadSharedRecipe = cache(async (id: string) =>
  unwrapResult(
    (
      await anonymousApiQuery(SharedRecipeQuery, {
        id,
        first: SHARED_PAGE_SIZE,
      })
    ).sharedRecipe,
    "SharedRecipe",
  ),
);

/** An entry list, flattened from its connection. */
export const nodesOf = <T>(connection: {
  edges: readonly { node: T }[];
}): T[] => connection.edges.map((edge) => edge.node);
