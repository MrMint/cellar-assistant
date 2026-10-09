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
export function SearchResultsRegion({ children }: { children: ReactNode }) {
  const isPending = useSearchNavigation()?.isPending ?? false;
  return (
    <div aria-busy={isPending}>
      {isPending ? <SearchSectionsSkeleton /> : children}
    </div>
  );
}
