import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ClientSearchInterface } from "./ClientSearchInterface";
import {
  SearchNavigationProvider,
  SearchResultsRegion,
} from "./SearchNavigation";

type SearchPageLayoutProps = {
  /** The `?q=` this render is for (trimmed), or null. */
  urlQuery: string | null;
  /**
   * Drawn above everything in both views (X10: the sheet's title and Close).
   * Like every slot here, it keeps its place whichever view renders.
   */
  header?: ReactNode;
  /**
   * The landing view's hero (greeting and collection line, above the box), or
   * null for the results view. (The quick-link chips that sat under the box
   * went in X01: each one duplicated a tab or a Me row.)
   */
  landing: { hero: ReactNode } | null;
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
 * DOM. The provider gives the box and the results one transition, so the
 * results slot shows a skeleton while the next page streams.
 */
export function SearchPageLayout({
  urlQuery,
  header,
  landing,
  children,
}: SearchPageLayoutProps) {
  return (
    <SearchNavigationProvider>
      <div className={cn("flex flex-col gap-6", landing && "pt-4 sm:pt-8")}>
        {header ?? null}
        {landing ? landing.hero : null}
        {/* The same element in both views — only its classes change — so
            the box below it is never remounted. */}
        <div className={cn(landing && "w-full max-w-150 self-center")}>
          <ClientSearchInterface urlQuery={urlQuery} />
        </div>
        <SearchResultsRegion>{children}</SearchResultsRegion>
      </div>
    </SearchNavigationProvider>
  );
}
