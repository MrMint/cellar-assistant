import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Camera, Cellar } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { canAddToCellar } from "@/components/cellar/adapter";
import { CellarItemsControls } from "@/components/cellar/CellarItemsControls";
import { CellarItemsGridServer } from "@/components/cellar/CellarItemsGridServer";
import { CellarItemsGridSkeleton } from "@/components/cellar/CellarItemsGridSkeleton";
import { filterCountsFromItemCounts } from "@/components/cellar/cellarItemCounts";
import {
  CellarInfoFragment,
  GetCellarInfoQuery,
} from "@/components/cellar/fragments";
import { Button } from "@/components/ui/button";
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
    return (
      <p role="alert" className="type-body text-destructive">
        {result.error.message}
      </p>
    );
  }

  const cellar = readFragment(CellarInfoFragment, result.data);
  const canAdd = canAddToCellar(cellar, viewer.me?.id ?? null);
  const counts = filterCountsFromItemCounts(cellar.itemCounts);
  // Nothing in it at all, and no search or filter that could explain that:
  // the first-run state (N15) instead of an empty grid.
  const empty =
    cellar.itemCounts.total === 0 && search === "" && validTypes.length === 0;

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
      />

      {empty ? (
        <EmptyCellar cellarId={cellarId} canAdd={canAdd} />
      ) : (
        /* Items grid streams in with Suspense */
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
      )}
    </div>
  );
}

/**
 * An empty cellar (N15, design §3.6): one line and one action — snap the
 * first bottle in. A viewer who may not add to it (a friend) gets the line
 * alone.
 */
function EmptyCellar({
  cellarId,
  canAdd,
}: {
  cellarId: string;
  canAdd: boolean;
}) {
  return canAdd ? (
    <EmptyState
      illustration={<Cellar aria-hidden strokeWidth={1.5} />}
      title="Your cellar is waiting."
      description="Snap a label and the bottle is in."
      action={
        <Button asChild>
          <Link href={`/cellars/${cellarId}/items/add`} underline="none">
            <Camera aria-hidden />
            Snap a bottle
          </Link>
        </Button>
      }
    />
  ) : (
    <EmptyState
      illustration={<Cellar aria-hidden strokeWidth={1.5} />}
      title="Nothing in this cellar yet."
    />
  );
}
