import { Stack, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { HeaderBar } from "@/components/common/HeaderBar";
import { attributesFrom } from "@/components/item-api/itemFormRules";
import { ViewerQuery } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import {
  ItemAttributesFragment,
  ItemCoreFragment,
  ItemSummaryQuery,
} from "@/lib/api/items";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { formatItemType } from "@/utilities";
import { ItemForm } from "./ItemForm";

/**
 * `/{type}s/[itemId]/edit` and `/cellars/[c]/{type}s/[bottleId]/edit` — new
 * routes kept by decision 2 (the old edit never worked: its button was
 * disabled and its page passed a bottle id to `wines_by_pk`), restyled with
 * the restored form and breadcrumbs.
 *
 * Creator only: `updateItem` refuses anyone else, so the page says so rather
 * than offering a form that cannot save.
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
    return <Typography color="danger">{result.error.message}</Typography>;
  }
  const core = readFragment(ItemCoreFragment, result.data.data);
  const attributes = readFragment(
    ItemAttributesFragment,
    result.data.data,
  ) as unknown as Record<string, unknown>;
  const viewer = await apiServerQuery(ViewerQuery, {});
  const isCreator = viewer.me?.id === core.createdById;

  return (
    <Stack spacing={2}>
      <HeaderBar serverBreadcrumbs={{ cellarName, itemName: core.name }} />
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
        />
      ) : (
        <Stack spacing={1}>
          <Typography level="h3">Not yours to edit</Typography>
          <Typography level="body-sm">
            Only whoever added this {formatItemType(type).toLowerCase()} can
            change it.
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}
