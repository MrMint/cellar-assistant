import { Typography } from "@mui/joy";
import { notFound } from "next/navigation";
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

export default async function EditCellar({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  const [data, viewer] = await Promise.all([
    apiServerQuery(GetCellarEditQuery, { cellarId }),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(data.cellar, "Cellar");
  if (!result.ok) {
    // §1.6: "no such cellar" and "not yours to see" are the same answer.
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }

  const cellar = result.data;
  const me = viewer.me;
  if (!canAddToCellar(cellar, me?.id ?? null)) {
    return (
      <Typography level="body-md">
        You do not have permission to edit this cellar.
      </Typography>
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
