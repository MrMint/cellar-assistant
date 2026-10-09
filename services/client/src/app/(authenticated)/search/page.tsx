import { type ReactNode, Suspense } from "react";
import {
  type SearchParams,
  searchStateFromParams,
} from "@/components/search/adapter";
import { ServerCatalogSections } from "@/components/search/CatalogSections";
import { SearchPageLayout } from "@/components/search/SearchPageLayout";
import { SearchResultsSkeleton } from "@/components/search/SearchResultsSkeleton";
import {
  SearchHint,
  SearchSheetHeader,
} from "@/components/search/SearchSheetHeader";
import { ServerBarcodeResults } from "@/components/search/ServerBarcodeResults";
import {
  ExpiredImageSearch,
  ServerImageResults,
} from "@/components/search/ServerImageResults";
import { ServerSearchResults } from "@/components/search/ServerSearchResults";

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
 * Not restored, each by decision rather than omission:
 *
 * - **The five quick-link chips** (Cellars, Map, Tier Lists, Favorites,
 *   Rankings) — X01 deletes them: every one duplicated a tab (Cellar, Map) or
 *   a row of the Me hub (Tier lists, Loved, Top rated) one thumb-reach away.
 * - **The rewrite's tabs** (brands, people, recipes) and its two extra quick
 *   links: the old page had neither, and the old UI wins where they overlap
 *   (UI parity decision 2). Brand search lives on `/brands`, people on
 *   `/friends`, recipes on `/recipes`.
 */
export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Search({ searchParams }: SearchPageProps) {
  const state = searchStateFromParams(await searchParams);
  const { query, barcode, imageFileId, legacyImageLink, hasActiveSearch } =
    state;

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

            {query !== null && (
              <ResultsSection
                title={<>Search results for &ldquo;{query}&rdquo;</>}
              >
                <Suspense fallback={<SearchResultsSkeleton />}>
                  <ServerSearchResults query={query} />
                </Suspense>
              </ResultsSection>
            )}

            {/* D1: recipes and brands are reached from search now. Streams
                in on its own, so the items never wait for it. */}
            {query !== null && (
              <Suspense fallback={null}>
                <ServerCatalogSections query={query} />
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
