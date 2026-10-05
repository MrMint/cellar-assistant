"use client";

import { Box, Button } from "@mui/joy";
import { useMemo } from "react";
import { ApiError } from "@/components/cellar-api/ApiError";
import { unwrapResult } from "@/lib/api/result";
import { type Page, pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import {
  type BrandDetailSource,
  type BrandItemLinkSource,
  brandDetailsFromSource,
  itemLinkFromFragment,
} from "./adapter";
import { BrandDetails } from "./BrandDetails";
import { BRAND_ITEMS_PAGE_SIZE, BrandItemLinksPageQuery } from "./queries";

/**
 * The client half of `/brands/[brandId]`: the restored `BrandDetails`, with
 * its item links paged on from the server's first page. The old page read
 * every `item_brands` row at once; `itemLinks` costs an `ItemActor.get` per
 * row, so it pages, and "Show more" sits under the list while links remain.
 */
export function BrandDetailsClient({
  brand,
  initialItems,
  placeTotal,
}: {
  brand: BrandDetailSource;
  initialItems: Page<BrandItemLinkSource>;
  placeTotal: number | null;
}) {
  const list = usePagedConnection({
    query: BrandItemLinksPageQuery,
    variables: (_args: null, after) => ({
      id: brand.id,
      first: BRAND_ITEMS_PAGE_SIZE,
      after,
    }),
    select: (data) => {
      const result = unwrapResult(data?.brand, "Brand");
      return pageOf(
        result.ok ? { ok: true, data: result.data.itemLinks } : result,
        (edge) => itemLinkFromFragment(edge.node),
      );
    },
    initial: initialItems,
    initialArgs: null,
  });

  const details = useMemo(
    () => brandDetailsFromSource(brand, list.rows),
    [brand, list.rows],
  );

  return (
    <BrandDetails
      brand={details}
      itemTotal={list.totalCount}
      placeTotal={placeTotal}
      itemsFooter={
        <>
          {list.failure !== null && (
            <ApiError error={list.failure} title="Items" />
          )}
          {list.hasNextPage && (
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                size="sm"
                loading={list.status === "loadingMore"}
                disabled={!list.canLoadMore}
                onClick={() => void list.loadMore()}
              >
                Show more
              </Button>
            </Box>
          )}
        </>
      }
    />
  );
}
