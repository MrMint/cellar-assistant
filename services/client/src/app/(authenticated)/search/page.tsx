import type { Metadata } from "next";
import { Suspense } from "react";
import {
  type SearchParams,
  searchPageTitle,
  searchStateFromParams,
} from "@/components/search/adapter";
import { SearchPageLayout } from "@/components/search/SearchPageLayout";
import {
  SearchResultsSkeleton,
  SearchSectionsSkeleton,
} from "@/components/search/SearchResultsSkeleton";
import { SearchSheetHeader } from "@/components/search/SearchSheetHeader";
import { ServerBarcodeResults } from "@/components/search/ServerBarcodeResults";
import {
  ExpiredImageSearch,
  ServerImageResults,
} from "@/components/search/ServerImageResults";
import { LookIn } from "@/components/search/sections/LookIn";
import { ScopeRail } from "@/components/search/sections/ScopeRail";
import { UniversalSearchResults } from "@/components/search/UniversalSearchResults";
import { sectionFromParam } from "@/components/search/universal-search";

/**
 * `/search` (Recipes-Search, phone and desktop): the field in a sticky bar,
 * then "Look in" and its six tiles, or the results. Home is `/` ("Today").
 * The board keeps the tab bar here; until `AppShell` stops hiding it on
 * `/search` (hand-off to F2a) the phone keeps the sheet's Close. The URL still works on its own — links, `?q=`, `?barcode=`,
 * `?image=` — and Close goes back to where the sheet was opened from.
 *
 * The landing view's greeting, collection line, Recent Activity and Nearby
 * Places moved to Home with X10 (its Friends and Nearby sections); `?activity=`
 * is no longer read here. Active search (`?q=`, `?barcode=`, `?image=`): the
 * box and the results. Image search (the Photo
 * button, G32) is back: the photo is uploaded and `?image=` carries its file
 * id where the old `?image_results=` carried the rows themselves.
 *
 * A text search is universal search (X12, decisions D9 and D10): sections
 * for your bottles, items, places, recipes, people and brands, three rows
 * each with "See all" (`?in=<section>` opens one in place). It replaced the
 * item grid and the Recipes/Brands tail D1 added.
 *
 * Not restored, each by decision rather than omission:
 *
 * - **The five quick-link chips** (Cellars, Map, Tier Lists, Favorites,
 *   Rankings) — X01 deletes them: every one duplicated a tab (Cellar, Map) or
 *   a row of the Me hub (Tier lists, Loved, Top rated) one thumb-reach away.
 * - **The rewrite's tabs** (brands, people, recipes): D10 restored them as
 *   sections of the one results page instead.
 */
export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<SearchParams>;
}

/** X21: "Search", or what is being searched for. Reads the URL only. */
export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  return { title: searchPageTitle(searchStateFromParams(await searchParams)) };
}

export default async function Search({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const state = searchStateFromParams(resolvedSearchParams);
  const { query, barcode, imageFileId, legacyImageLink, hasActiveSearch } =
    state;
  const focus = sectionFromParam(resolvedSearchParams.in);
  const token =
    barcode !== null
      ? "barcode"
      : imageFileId !== null || legacyImageLink
        ? "photo"
        : null;

  // One frame for every view, so the search box never remounts (N01).
  return (
    <div className="mx-auto w-full max-w-[1320px] animate-in fade-in-0 duration-(--ca-dur-medium) ease-enter">
      <SearchPageLayout
        urlQuery={query}
        header={<SearchSheetHeader />}
        landing={null}
        token={query === null ? token : null}
        scope={focus}
      >
        {!hasActiveSearch &&
          (focus === null ? <LookIn /> : <ScopeRail query="" focus={focus} />)}

        {hasActiveSearch && (
          <div className="flex flex-col gap-6 pb-6">
            {imageFileId !== null && (
              <Suspense fallback={<SearchResultsSkeleton />}>
                <ServerImageResults imageFileId={imageFileId} />
              </Suspense>
            )}

            {imageFileId === null && legacyImageLink && <ExpiredImageSearch />}

            {barcode !== null && (
              <Suspense fallback={<SearchResultsSkeleton />}>
                <ServerBarcodeResults code={barcode} />
              </Suspense>
            )}

            {/* X12 (D9, D10): one page of sections — Your bottles · Drinks ·
                Places · Recipes · People · Brands — or the one "See all"
                opened. The box above is the same element throughout (N01). */}
            {/* Unkeyed: a search navigation is a transition, so the results
                on screen stay (dimmed) until the next ones arrive instead of
                falling back to the skeleton (Recipes-Search ruling 3). */}
            {query !== null && (
              <Suspense fallback={<SearchSectionsSkeleton />}>
                <UniversalSearchResults query={query} focus={focus} />
              </Suspense>
            )}
          </div>
        )}
      </SearchPageLayout>
    </div>
  );
}
