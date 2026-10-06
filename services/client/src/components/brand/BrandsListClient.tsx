"use client";

import { Box, Input, Stack } from "@mui/joy";
import { useEffect, useState } from "react";
import { MdSearch } from "react-icons/md";
import { virtualTotal } from "@/components/cellar/virtualTotal";
import { ApiError } from "@/components/cellar-api/ApiError";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { type FragmentOf, readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { type Page, pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { brandCardFromSource } from "./adapter";
import { BrandCard, type BrandCardItem } from "./BrandCard";
import {
  BRAND_SEARCH_LIMIT,
  BRAND_SEARCH_PAGE_SIZE,
  BRANDS_PAGE_SIZE,
  BrandListCardFragment,
  BrandsListQuery,
  BrandsSearchQuery,
} from "./queries";

const toCard = (node: FragmentOf<typeof BrandListCardFragment>) =>
  brandCardFromSource(readFragment(BrandListCardFragment, node));

const NO_SEARCH: Page<BrandCardItem> = {
  rows: [],
  endCursor: null,
  hasNextPage: false,
  totalCount: null,
};

interface BrandsListClientProps {
  initialPage: Page<BrandCardItem>;
}

/**
 * `82450ad1:src/components/brand/BrandsListClient.tsx`, restored.
 *
 * Same tree — "Search brands…" with a 300 ms debounce over a `VirtualGrid`
 * of `BrandCard`s, the search replacing the grid's contents — with two data
 * changes:
 *
 * - The unsearched grid is `Query.brands`, paged: `VirtualGrid`'s eager
 *   load-more walks the cursor, so "Showing the first 200 brands — search to
 *   find others" goes, because nothing is cut off any more.
 * - The search is `brandSearch(term:)` (a term, not an `_ilike` pattern), up
 *   to 200 matches as the old `PAGE_LIMIT` was, each a whole card with its
 *   item count. `first` caps at 100, so the search pages too, through the
 *   same eager load-more as the unsearched grid.
 */
export const BrandsListClient = ({ initialPage }: BrandsListClientProps) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const hasSearch = debouncedSearch.length > 0;

  const list = usePagedConnection({
    query: BrandsListQuery,
    variables: (_args: null, after) => ({ first: BRANDS_PAGE_SIZE, after }),
    select: (data) =>
      pageOf(unwrapResult(data?.brands, "BrandConnection"), (edge) =>
        toCard(edge.node),
      ),
    initial: initialPage,
    initialArgs: null,
  });

  // Search hits the server so brands beyond the loaded pages are findable.
  // Keyed by the term: a new term resets (and clears) the list, and a page
  // still in flight for the old term is dropped by the hook's gate.
  const searchList = usePagedConnection({
    query: BrandsSearchQuery,
    variables: (term: string, after) => ({
      term,
      limit: BRAND_SEARCH_LIMIT,
      first: BRAND_SEARCH_PAGE_SIZE,
      after,
    }),
    select: (data) =>
      pageOf(unwrapResult(data?.brandSearch, "BrandSearchConnection"), (edge) =>
        toCard(edge.node.brand),
      ),
    initial: NO_SEARCH,
    initialArgs: "",
  });
  const resetSearch = searchList.reset;
  useEffect(() => {
    if (debouncedSearch.length > 0) {
      void resetSearch(debouncedSearch, { clear: true });
    }
  }, [debouncedSearch, resetSearch]);

  const searching = hasSearch && searchList.status === "resetting";
  const active = hasSearch ? searchList : list;
  const brands = [...active.rows];
  const failure = active.failure;

  return (
    <Stack spacing={2}>
      <Input
        placeholder="Search brands…"
        startDecorator={<MdSearch />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ maxWidth: 400 }}
      />
      {failure !== null && <ApiError error={failure} title="Brands" />}
      <VirtualGrid
        items={brands}
        totalCount={virtualTotal(active)}
        cacheKey={hasSearch ? "brands-search" : "brands"}
        getItemKey={(brand) => brand.id}
        gridBreakpoints={{
          xs: brands.length > 1 ? 6 : 12,
          sm: 6,
          md: 4,
          lg: 3,
          xl: 2,
        }}
        emptyMessage={searching ? "Searching…" : "No brands found"}
        onLoadMore={async () => {
          await active.loadMore();
        }}
        isLoadingMore={active.status === "loadingMore"}
        renderItem={(brand, onBeforeNavigate) => (
          <Box onClick={onBeforeNavigate}>
            <BrandCard brand={brand} href={`/brands/${brand.id}`} />
          </Box>
        )}
      />
    </Stack>
  );
};
