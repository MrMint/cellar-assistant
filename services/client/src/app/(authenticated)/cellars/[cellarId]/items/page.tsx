import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { canAddToCellar } from "@/components/cellar/adapter";
import { CellarItemsControls } from "@/components/cellar/CellarItemsControls";
import { CellarItemsGridServer } from "@/components/cellar/CellarItemsGridServer";
import { CellarItemsGridSkeleton } from "@/components/cellar/CellarItemsGridSkeleton";
import { filterCountsFromItemCounts } from "@/components/cellar/cellarItemCounts";
import { DEFAULT_CELLAR_STATUS } from "@/components/cellar/cellarItemsQuery";
import { EmptyCellar } from "@/components/cellar/EmptyCellar";
import {
  CellarInfoFragment,
  GetCellarInfoQuery,
} from "@/components/cellar/fragments";
import { ViewerQuery } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  itemsSearchParamsCache,
  parseCellarSort,
  parseCellarStatus,
  parseItemTypes,
} from "./searchParams";

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

/** One cellar header read per request, for the page and its title (X21). */
const loadCellarInfo = cache((cellarId: string) =>
  apiServerQuery(GetCellarInfoQuery, { cellarId }),
);

export async function generateMetadata({
  params,
}: Pick<CellarItemsPageProps, "params">): Promise<Metadata> {
  const { cellarId } = await params;
  const result = unwrapResult(
    (await loadCellarInfo(cellarId)).cellar,
    "Cellar",
  );
  return {
    title: result.ok
      ? readFragment(CellarInfoFragment, result.data).name
      : "Cellar",
  };
}

export default async function CellarItemsPage({
  params,
  searchParams,
}: CellarItemsPageProps) {
  const { cellarId } = await params;

  // Parse search params using nuqs cache with validation
  const resolvedSearchParams = await searchParams;
  const parsed = itemsSearchParamsCache.parse(resolvedSearchParams);
  const { search, types } = parsed;
  const validTypes = parseItemTypes(types);
  const sort = parseCellarSort(parsed.sort);
  const status = parseCellarStatus(parsed.status);

  // Fetch cellar metadata immediately (for header)
  const [data, viewer] = await Promise.all([
    loadCellarInfo(cellarId),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(data.cellar, "Cellar");
  if (!result.ok) {
    // §1.6: "no such cellar" and "not yours to see" are one answer.
    if (isNotFound(result.error)) notFound();
    return (
      <p role="alert" className="type-body text-destructive">
        {result.error.message}
      </p>
    );
  }

  const cellar = readFragment(CellarInfoFragment, result.data);
  const canAdd = canAddToCellar(cellar, viewer.me?.id ?? null);
  const counts = filterCountsFromItemCounts(cellar.itemCounts);
  // Nothing in it at all, and no search, filter or status segment that could
  // explain that: the first-run state (N15) without a round trip for an empty
  // grid. `itemCounts` counts non-empty bottles, i.e. the default "In cellar"
  // segment, so "Finished" and "All" still go to the grid. Same copy as the
  // grid's own empty state (`EmptyCellar` is `CellarItemsEmpty`).
  const empty =
    cellar.itemCounts.total === 0 &&
    search === "" &&
    validTypes.length === 0 &&
    status === DEFAULT_CELLAR_STATUS;

  return (
    <div className="flex flex-col gap-4">
      {/* Header renders immediately */}
      <CellarItemsControls
        cellarId={cellarId}
        cellarName={cellar.name}
        counts={counts}
        canAdd={canAdd}
        initialSearch={search}
        initialTypes={validTypes}
        initialSort={sort}
        initialStatus={status}
      />

      {empty ? (
        <EmptyCellar cellarId={cellarId} canAdd={canAdd} />
      ) : (
        /* Items grid streams in with Suspense */
        <Suspense
          key={`${search}-${JSON.stringify(types)}-${sort}-${status}`}
          fallback={<CellarItemsGridSkeleton />}
        >
          <CellarItemsGridServer
            cellarId={cellarId}
            search={search}
            types={validTypes}
            sort={sort}
            status={status}
            canAdd={canAdd}
          />
        </Suspense>
      )}
    </div>
  );
}
