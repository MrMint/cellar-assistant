"use client";

import { Box, Button } from "@mui/joy";
import { useMemo } from "react";
import { ApiError } from "@/components/cellar-api/ApiError";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import {
  type Page,
  type PagedState,
  pageOf,
} from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import {
  type BrandCoreSource,
  type BrandDetailSource,
  type BrandItemLinkSource,
  type BrandPlaceLinkSource,
  brandDetailsFromSource,
  itemLinkFromFragment,
} from "./adapter";
import { BrandDetails } from "./BrandDetails";
import {
  BRAND_CHILDREN_PAGE_SIZE,
  BRAND_ITEMS_REST_PAGE_SIZE,
  BRAND_PLACES_PAGE_SIZE,
  BrandChildBrandsPageQuery,
  BrandCoreFragment,
  BrandItemLinksPageQuery,
  BrandPlaceLinkFragment,
  BrandPlacesPageQuery,
} from "./queries";

/** "Show more" under a list while it has rows left, and its error. */
function ShowMore<TRow>({
  list,
  title,
  loadMore,
}: {
  list: PagedState<TRow, null>;
  title: string;
  loadMore: () => void;
}) {
  return (
    <>
      {list.failure !== null && <ApiError error={list.failure} title={title} />}
      {list.hasNextPage && (
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            size="sm"
            loading={list.status === "loadingMore"}
            disabled={!list.canLoadMore}
            onClick={loadMore}
          >
            Show more
          </Button>
        </Box>
      )}
    </>
  );
}

/**
 * The client half of `/brands/[brandId]`: the restored `BrandDetails` over
 * three lists. The old page read every sub-brand, item link and place at
 * once. Here the server has already read **every** item link (the groups by
 * type are only true over all of them; "Show more" appears under the items
 * only if one of those reads failed), and sub-brands and places arrive a page
 * at a time, each with its own "Show more".
 */
export function BrandDetailsClient({
  brand,
  initialItems,
  initialChildren,
  initialPlaces,
}: {
  brand: Omit<BrandDetailSource, "childBrands" | "places">;
  initialItems: Page<BrandItemLinkSource>;
  initialChildren: Page<BrandCoreSource>;
  initialPlaces: Page<BrandPlaceLinkSource>;
}) {
  const items = usePagedConnection({
    query: BrandItemLinksPageQuery,
    variables: (_args: null, after) => ({
      id: brand.id,
      first: BRAND_ITEMS_REST_PAGE_SIZE,
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

  const children = usePagedConnection({
    query: BrandChildBrandsPageQuery,
    variables: (_args: null, after) => ({
      id: brand.id,
      first: BRAND_CHILDREN_PAGE_SIZE,
      after,
    }),
    select: (data) => {
      const result = unwrapResult(data?.brand, "Brand");
      return pageOf(
        result.ok ? { ok: true, data: result.data.childBrands } : result,
        (edge): BrandCoreSource => readFragment(BrandCoreFragment, edge.node),
      );
    },
    initial: initialChildren,
    initialArgs: null,
  });

  const places = usePagedConnection({
    query: BrandPlacesPageQuery,
    variables: (_args: null, after) => ({
      id: brand.id,
      first: BRAND_PLACES_PAGE_SIZE,
      after,
    }),
    select: (data) => {
      const result = unwrapResult(data?.brand, "Brand");
      return pageOf(
        result.ok ? { ok: true, data: result.data.places } : result,
        (edge): BrandPlaceLinkSource =>
          readFragment(BrandPlaceLinkFragment, edge.node),
      );
    },
    initial: initialPlaces,
    initialArgs: null,
  });

  const details = useMemo(
    () =>
      brandDetailsFromSource(
        {
          ...brand,
          childBrands: { edges: children.rows.map((node) => ({ node })) },
          places: { edges: places.rows.map((node) => ({ node })) },
        },
        items.rows,
      ),
    [brand, children.rows, places.rows, items.rows],
  );

  return (
    <BrandDetails
      brand={details}
      itemTotal={items.totalCount}
      placeTotal={places.totalCount}
      itemsFooter={
        <ShowMore
          list={items}
          title="Items"
          loadMore={() => void items.loadMore()}
        />
      }
      childrenFooter={
        <ShowMore
          list={children}
          title="Brands"
          loadMore={() => void children.loadMore()}
        />
      }
      placesFooter={
        <ShowMore
          list={places}
          title="Places"
          loadMore={() => void places.loadMore()}
        />
      }
    />
  );
}
