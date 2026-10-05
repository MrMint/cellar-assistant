import { Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  addableCellars,
  itemPageHref,
  itemRecipesFromFragment,
  itemRelationsFromFragment,
  itemViewFromFragment,
} from "./adapter";
import { ItemPageQuery } from "./fragments";
import { ItemPageView } from "./ItemPageView";

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
  const item = itemViewFromFragment(result.data.data);
  const relations = itemRelationsFromFragment(result.data.data);
  const cellars = unwrapResult(data.myCellars, "CellarConnection");

  return (
    <ItemPageView
      item={item}
      cellars={relations.cellars}
      tierLists={relations.tierLists}
      recipes={itemRecipesFromFragment(result.data.data)}
      addableCellars={
        cellars.ok
          ? addableCellars(
              cellars.data.edges.map((edge) => edge.node),
              viewerId,
            )
          : []
      }
      editHref={
        viewerId !== null && item.createdById === viewerId
          ? `${itemPageHref(type, itemId)}/edit`
          : null
      }
    />
  );
}
