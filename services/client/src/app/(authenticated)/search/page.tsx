import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
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
import {
  SearchHint,
  SearchSheetHeader,
} from "@/components/search/SearchSheetHeader";
import { ServerBarcodeResults } from "@/components/search/ServerBarcodeResults";
import {
  ExpiredImageSearch,
  ServerImageResults,
} from "@/components/search/ServerImageResults";
import { UniversalSearchResults } from "@/components/search/UniversalSearchResults";
import { sectionFromParam } from "@/components/search/universal-search";

/**
 * `/search` — the search **sheet** (X10). Home is `/` now ("Today"), and
 * search is a full-screen sheet over the app, opened from Home's field or a
 * second tap on Home: a title and Close in place of the tab bar
 * (`AppShell` hides it here), the box, then what it looks through or the
 * results. The URL still works on its own — links, `?q=`, `?barcode=`,
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

  // One frame for both views, so the search box never remounts (N01). The
  // sheet slides up once, when it opens; typing keeps the same page.
  return (
    <div className="mx-auto w-full max-w-[720px] animate-in fade-in-0 slide-in-from-bottom-4 duration-(--ca-dur-medium) ease-enter motion-reduce:slide-in-from-bottom-0">
      <SearchPageLayout
        urlQuery={query}
        header={<SearchSheetHeader />}
        landing={null}
      >
        {!hasActiveSearch && <SearchHint />}

        {hasActiveSearch && (
          <div className="flex flex-col gap-6">
            {imageFileId !== null && (
              <ResultsSection title="Image search results">
                <Suspense fallback={<SearchResultsSkeleton />}>
                  <ServerImageResults imageFileId={imageFileId} />
                </Suspense>
              </ResultsSection>
            )}

            {imageFileId === null && legacyImageLink && (
              <ResultsSection title="Image search results">
                <ExpiredImageSearch />
              </ResultsSection>
            )}

            {barcode !== null && (
              <ResultsSection title="Barcode search results">
                <Suspense fallback={<SearchResultsSkeleton />}>
                  <ServerBarcodeResults code={barcode} />
                </Suspense>
              </ResultsSection>
            )}

            {/* X12 (D9, D10): one page of sections — Your bottles · Items ·
                Places · Recipes · People · Brands — or the one "See all"
                opened. The box above is the same element throughout (N01). */}
            {query !== null && (
              <Suspense
                key={`${focus ?? "all"}:${query}`}
                fallback={<SearchSectionsSkeleton />}
              >
                <UniversalSearchResults query={query} focus={focus} />
              </Suspense>
            )}
          </div>
        )}
      </SearchPageLayout>
    </div>
  );
}

/** One block of results under its heading. */
function ResultsSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-headline text-ink-1">{title}</h2>
      {children}
    </section>
  );
}
