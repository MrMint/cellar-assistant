import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { canAddToCellar } from "@/components/cellar/adapter";
import { EditCellarClient } from "@/components/cellar/EditCellarClient";
import { GetCellarEditQuery } from "@/components/cellar/fragments";
import { ViewerQuery } from "@/lib/api/cellars";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/cellars/[cellarId]/edit` — the old `EditCellarClient` (`82450ad1`).
 *
 * The old page had no owner check (§7): anyone who could see a cellar got a
 * form whose save then failed. `updateCellar` is the authority; this gate is
 * the courtesy of not offering a form that cannot work.
 */
export const dynamic = "force-dynamic";

/** One edit read per request, for the page and its title (X21). */
const loadCellarEdit = cache((cellarId: string) =>
  apiServerQuery(GetCellarEditQuery, { cellarId }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}): Promise<Metadata> {
  const { cellarId } = await params;
  const result = unwrapResult(
    (await loadCellarEdit(cellarId)).cellar,
    "Cellar",
  );
  return { title: result.ok ? `Edit ${result.data.name}` : "Edit cellar" };
}

export default async function EditCellar({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  const [data, viewer] = await Promise.all([
    loadCellarEdit(cellarId),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(data.cellar, "Cellar");
  if (!result.ok) {
    // §1.6: "no such cellar" and "not yours to see" are the same answer.
    if (isNotFound(result.error)) notFound();
    return (
      <p role="alert" className="type-body text-destructive">
        {result.error.message}
      </p>
    );
  }

  const cellar = result.data;
  const me = viewer.me;
  if (!canAddToCellar(cellar, me?.id ?? null)) {
    return (
      <p className="type-body">
        You do not have permission to edit this cellar.
      </p>
    );
  }

  return (
    <EditCellarClient
      cellar={{
        id: cellar.id,
        name: cellar.name,
        privacy: cellar.privacy,
        createdById: cellar.createdById,
        coOwnerIds: cellar.coOwnerIds,
        coOwners: cellar.coOwners.edges.map((edge) => edge.node),
        itemCount: cellar.itemCount,
      }}
      viewer={
        me === null || me === undefined
          ? null
          : {
              id: me.id,
              displayName: me.profile?.displayName ?? me.email ?? "",
              avatarUrl: me.profile?.avatarUrl ?? null,
            }
      }
    />
  );
}
