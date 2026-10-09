import { notFound } from "next/navigation";
import { Suspense } from "react";
import { canAddToCellar, cellarGroupCell } from "@/components/cellar/adapter";
import { CellarDashboard } from "@/components/cellar/CellarDashboard";
import { CellarItemsControls } from "@/components/cellar/CellarItemsControls";
import { CellarItemsGridServer } from "@/components/cellar/CellarItemsGridServer";
import { CellarItemsGridSkeleton } from "@/components/cellar/CellarItemsGridSkeleton";
import { CellarSearchElsewhere } from "@/components/cellar/CellarSearchElsewhere";
import { filterCountsFromItemCounts } from "@/components/cellar/cellarItemCounts";
import { DEFAULT_CELLAR_STATUS } from "@/components/cellar/cellarItemsQuery";
import { dashboardHasContent } from "@/components/cellar/dashboard";
import { EmptyCellar } from "@/components/cellar/EmptyCellar";
import { FinishedDiaryServer } from "@/components/cellar/FinishedDiaryServer";
import {
  CellarInfoFragment,
  GetCellarHomeQuery,
  GetCellarInfoQuery,
} from "@/components/cellar/fragments";
import { ViewerQuery } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getTimeZoneFromCookie } from "@/lib/time-zone/server";
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

/** How many bottles each dashboard shelf holds. */
const SHELF_SIZE = 12;

/**
 * `/cellars/[cellarId]/items` — **the cellar home** (X04, D3): the bar and
 * the search, then a dashboard (open now with Pour, the numbers, pours per
 * month, recently added), then the collection: the status segment, type
 * chips, sort, and the grid — identical bottles grouped ×N — or, under
 * "Finished", the diary. The old overview at `/cellars/[cellarId]` redirects
 * here (D3: "merge it into the cellar page").
 *
 * A search hides the dashboard, narrows the collection, and asks your other
 * cellars by name too ("Lagavulin is in Bar Cart"). The grid and the diary
 * stream under `Suspense`, keyed on the search and filters, so a change
 * shows the skeleton rather than stale cards.
 */
export const dynamic = "force-dynamic";

export default async function CellarItemsPage({
  params,
  searchParams,
}: CellarItemsPageProps) {
  const { cellarId } = await params;

  const resolvedSearchParams = await searchParams;
  const parsed = itemsSearchParamsCache.parse(resolvedSearchParams);
  const { search, types } = parsed;
  const validTypes = parseItemTypes(types);
  const sort = parseCellarSort(parsed.sort);
  const status = parseCellarStatus(parsed.status);
  const searching = search.trim() !== "";

  const cookieZone = await getTimeZoneFromCookie();
  const [home, viewer] = await Promise.all([
    searching
      ? apiServerQuery(GetCellarInfoQuery, { cellarId }).then((data) => ({
          cellar: data.cellar,
          home: null,
        }))
      : apiServerQuery(GetCellarHomeQuery, {
          cellarId,
          timeZone: cookieZone,
          shelf: SHELF_SIZE,
        }).then((data) => ({ cellar: data.cellar, home: data.cellar })),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(home.cellar, "Cellar");
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
  const asOf = Date.now();

  const homeData =
    home.home === null ? null : unwrapResult(home.home, "Cellar");
  const dashboard =
    homeData === null || !homeData.ok ? null : homeData.data.dashboard;
  const timeZone = dashboard?.timeZone ?? cookieZone ?? "UTC";

  // Nothing in it at all, and no search, filter or status segment that could
  // explain that: the first-run state (N15) without a round trip for an empty
  // grid. Same copy as the grid's own empty state.
  const empty =
    cellar.itemCounts.total === 0 &&
    cellar.finishedCount === 0 &&
    !searching &&
    validTypes.length === 0 &&
    status === DEFAULT_CELLAR_STATUS;

  const dashboardNode =
    dashboard !== null && homeData?.ok && dashboardHasContent(dashboard) ? (
      <CellarDashboard
        cellarId={cellarId}
        data={dashboard}
        typeCounts={{
          WINE: cellar.itemCounts.wine,
          BEER: cellar.itemCounts.beer,
          SPIRIT: cellar.itemCounts.spirit,
          SAKE: cellar.itemCounts.sake,
          COFFEE: cellar.itemCounts.coffee,
          TEA: cellar.itemCounts.tea,
        }}
        openNow={homeData.data.openNow.edges.map((edge) =>
          cellarGroupCell(edge.node),
        )}
        openCount={dashboard.openCount}
        recent={homeData.data.recent.edges.map((edge) =>
          cellarGroupCell(edge.node),
        )}
        asOf={asOf}
      />
    ) : undefined;

  const suspenseKey = `${search}-${JSON.stringify(types)}-${sort}-${status}`;

  return (
    <div className="flex flex-col gap-4">
      <CellarItemsControls
        cellarId={cellarId}
        cellarName={cellar.name}
        counts={counts}
        canAdd={canAdd}
        initialSearch={search}
        initialTypes={validTypes}
        initialSort={sort}
        initialStatus={status}
        finishedCount={cellar.finishedCount}
        dashboard={dashboardNode}
      />

      {empty ? (
        <EmptyCellar cellarId={cellarId} canAdd={canAdd} />
      ) : status === "finished" ? (
        <Suspense key={suspenseKey} fallback={<CellarItemsGridSkeleton />}>
          <FinishedDiaryServer
            cellarId={cellarId}
            search={search}
            types={validTypes}
            timeZone={timeZone}
            canAdd={canAdd}
          />
        </Suspense>
      ) : (
        <Suspense key={suspenseKey} fallback={<CellarItemsGridSkeleton />}>
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

      {searching && (
        <Suspense key={`elsewhere-${search}`} fallback={null}>
          <CellarSearchElsewhere cellarId={cellarId} search={search} />
        </Suspense>
      )}
    </div>
  );
}
