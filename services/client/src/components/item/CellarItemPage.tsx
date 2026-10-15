import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { cellarItemRedirect, isCellarOwner } from "./adapter";
import { CellarBottleForQuery, CellarItemPageQuery } from "./fragments";
import { ItemPage, itemPageMetadata } from "./ItemPage";

/** One `CellarItemPageQuery` per request, for the page and its title (X21). */
const loadCellarItemPage = cache((cellarId: string, bottleId: string) =>
  apiServerQuery(CellarItemPageQuery, { cellarId, bottleId }),
);

/**
 * X21: the bottle's item name as the document title — the item page's own
 * (cached) read, since X09 renders that page; its type when the id is not a
 * bottle here (the page redirects on, and the next page names it).
 */
export async function cellarItemPageMetadata(
  type: ApiItemType,
  cellarId: string,
  id: string,
): Promise<Metadata> {
  const cellar = unwrapResult(
    (await loadCellarItemPage(cellarId, id)).cellar,
    "Cellar",
  );
  const bottle = cellar.ok ? (cellar.data.item ?? null) : null;
  return bottle === null
    ? { title: itemTypeTokens[type].label }
    : itemPageMetadata(type, bottle.item.id);
}

/**
 * `/cellars/[cellarId]/{type}s/[id]` for all six types — one **bottle**.
 *
 * X09: the bottle route *is* the item page now, with this bottle selected —
 * the URL keeps its meaning (D-gating answer 1: a bottle id means a bottle;
 * decision 1: the id is a `cellar_items.id`), so every link and bookmark
 * minted for the old bottle page still opens it, and Back still goes to the
 * cellar. What used to be a second, different page is the item's page with
 * the bottle marked in "Your bottles", its level inline, its photo in the
 * hero, and "Delete bottle" in `⋯`.
 *
 * An id that is not a bottle of this type here goes through
 * `cellarItemRedirect`, as before: a bottle of another type to its own
 * segment, a catalog item id with one bottle here (`Cellar.bottleFor`) to
 * that bottle, anything else to the item page.
 */
export async function CellarItemPage({
  type,
  cellarId,
  id,
}: {
  type: ApiItemType;
  cellarId: string;
  id: string;
}) {
  const data = await loadCellarItemPage(cellarId, id);
  const cellarResult = unwrapResult(data.cellar, "Cellar");
  if (!cellarResult.ok) {
    if (isNotFound(cellarResult.error)) notFound();
    return (
      <p role="alert" className="type-body text-destructive">
        {cellarResult.error.message}
      </p>
    );
  }
  const cellar = cellarResult.data;
  const bottle = cellar.item ?? null;

  let bottleForId: string | null = null;
  if (bottle === null) {
    const lookup = await apiServerQuery(CellarBottleForQuery, {
      cellarId,
      itemId: id,
      type,
    });
    const found = unwrapResult(lookup.cellar, "Cellar");
    bottleForId = found.ok ? (found.data.bottleFor?.id ?? null) : null;
  }

  const target = cellarItemRedirect({
    cellarId,
    type,
    id,
    bottle:
      bottle === null
        ? null
        : { id: bottle.id, itemType: bottle.item.type as ApiItemType },
    bottleForId,
  });
  if (target !== null) redirect(target);
  if (bottle === null) notFound();

  const viewerId = data.me?.id ?? null;
  return (
    <ItemPage
      type={type}
      itemId={bottle.item.id}
      parent={`/cellars/${cellarId}/items`}
      selected={{
        id: bottle.id,
        cellarId,
        cellarName: cellar.name,
        openAt: (bottle.openAt as string | null) ?? null,
        emptyAt: (bottle.emptyAt as string | null) ?? null,
        percentageRemaining: bottle.percentageRemaining,
        isOwner: isCellarOwner(cellar, viewerId),
        displayImage:
          bottle.displayImage === null || bottle.displayImage === undefined
            ? null
            : {
                url: bottle.displayImage.file.url,
                placeholder: bottle.displayImage.placeholder ?? null,
              },
      }}
    />
  );
}
