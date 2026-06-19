"use client";

import { Box, Input, Stack, Typography } from "@mui/joy";
import { useEffect, useState } from "react";
import { MdSearch } from "react-icons/md";
import { useQuery } from "urql";
import { VirtualGrid } from "@/components/common/VirtualGrid";
import { escapeLike } from "@/utilities/brand";
import { BrandCard, type BrandCardItem } from "./BrandCard";
import { BrandsListQuery, toBrandCardItems } from "./queries";

const PAGE_LIMIT = 200;

interface BrandsListClientProps {
  initialBrands: BrandCardItem[];
}

export const BrandsListClient = ({ initialBrands }: BrandsListClientProps) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const hasSearch = debouncedSearch.length > 0;

  // Search hits the server so brands beyond the initial page are findable.
  const [{ data, fetching }] = useQuery({
    query: BrandsListQuery,
    variables: {
      search: `%${escapeLike(debouncedSearch)}%`,
      limit: PAGE_LIMIT,
    },
    pause: !hasSearch,
  });

  const brands = hasSearch
    ? data?.brands
      ? toBrandCardItems(data.brands)
      : []
    : initialBrands;

  const atInitialLimit = !hasSearch && initialBrands.length >= PAGE_LIMIT;

  return (
    <Stack spacing={2}>
      <Input
        placeholder="Search brands…"
        startDecorator={<MdSearch />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ maxWidth: 400 }}
      />
      {atInitialLimit && (
        <Typography level="body-sm" sx={{ color: "text.secondary" }}>
          Showing the first {PAGE_LIMIT} brands — search to find others.
        </Typography>
      )}
      <VirtualGrid
        items={brands}
        cacheKey="brands"
        getItemKey={(brand) => brand.id}
        gridBreakpoints={{
          xs: brands.length > 1 ? 6 : 12,
          sm: 6,
          md: 4,
          lg: 3,
          xl: 2,
        }}
        emptyMessage={hasSearch && fetching ? "Searching…" : "No brands found"}
        renderItem={(brand, onBeforeNavigate) => (
          <Box onClick={onBeforeNavigate}>
            <BrandCard brand={brand} href={`/brands/${brand.id}`} />
          </Box>
        )}
      />
    </Stack>
  );
};
