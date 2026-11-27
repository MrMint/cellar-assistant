import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { ResultOf } from "@/lib/api/graphql";
import { type ApiFailure, unwrapResult } from "@/lib/api/result";
import {
  itemPageHref,
  itemRecipesFromFragment,
  itemRelationsFromFragment,
  itemViewFromFragment,
  yourBottlesFromFragment,
} from "../adapter";
import { ItemPageQuery } from "../fragments";
import type { ItemPageViewProps } from "../ItemPageView";
import {
  allAddableCellars,
  allItemBrands,
  allItemCellars,
  type PageQuery,
} from "../page-lists";

/** Everything `ItemPageView` reads from the API (not the route's own props). */
export type ItemPageData = Omit<
  ItemPageViewProps,
  "selected" | "parent" | "pane"
>;

/**
 * The item page's reads, for the server page (`apiServerQuery`) and the
 * desktop pane (the urql client) alike: one `ItemPageQuery`, then every list
 * read to its end (`page-lists.ts`), then the view's props. With `query`
 * null (the pane, which reads `ItemPageQuery` through urql's `useQuery`), the
 * lists stop at their first page of 100 and `first` is required.
 */
export async function loadItemPageData(
  query: PageQuery | null,
  type: ApiItemType,
  itemId: string,
  first?: ResultOf<typeof ItemPageQuery>,
): Promise<
  { ok: true; data: ItemPageData } | { ok: false; error: ApiFailure }
> {
  const data = first ?? (await query?.(ItemPageQuery, { itemId, type }));
  if (data === undefined) {
    throw new Error("loadItemPageData: no query and no first page");
  }
  const result = unwrapResult(data.item, "QueryItemSuccess");
  if (!result.ok) return { ok: false, error: result.error };

  const viewerId = data.me?.id ?? null;
  const node = result.data.data;
  const relations = itemRelationsFromFragment(node);
  const myCellars = unwrapResult(data.myCellars, "CellarConnection");
  const [brands, located, addable] = await Promise.all([
    allItemBrands(query, node, { itemId, type }),
    allItemCellars(query, node),
    myCellars.ok
      ? allAddableCellars(query, myCellars.data, viewerId)
      : Promise.resolve([]),
  ]);
  const item = { ...itemViewFromFragment(node), brands };
  const { bottles, total } = yourBottlesFromFragment(node);
  return {
    ok: true,
    data: {
      item,
      bottles,
      bottlesTotal: total,
      cellars: located.cellars,
      cellarsTotal: located.total,
      tierLists: relations.tierLists,
      tierListsTotal: relations.tierListsTotal,
      recipes: itemRecipesFromFragment(node),
      addableCellars: addable,
      editHref:
        viewerId !== null && item.createdById === viewerId
          ? `${itemPageHref(type, itemId)}/edit`
          : null,
    },
  };
}
