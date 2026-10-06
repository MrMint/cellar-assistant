import { Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  itemPageHref,
  itemRecipesFromFragment,
  itemRelationsFromFragment,
  itemViewFromFragment,
  recipeIngredientsTotal,
} from "./adapter";
import { ItemPageQuery } from "./fragments";
import { ItemPageView } from "./ItemPageView";
import { allAddableCellars, allItemBrands, allItemCellars } from "./page-lists";

/**
 * `/{type}s/[itemId]` for all six types — the old per-type `page.tsx` +
 * `{T}Details` pair, as one server component: one `ItemPageQuery`, the
 * adapter, the restored view. Client leaves mutate through URQL and then
 * `router.refresh()`, which re-runs this — the old pages did the same with
 * server actions and `revalidatePath`.
 *
 * `NotFoundError` (no such item, or not yours to see, §1.6) is the old
 * `notFound()`.
 */
export async function ItemPage({
  type,
  itemId,
}: {
  type: ApiItemType;
  itemId: string;
}) {
  const data = await apiServerQuery(ItemPageQuery, { itemId, type });
  const result = unwrapResult(data.item, "QueryItemSuccess");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
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

  return (
    <ItemPageView
      item={item}
      cellars={located.cellars}
      cellarsTotal={located.total}
      tierLists={relations.tierLists}
      tierListsTotal={relations.tierListsTotal}
      recipes={itemRecipesFromFragment(node)}
      recipesTotal={recipeIngredientsTotal(node)}
      addableCellars={addable}
      editHref={
        viewerId !== null && item.createdById === viewerId
          ? `${itemPageHref(type, itemId)}/edit`
          : null
      }
    />
  );
}
