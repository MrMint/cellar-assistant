"use client";

import {
  createContext,
  type ReactNode,
  type TransitionStartFunction,
  useContext,
  useTransition,
} from "react";
import { SearchSectionsSkeleton } from "./SearchResultsSkeleton";

type SearchNavigationValue = {
  /** A search navigation (text, barcode or photo) is in flight. */
  isPending: boolean;
  startTransition: TransitionStartFunction;
};

const SearchNavigationContext = createContext<SearchNavigationValue | null>(
  null,
);

/**
 * One transition for every navigation the search box starts (N01), shared
 * with the results below it so they can say "loading" while the next page's
 * server components stream — the old page kept the stale results on screen,
 * unmarked, until the new ones replaced them.
 */
export function SearchNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <SearchNavigationContext.Provider value={{ isPending, startTransition }}>
      {children}
    </SearchNavigationContext.Provider>
  );
}

/** The shared transition, or null outside a {@link SearchNavigationProvider}. */
export const useSearchNavigation = (): SearchNavigationValue | null =>
  useContext(SearchNavigationContext);

/**
 * The results slot: its server-rendered children, or the results skeleton
 * while a search navigation is pending — in universal search's shape (X12),
 * since typing is what most navigations are.
 */
export function SearchResultsRegion({
  children,
  showingResults = false,
}: {
  children: ReactNode;
  /**
   * Results are on screen now. Then a pending search keeps them, dimmed to
   * 60 %, until the next ones arrive (Recipes-Search ruling 3); only a first
   * search shows the skeleton.
   */
  showingResults?: boolean;
}) {
  const isPending = useSearchNavigation()?.isPending ?? false;
  if (isPending && !showingResults) {
    return (
      <div aria-busy>
        <SearchSectionsSkeleton />
      </div>
    );
  }
  return (
    <div
      aria-busy={isPending}
      data-search-refining={isPending || undefined}
      className="transition-opacity duration-(--ca-dur-short) ease-standard data-[search-refining]:opacity-60"
    >
      {children}
    </div>
  );
}
