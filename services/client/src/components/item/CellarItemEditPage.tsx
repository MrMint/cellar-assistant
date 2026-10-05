import { notFound, redirect } from "next/navigation";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { bottleHref } from "./adapter";
import { CellarBottleItemQuery } from "./fragments";
import { ItemEditPage } from "./ItemEditPage";

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
  const data = await apiServerQuery(CellarBottleItemQuery, {
    cellarId,
    bottleId: id,
  });
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
