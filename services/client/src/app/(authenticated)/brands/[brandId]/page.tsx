import { Box, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { itemLinkFromFragment } from "@/components/brand/adapter";
import { BrandDetailsClient } from "@/components/brand/BrandDetailsClient";
import {
  BRAND_CHILDREN_PAGE_SIZE,
  BRAND_ITEMS_PAGE_SIZE,
  BRAND_PLACES_PAGE_SIZE,
  BrandCoreFragment,
  BrandDetailQuery,
  BrandPlaceLinkFragment,
} from "@/components/brand/queries";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { toPage } from "@/lib/paging/paged-connection";

/**
 * `/brands/[brandId]` — the old `BrandDetails` (`82450ad1`) over one
 * `brand(id:)` read carrying all four reverse edges.
 *
 * `brand(id:)` is a result union: `NOT_FOUND` is `notFound()` as before, any
 * other typed error renders its message, and a transport failure throws to
 * the error boundary rather than being disguised as a missing brand. The old
 * second, failure-tolerant `BrandPlaces` read goes — `places` always exists.
 */
export const dynamic = "force-dynamic";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;

  const data = await apiServerQuery(BrandDetailQuery, {
    id: brandId,
    itemsFirst: BRAND_ITEMS_PAGE_SIZE,
    placesFirst: BRAND_PLACES_PAGE_SIZE,
    childrenFirst: BRAND_CHILDREN_PAGE_SIZE,
  });
  const result = unwrapResult(data.brand, "Brand");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    return <Typography color="danger">{result.error.message}</Typography>;
  }

  const brand = result.data;
  const core = readFragment(BrandCoreFragment, brand);
  const parent =
    brand.parentBrand === null || brand.parentBrand === undefined
      ? null
      : readFragment(BrandCoreFragment, brand.parentBrand);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <BrandDetailsClient
        brand={{
          ...core,
          parentBrand: parent,
          childBrands: {
            edges: brand.childBrands.edges.map((edge) => ({
              node: readFragment(BrandCoreFragment, edge.node),
            })),
          },
          places: {
            edges: brand.places.edges.map((edge) => ({
              node: readFragment(BrandPlaceLinkFragment, edge.node),
            })),
          },
        }}
        initialItems={toPage(brand.itemLinks, (edge) =>
          itemLinkFromFragment(edge.node),
        )}
        placeTotal={brand.places.totalCount ?? null}
      />
    </Box>
  );
}
