import { notFound } from "next/navigation";
import { ApiError } from "@/components/cellar-api/ApiError";
import { DeleteTierListButton } from "@/components/tier-list/DeleteTierListButton";
import { EditTierListClient } from "@/components/tier-list/EditTierListClient";
import {
  GetTierListEditQuery,
  TierListViewerQuery,
} from "@/components/tier-list/queries";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/tier-lists/[id]/edit` — the old `EditTierListClient` (`82450ad1`).
 *
 * `NotFoundError` ("no such list" or "not yours to see") is `notFound()`, as
 * the old null `tier_lists_by_pk` was. A viewer who can see the list but did
 * not create it gets a refusal instead of a form whose save would fail
 * (writes are creator-only). Under the form, the kept new-only
 * `DeleteTierListButton`.
 */
export const dynamic = "force-dynamic";

export default async function EditTierListPage({
  params,
}: {
  params: Promise<{ tierListId: string }>;
}) {
  const { tierListId } = await params;
  const [data, viewer] = await Promise.all([
    apiServerQuery(GetTierListEditQuery, { id: tierListId }),
    apiServerQuery(TierListViewerQuery, {}),
  ]);

  const result = unwrapResult(data.tierList, "TierList");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <ApiError error={result.error} title="Could not load" />;
  }
  const tierList = result.data;

  if (viewer.me?.id !== tierList.createdById) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-ink-1 type-title-2">{tierList.name}</h3>
        <p className="text-ink-2 type-callout">
          Only the person who made a tier list can change it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <EditTierListClient tierList={tierList} />
      <div className="flex">
        <DeleteTierListButton
          tierListId={tierList.id}
          name={tierList.name}
          itemCount={tierList.itemCount}
        />
      </div>
    </div>
  );
}
