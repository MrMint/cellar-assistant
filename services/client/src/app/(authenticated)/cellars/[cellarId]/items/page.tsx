import { Box, Stack, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { canAddToCellar } from "@/components/cellar/adapter";
import { CellarItemsControls } from "@/components/cellar/CellarItemsControls";
import { CellarItemsGridServer } from "@/components/cellar/CellarItemsGridServer";
import { CellarItemsGridSkeleton } from "@/components/cellar/CellarItemsGridSkeleton";
import { filterCountsFromItemCounts } from "@/components/cellar/cellarItemCounts";
import {
  CellarInfoFragment,
  GetCellarInfoQuery,
} from "@/components/cellar/fragments";
import { ViewerQuery } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { itemsSearchParamsCache, parseItemTypes } from "./searchParams";

interface CellarItemsPageProps {
  params: Promise<{ cellarId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/cellars/[cellarId]/items` — the old page (`82450ad1`): `CellarItemsControls`
 * renders at once, the grid streams in under `Suspense`, keyed on the search
 * and filter so a change shows the skeleton rather than stale cards.
 */
export const dynamic = "force-dynamic";

export default async function CellarItemsPage({
  params,
  searchParams,
}: CellarItemsPageProps) {
  const { cellarId } = await params;

  // Parse search params using nuqs cache with validation
  const resolvedSearchParams = await searchParams;
  const { search, types } = itemsSearchParamsCache.parse(resolvedSearchParams);
  const validTypes = parseItemTypes(types);

  // Fetch cellar metadata immediately (for header)
  const [data, viewer] = await Promise.all([
    apiServerQuery(GetCellarInfoQuery, { cellarId }),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(data.cellar, "Cellar");
  if (!result.ok) {
    // §1.6: "no such cellar" and "not yours to see" are one answer.
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }

  const cellar = readFragment(CellarInfoFragment, result.data);
  const canAdd = canAddToCellar(cellar, viewer.me?.id ?? null);
  const counts = filterCountsFromItemCounts(cellar.itemCounts);

  return (
    <Box>
      <Stack spacing={2}>
        {/* Header renders immediately */}
        <CellarItemsControls
          cellarId={cellarId}
          cellarName={cellar.name}
          counts={counts}
          canAdd={canAdd}
          initialSearch={search}
          initialTypes={validTypes}
        />

        {/* Items grid streams in with Suspense */}
        <Suspense
          key={`${search}-${JSON.stringify(types)}`}
          fallback={<CellarItemsGridSkeleton />}
        >
          <CellarItemsGridServer
            cellarId={cellarId}
            search={search}
            types={validTypes}
          />
        </Suspense>
      </Stack>
    </Box>
  );
}
