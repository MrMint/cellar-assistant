import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppBar } from "@/components/app/AppBar";
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
 * `/tier-lists/[id]/edit` — List details as a page (Social-Lists 08; the
 * list page opens the same form as a sheet).
 *
 * `NotFoundError` ("no such list" or "not yours to see") is `notFound()`, as
 * the old null `tier_lists_by_pk` was. A viewer who can see the list but did
 * not create it gets a refusal instead of a form whose save would fail
 * (writes are creator-only). Under the form, the kept new-only
 * `DeleteTierListButton`.
 */
export const dynamic = "force-dynamic";

/** One edit read per request, for the page and its title (X21). */
const loadTierListEdit = cache((tierListId: string) =>
  apiServerQuery(GetTierListEditQuery, { id: tierListId }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tierListId: string }>;
}): Promise<Metadata> {
  const { tierListId } = await params;
  const result = unwrapResult(
    (await loadTierListEdit(tierListId)).tierList,
    "TierList",
  );
  return { title: result.ok ? `${result.data.name} details` : "List details" };
}

export default async function EditTierListPage({
  params,
}: {
  params: Promise<{ tierListId: string }>;
}) {
  const { tierListId } = await params;
  const [data, viewer] = await Promise.all([
    loadTierListEdit(tierListId),
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
        <AppBar title={tierList.name} parent={`/tier-lists/${tierList.id}`} />
        <p className="t-body m-0 text-ink-2">
          Only the list's maker can change it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-[600px] flex-col gap-6">
      {/* X21: the page's h1, and Back to the list on a cold open. */}
      <AppBar title="List details" parent={`/tier-lists/${tierList.id}`} />
      <EditTierListClient tierList={tierList} />
      <div className="border-edge border-t pt-2">
        <DeleteTierListButton
          tierListId={tierList.id}
          name={tierList.name}
          itemCount={tierList.itemCount}
          listType={tierList.listType}
        />
      </div>
    </div>
  );
}
