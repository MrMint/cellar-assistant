import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { ErrorState } from "@/components/app/EmptyState";
import { canAddToCellar } from "@/components/cellar/adapter";
import { CellarItemsGridSkeleton } from "@/components/cellar/CellarItemsGridSkeleton";
import { CellarSearchElsewhere } from "@/components/cellar/CellarSearchElsewhere";
import type { CellarStatus } from "@/components/cellar/cellarItemsQuery";
import { FinishedDiaryServer } from "@/components/cellar/FinishedDiaryServer";
import {
  CellarInfoFragment,
  GetCellarInfoQuery,
} from "@/components/cellar/fragments";
import { CellarList } from "@/components/cellar/list/CellarList";
import { EmptyShelf } from "@/components/cellar/list/EmptyShelf";
import {
  loadNeedsDetailsCount,
  loadWholeCellar,
} from "@/components/cellar/list/load";
import { ViewerQuery } from "@/lib/api/cellars";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getTimeZoneFromCookie } from "@/lib/time-zone/server";
import {
  itemsSearchParamsCache,
  parseCellarStatus,
  parseItemTypes,
} from "./searchParams";

interface CellarItemsPageProps {
  params: Promise<{ cellarId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/cellars/[cellarId]/items` — the cellar list (C1; boards
 * combined/Cellar-flow, areas/Cellars-Shelves, desktop/Cellar): the name and
 * its bottles, the search and Arrange, the Open and kind counts, the
 * Needs-details count, then every bottle as the Arrange sheet says (A–Z,
 * by maker, by style, shelves, or a sort). The old overview at
 * `/cellars/[cellarId]` redirects here.
 *
 * The server reads the whole cellar (`loadWholeCellar`); arranging and
 * filtering happen on the client, so they are instant and the URL keeps
 * them (`?sort=`, `?types=`, `?open=1`, `?view=rows`). A search and the Show
 * segment (`?search=`, `?status=`) read again: a search narrows by name and
 * meaning, and asks your other cellars too ("Lagavulin is in Bar Cart").
 * Under "Finished" the list is the diary.
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
  const parsed = itemsSearchParamsCache.parse(await searchParams);
  const search = parsed.search;
  const status = parseCellarStatus(parsed.status);
  const searching = search.trim() !== "";
  const finished = status === "finished";

  const [info, viewer, whole, needsDetails, timeZone] = await Promise.all([
    loadCellarInfo(cellarId),
    apiServerQuery(ViewerQuery, {}),
    finished ? null : loadWholeCellar(cellarId, { search, status }),
    loadNeedsDetailsCount(cellarId),
    getTimeZoneFromCookie(),
  ]);

  const result = unwrapResult(info.cellar, "Cellar");
  if (!result.ok) {
    // §1.6: "no such cellar" and "not yours to see" are one answer.
    if (isNotFound(result.error)) notFound();
    return (
      <ErrorState
        title="Can't open this cellar"
        reason={result.error.message}
      />
    );
  }
  if (whole !== null && !whole.ok) {
    return (
      <ErrorState title="Can't load the bottles" reason={whole.error.message} />
    );
  }

  const cellar = readFragment(CellarInfoFragment, result.data);
  const canAdd = canAddToCellar(cellar, viewer.me?.id ?? null);
  const inCellar = cellar.itemCounts.total;
  const statusCounts: Record<CellarStatus, number> = {
    "in-cellar": inCellar,
    finished: cellar.finishedCount,
    all: inCellar + cellar.finishedCount,
  };
  const empty = inCellar === 0 && cellar.finishedCount === 0;

  const body = empty ? (
    <EmptyShelf cellarId={cellarId} cellarName={cellar.name} canAdd={canAdd} />
  ) : finished ? (
    <Suspense key={`diary-${search}`} fallback={<CellarItemsGridSkeleton />}>
      <FinishedDiaryServer
        cellarId={cellarId}
        search={search}
        types={parseItemTypes(parsed.types)}
        timeZone={timeZone ?? "UTC"}
        canAdd={canAdd}
      />
    </Suspense>
  ) : undefined;

  return (
    <CellarList
      cellarId={cellarId}
      cellarName={cellar.name}
      bottles={whole?.bottles ?? []}
      bottleCount={statusCounts[status]}
      capped={whole?.capped ?? false}
      search={search}
      status={status}
      statusCounts={statusCounts}
      needsDetails={needsDetails}
      canEdit={canAdd}
      body={body}
      elsewhere={
        searching ? (
          <Suspense key={`elsewhere-${search}`} fallback={null}>
            <CellarSearchElsewhere cellarId={cellarId} search={search} />
          </Suspense>
        ) : undefined
      }
    />
  );
}
