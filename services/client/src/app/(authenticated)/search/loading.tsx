import { SearchLandingShell } from "@/components/search/SearchLandingShell";

/**
 * The search sheet's shell (X24, X10). Only a navigation *into* `/search` shows it: typing
 * (`router.replace` with a new `?q=`) keeps the same page segment — Next keys
 * the boundary without search params — so the transition holds the live page
 * and its box (N01), and the results skeleton is `SearchResultsRegion`'s.
 */
export default function SearchLoading() {
  return <SearchLandingShell />;
}
