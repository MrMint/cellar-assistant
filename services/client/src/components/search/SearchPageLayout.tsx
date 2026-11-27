import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ClientSearchInterface,
  type SearchToken,
} from "./ClientSearchInterface";
import {
  SearchNavigationProvider,
  SearchResultsRegion,
} from "./SearchNavigation";
import type { SearchSection } from "./universal-search";

type SearchPageLayoutProps = {
  /** The `?q=` this render is for (trimmed), or null. */
  urlQuery: string | null;
  /**
   * Drawn above everything in both views (the page's h1, and Close on a
   * phone while the shell hides the tab bar here).
   */
  header?: ReactNode;
  /**
   * The landing view's hero (above the box), or null for the results view.
   */
  landing: { hero: ReactNode } | null;
  /** A barcode or photo search: the field's token. */
  token?: SearchToken;
  /** `?in=`: the section the field looks in. */
  scope?: SearchSection | null;
  /** The landing view's discovery section, or the results. */
  children: ReactNode;
};

/**
 * `/search`'s frame (N01). The old page rendered the box in two different
 * places — inside the landing hero, and at the top of the results — so the
 * first keystroke that turned the landing view into the results view
 * unmounted the input under the user's finger: focus lost, the phone's
 * keyboard dismissed mid-word.
 *
 * Here every slot keeps its position whichever view renders: an absent
 * landing slot is a `null` child, not a different tree, so React keeps the
 * one `ClientSearchInterface` — its text, its focus, its debounce — across
 * every `?q=` the user types. `search-page-layout.test.tsx` holds that in a
 * DOM. The provider gives the box and the results one transition: the
 * results dim while the next page streams, or show a skeleton for a first
 * search (Recipes-Search ruling 3).
 *
 * The field sits in a sticky bar with a hairline under it (Recipes-Search
 * 01, 08): it never scrolls away.
 */
export function SearchPageLayout({
  urlQuery,
  header,
  landing,
  token = null,
  scope = null,
  children,
}: SearchPageLayoutProps) {
  return (
    <SearchNavigationProvider>
      <div className={cn("flex flex-col gap-4", landing && "pt-4 sm:pt-8")}>
        {header ?? null}
        {landing ? landing.hero : null}
        {/* The same element in both views — only its classes change — so
            the box below it is never remounted. */}
        <div
          className={cn(
            "sticky top-0 z-20 -mx-4 border-rule border-b bg-background px-4 py-2",
            landing && "w-full max-w-150 self-center",
          )}
        >
          <ClientSearchInterface
            urlQuery={urlQuery}
            token={token}
            scope={scope}
          />
        </div>
        <SearchResultsRegion
          showingResults={urlQuery !== null || token !== null}
        >
          {children}
        </SearchResultsRegion>
      </div>
    </SearchNavigationProvider>
  );
}
