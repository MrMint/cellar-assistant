import { Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { AddItemClient } from "@/components/cellar/AddItemClient";
import { canAddToCellar } from "@/components/cellar/adapter";
import {
  CellarCardFragment,
  CellarHeaderQuery,
  ViewerQuery,
} from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/cellars/[cellarId]/items/add` — the old `AddItemClient` (`82450ad1`),
 * with the cellar's name and owners read here rather than by a client query.
 */
export const dynamic = "force-dynamic";

export default async function Add({
  params,
}: {
  params: Promise<{ cellarId: string }>;
}) {
  const { cellarId } = await params;
  const [header, viewer] = await Promise.all([
    apiServerQuery(CellarHeaderQuery, { cellarId }),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(header.cellar, "Cellar");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }
  const cellar = readFragment(CellarCardFragment, result.data);

  return (
    <AddItemClient
      cellarId={cellarId}
      cellarName={cellar.name}
      canAdd={canAddToCellar(cellar, viewer.me?.id ?? null)}
    />
  );
}
