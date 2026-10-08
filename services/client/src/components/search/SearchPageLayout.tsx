import { Box, Stack } from "@mui/joy";
import type { ReactNode } from "react";
import { ClientSearchInterface } from "./ClientSearchInterface";
import {
  SearchNavigationProvider,
  SearchResultsRegion,
} from "./SearchNavigation";

type SearchPageLayoutProps = {
  /** The `?q=` this render is for (trimmed), or null. */
  urlQuery: string | null;
  /**
   * The landing view's hero (greeting and collection line, above the box) and
   * quick links (under it), or null for the results view.
   */
  landing: { hero: ReactNode; quickLinks: ReactNode } | null;
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
  landing,
  children,
}: SearchPageLayoutProps) {
  return (
    <SearchNavigationProvider>
      <Stack spacing={3} sx={landing ? { pt: { xs: 2, sm: 4 } } : undefined}>
        {landing ? landing.hero : null}
        <Box
          sx={
            landing ? { width: "100%", maxWidth: 600, mx: "auto" } : undefined
          }
        >
          <ClientSearchInterface urlQuery={urlQuery} />
        </Box>
        {landing ? landing.quickLinks : null}
        <SearchResultsRegion>{children}</SearchResultsRegion>
      </Stack>
    </SearchNavigationProvider>
  );
}
