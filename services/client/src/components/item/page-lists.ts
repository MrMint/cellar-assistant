/**
 * The item and bottle pages' lists, read to their end before the view sees
 * them — the old pages read each one unbounded (see "No silent caps" in
 * `./fragments.ts`).
 *
 * Every function takes the first page the main query already holds plus the
 * query function (`apiServerQuery` in the pages, a fake in the tests), and
 * returns the old prop shape built over *every* row. A follow-up read that
 * fails keeps the rows so far: the page still renders what it has, as it did
 * before these reads existed, instead of failing whole.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { ItemBrandFragment } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import type { apiServerQuery } from "@/lib/api/urql-server";
import { loadRest, type RestConnection } from "@/lib/paging/load-rest";
import {
  addableCellars,
  brandFromNode,
  type CellarSource,
  cellarFromNode,
  userFromProfile,
} from "./adapter";
import {
  AddableCellarsPageQuery,
  BottleFriendsPageQuery,
  CellarCoOwnersPageQuery,
  ItemBrandsPageQuery,
  ItemPageItemFragment,
  ItemPageRelationsFragment,
} from "./fragments";
import type { ItemBrand } from "./ItemBrands";
import type { ItemCellar, ItemCellarUser } from "./ItemCellars";

export type PageQuery = typeof apiServerQuery;

/** Every brand of the item: the first 100 inline, the rest with `after`. */
export async function allItemBrands(
  query: PageQuery,
  data: FragmentOf<typeof ItemPageItemFragment>,
  ids: { itemId: string; type: ApiItemType },
): Promise<ItemBrand[]> {
  const first = readFragment(ItemPageItemFragment, data).brands;
  const { edges } = await loadRest(first, async (after) => {
    const page = await query(ItemBrandsPageQuery, { ...ids, after });
    const result = unwrapResult(page.item, "QueryItemSuccess");
    return result.ok ? result.data.data.brands : null;
  });
  return edges.map((edge) =>
    brandFromNode(readFragment(ItemBrandFragment, edge.node)),
  );
}

type CoOwnerProfile = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
};

type CellarWithCoOwners = Omit<CellarSource, "coOwners"> & {
  coOwners: RestConnection<{ node: CoOwnerProfile }>;
};

/**
 * "Located in:" — every cellar the API returns (a reverse edge: one page of
 * 100 is all of it, `total` is the exact count), each with every co-owner.
 */
export async function allItemCellars(
  query: PageQuery,
  data: FragmentOf<typeof ItemPageRelationsFragment>,
): Promise<{ cellars: ItemCellar[]; total: number | null }> {
  const relations = readFragment(ItemPageRelationsFragment, data);
  const cellars = await Promise.all(
    relations.cellars.edges.map(
      async ({ node }: { node: CellarWithCoOwners }) => {
        const { edges } = await loadRest(node.coOwners, async (after) => {
          const page = await query(CellarCoOwnersPageQuery, {
            cellarId: node.id,
            after,
          });
          const result = unwrapResult(page.cellar, "Cellar");
          return result.ok ? result.data.coOwners : null;
        });
        return cellarFromNode({ ...node, coOwners: { edges } });
      },
    ),
  );
  return { cellars, total: relations.cellars.totalCount ?? null };
}

type MyCellarNode = {
  id: string;
  name: string;
  createdById: string;
  coOwnerIds: readonly string[];
};

/** "Add to Cellar" — every cellar the viewer may add to, past 100. */
export async function allAddableCellars(
  query: PageQuery,
  first: RestConnection<{ node: MyCellarNode }>,
  viewerId: string | null,
): Promise<{ id: string; name: string }[]> {
  const { edges } = await loadRest(first, async (after) => {
    const page = await query(AddableCellarsPageQuery, { after });
    const result = unwrapResult(page.myCellars, "CellarConnection");
    return result.ok ? result.data : null;
  });
  return addableCellars(
    edges.map((edge) => edge.node),
    viewerId,
  );
}

/** The bulk check-in picker — every friend, past 100. */
export async function allFriends(
  query: PageQuery,
  first: RestConnection<{ node: { user: CoOwnerProfile } }>,
): Promise<ItemCellarUser[]> {
  const { edges } = await loadRest(first, async (after) => {
    const page = await query(BottleFriendsPageQuery, { after });
    const result = unwrapResult(page.myFriends, "FriendConnection");
    return result.ok ? result.data : null;
  });
  return edges.map((edge) => userFromProfile(edge.node.user));
}
