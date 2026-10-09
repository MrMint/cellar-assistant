import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { bottleHref } from "./adapter";
import { CellarBottleItemQuery } from "./fragments";
import { ItemEditPage, itemEditMetadata } from "./ItemEditPage";

/** One `CellarBottleItemQuery` per request, for the page and its title (X21). */
const loadCellarBottleItem = cache((cellarId: string, bottleId: string) =>
  apiServerQuery(CellarBottleItemQuery, { cellarId, bottleId }),
);

/**
 * X21: the edit page's title, from the item the bottle holds — the same
 * cached reads the page itself makes, so no extra query.
 */
export async function cellarItemEditMetadata(
  type: ApiItemType,
  cellarId: string,
  id: string,
): Promise<Metadata> {
  const cellar = unwrapResult(
    (await loadCellarBottleItem(cellarId, id)).cellar,
    "Cellar",
  );
  const item = cellar.ok ? (cellar.data.item?.item ?? null) : null;
  return itemEditMetadata(item?.type ?? type, item?.id ?? id);
}

/**
 * `/cellars/[cellarId]/{type}s/[id]/edit` — the id is the bottle (decision 1);
 * the form edits the item that bottle holds. A bottle of another type goes to
 * its own segment. An id that is not a bottle here is taken as the item id it
 * meant while the URL carried item ids, and saving returns to the bottle URL,
 * which redirects on from there.
 */
export async function CellarItemEditPage({
  type,
  cellarId,
  id,
}: {
  type: ApiItemType;
  cellarId: string;
  id: string;
}) {
  const data = await loadCellarBottleItem(cellarId, id);
  const cellar = unwrapResult(data.cellar, "Cellar");
  if (!cellar.ok) {
    if (isNotFound(cellar.error)) notFound();
    throw new Error(cellar.error.message);
  }
  const bottle = cellar.data.item ?? null;
  if (bottle !== null && bottle.item.type !== type) {
    redirect(`${bottleHref(cellarId, bottle.item.type, bottle.id)}/edit`);
  }

  return (
    <ItemEditPage
      type={type}
      itemId={bottle?.item.id ?? id}
      cellarName={cellar.data.name}
      backHref={bottleHref(cellarId, type, bottle?.id ?? id)}
    />
  );
}
