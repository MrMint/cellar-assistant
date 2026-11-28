import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { itemViewFromFragment } from "./adapter";
import { ItemPageQuery } from "./fragments";
import { ItemPageView, type SelectedBottle } from "./ItemPageView";
import { loadItemPageData } from "./parts/load-item-page";

/**
 * The page's one `ItemPageQuery`, per request: `generateMetadata` and the
 * page both ask, and React's `cache` makes that one query (X21).
 */
const loadItemPage = cache((type: ApiItemType, itemId: string) =>
  apiServerQuery(ItemPageQuery, { itemId, type }),
);

/** X21: the item's name as the document title; its type when unreadable. */
export async function itemPageMetadata(
  type: ApiItemType,
  itemId: string,
): Promise<Metadata> {
  const result = unwrapResult(
    (await loadItemPage(type, itemId)).item,
    "QueryItemSuccess",
  );
  return {
    title: result.ok
      ? itemViewFromFragment(result.data.data).name
      : itemTypeTokens[type].label,
  };
}

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
  const loaded = await loadItemPageData(
    apiServerQuery,
    type,
    itemId,
    await loadItemPage(type, itemId),
  );
  if (!loaded.ok) {
    if (isNotFound(loaded.error)) notFound();
    return (
      <p role="alert" className="t-body text-destructive">
        {loaded.error.message}
      </p>
    );
  }
  return <ItemPageView {...loaded.data} selected={selected} parent={parent} />;
}
