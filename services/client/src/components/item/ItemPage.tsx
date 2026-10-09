import { notFound } from "next/navigation";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  itemPageHref,
  itemRecipesFromFragment,
  itemRelationsFromFragment,
  itemViewFromFragment,
  yourBottlesFromFragment,
} from "./adapter";
import { ItemPageQuery } from "./fragments";
import { ItemPageView, type SelectedBottle } from "./ItemPageView";
import { allAddableCellars, allItemBrands, allItemCellars } from "./page-lists";

/**
 * `/{type}s/[itemId]` for all six types — and, since X09, the bottle route
 * too (`CellarItemPage` renders this with the bottle `selected`): one
 * `ItemPageQuery`, the adapter, one view. Client leaves mutate through URQL
 * and then `router.refresh()`, which re-runs this.
 *
 * `NotFoundError` (no such item, or not yours to see, §1.6) is the old
 * `notFound()`.
 */
export async function ItemPage({
  type,
  itemId,
  selected = null,
  parent = "/",
}: {
  type: ApiItemType;
  itemId: string;
  /** The bottle a bottle URL names. */
  selected?: SelectedBottle | null;
  /** Back's target on a cold deep link: Home, or the bottle's cellar. */
  parent?: string;
}) {
  const data = await apiServerQuery(ItemPageQuery, { itemId, type });
  const result = unwrapResult(data.item, "QueryItemSuccess");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <p role="alert" className="type-body text-destructive">
        {result.error.message}
      </p>
    );
  }

  const viewerId = data.me?.id ?? null;
  const node = result.data.data;
  const relations = itemRelationsFromFragment(node);
  const myCellars = unwrapResult(data.myCellars, "CellarConnection");
  // The old page read every list unbounded: read the rest before rendering.
  const [brands, located, addable] = await Promise.all([
    allItemBrands(apiServerQuery, node, { itemId, type }),
    allItemCellars(apiServerQuery, node),
    myCellars.ok
      ? allAddableCellars(apiServerQuery, myCellars.data, viewerId)
      : Promise.resolve([]),
  ]);
  const item = { ...itemViewFromFragment(node), brands };
  const { bottles, total } = yourBottlesFromFragment(node);

  return (
    <ItemPageView
      item={item}
      bottles={bottles}
      bottlesTotal={total}
      selected={selected}
      parent={parent}
      cellars={located.cellars}
      cellarsTotal={located.total}
      tierLists={relations.tierLists}
      tierListsTotal={relations.tierListsTotal}
      recipes={itemRecipesFromFragment(node)}
      addableCellars={addable}
      editHref={
        viewerId !== null && item.createdById === viewerId
          ? `${itemPageHref(type, itemId)}/edit`
          : null
      }
    />
  );
}
