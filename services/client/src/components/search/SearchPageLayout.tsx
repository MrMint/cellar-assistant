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
   * The landing view's hero (greeting and collection line, above the box), or
   * null for the results view. (The quick-link chips that sat under the box
   * went in X01: each one duplicated a tab or a Me row.)
   */
  landing: { hero: ReactNode } | null;
  /** The landing view's discovery section, or the results. */
  children: ReactNode;
  /**
   * The page's one h1 (X21), for assistive tech only: the greeting is
   * client-rendered and the results view has no headline of its own.
   */
  heading: string;
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
  landing,
  children,
  heading,
}: SearchPageLayoutProps) {
  return (
    <SearchNavigationProvider>
      <div className={cn("flex flex-col gap-6", landing && "pt-4 sm:pt-8")}>
        {/* Always rendered, always first: the slots after it keep their
            places, so the box below is still never remounted. */}
        <h1 className="sr-only">{heading}</h1>
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
