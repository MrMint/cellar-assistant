import { notFound } from "next/navigation";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { attributesFrom } from "@/components/item-api/itemFormRules";
import { ViewerQuery } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { ItemCorrectionQuery } from "@/lib/api/item-correction";
import {
  ItemAttributesFragment,
  ItemCoreFragment,
  ItemSummaryQuery,
} from "@/lib/api/items";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { formatItemType } from "@/utilities";
import { displayItemName } from "@/utilities/smart-title-case";
import { shownBrandOf } from "./brand-change";
import { ItemAppBar } from "./ItemAppBar";
import { ItemForm } from "./ItemForm";

/**
 * `/{type}s/[itemId]/edit` and `/cellars/[c]/{type}s/[bottleId]/edit` — new
 * routes kept by decision 2 (the old edit never worked: its button was
 * disabled and its page passed a bottle id to `wines_by_pk`), restyled with
 * the restored form and breadcrumbs. The header is `ItemAppBar` (N26): Back
 * to the page the edit was opened from, "Edit <name>" as the title on phones,
 * where the crumbs are hidden, and the crumbs from `md` up.
 *
 * Creator only: `updateItem` refuses anyone else, so the page says so rather
 * than offering a form that cannot save.
 *
 * X19: the form also gets the item's brand (`ItemCorrectionQuery`) for its
 * BrandPicker, and which AI helpers — re-read the label, suggest details — it
 * can offer the creator.
 */
export async function ItemEditPage({
  type,
  itemId,
  cellarName,
  backHref,
}: {
  type: ApiItemType;
  itemId: string;
  cellarName?: string;
  backHref: string;
}) {
  const data = await apiServerQuery(ItemSummaryQuery, { itemId, type });
  const result = unwrapResult(data.item, "QueryItemSuccess");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return (
      <p role="alert" className="type-body text-destructive">
        {result.error.message}
      </p>
    );
  }
  const core = readFragment(ItemCoreFragment, result.data.data);
  const attributes = readFragment(
    ItemAttributesFragment,
    result.data.data,
  ) as unknown as Record<string, unknown>;
  const [viewer, extras] = await Promise.all([
    apiServerQuery(ViewerQuery, {}),
    apiServerQuery(ItemCorrectionQuery, { itemId, type }),
  ]);
  const isCreator = viewer.me?.id === core.createdById;
  // X19: the brand the form starts from, and the AI helpers it may offer.
  // A failed read leaves both out rather than failing the page: the form
  // still edits the item's own columns.
  const correction = unwrapResult(extras.item, "QueryItemSuccess");
  const brand = correction.ok
    ? shownBrandOf(correction.data.data.brands.edges.map((edge) => edge.node))
    : undefined;
  const tools = correction.ok ? correction.data.data.correction : null;

  const itemName = displayItemName(core.name);

  return (
    <div className="flex flex-col gap-4">
      <ItemAppBar
        parent={backHref}
        title={`Edit ${itemName}`}
        cellarName={cellarName}
        itemName={itemName}
      />
      {isCreator ? (
        <ItemForm
          id={core.id}
          type={type}
          defaultValues={{
            name: core.name,
            description: core.description ?? "",
            country: core.country ?? "",
            attributes: attributesFrom(attributes, type),
          }}
          onSavedHref={backHref}
          brand={brand}
          correction={
            tools === null
              ? null
              : {
                  canRereadLabel: tools.canRereadLabel,
                  canSuggestDetails: tools.canSuggestDetails,
                }
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="type-title-2 text-ink-1">Not yours to edit</h2>
          <p className="type-callout text-ink-2">
            Only whoever added this {formatItemType(type).toLowerCase()} can
            change it.
          </p>
        </div>
      )}
    </div>
  );
}
