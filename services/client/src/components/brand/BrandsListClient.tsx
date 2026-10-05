"use client";

import { Box, Input, Stack } from "@mui/joy";
import { useEffect, useState } from "react";
import { MdSearch } from "react-icons/md";
import { useQuery } from "urql";
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
  BRANDS_PAGE_SIZE,
  BrandListCardFragment,
  BrandsListQuery,
  BrandsSearchQuery,
} from "./queries";

const toCard = (node: FragmentOf<typeof BrandListCardFragment>) =>
  brandCardFromSource(readFragment(BrandListCardFragment, node));

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
 *   to its own cap of 50 matches, each a whole card with its item count.
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
  const [{ data, fetching }] = useQuery({
    query: BrandsSearchQuery,
    variables: {
      term: debouncedSearch,
      limit: BRAND_SEARCH_LIMIT,
      first: BRAND_SEARCH_LIMIT,
    },
    pause: !hasSearch,
  });
  const searchResult = unwrapResult(data?.brandSearch, "BrandSearchConnection");
  const searchFailure =
    hasSearch && data !== undefined && !searchResult.ok
      ? searchResult.error
      : null;

  const searchBrands = searchResult.ok
    ? searchResult.data.edges.map((edge) => toCard(edge.node.brand))
    : [];

  const brands = hasSearch ? searchBrands : [...list.rows];
  const failure = hasSearch ? searchFailure : list.failure;

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
        totalCount={hasSearch ? brands.length : virtualTotal(list)}
        cacheKey={hasSearch ? "brands-search" : "brands"}
        getItemKey={(brand) => brand.id}
        gridBreakpoints={{
          xs: brands.length > 1 ? 6 : 12,
          sm: 6,
          md: 4,
          lg: 3,
          xl: 2,
        }}
        emptyMessage={hasSearch && fetching ? "Searching…" : "No brands found"}
        onLoadMore={
          hasSearch
            ? undefined
            : async () => {
                await list.loadMore();
              }
        }
        isLoadingMore={!hasSearch && list.status === "loadingMore"}
        renderItem={(brand, onBeforeNavigate) => (
          <Box onClick={onBeforeNavigate}>
            <BrandCard brand={brand} href={`/brands/${brand.id}`} />
          </Box>
        )}
      />
    </Stack>
  );
};
