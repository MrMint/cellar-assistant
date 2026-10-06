import { Box, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { itemLinkFromFragment } from "@/components/brand/adapter";
import { BrandDetailsClient } from "@/components/brand/BrandDetailsClient";
import {
  BRAND_CHILDREN_PAGE_SIZE,
  BRAND_ITEMS_PAGE_SIZE,
  BRAND_ITEMS_REST_PAGE_SIZE,
  BRAND_PLACES_PAGE_SIZE,
  BrandCoreFragment,
  BrandDetailQuery,
  BrandItemLinksPageQuery,
  BrandPlaceLinkFragment,
} from "@/components/brand/queries";
import { readFragment } from "@/lib/api/graphql";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { loadRest } from "@/lib/paging/load-rest";
import { toPage } from "@/lib/paging/paged-connection";

/**
 * `/brands/[brandId]` — the old `BrandDetails` (`82450ad1`) over one
 * `brand(id:)` read carrying all four reverse edges.
 *
 * `brand(id:)` is a result union: `NOT_FOUND` is `notFound()` as before, any
 * other typed error renders its message, and a transport failure throws to
 * the error boundary rather than being disguised as a missing brand. The old
 * second, failure-tolerant `BrandPlaces` read goes — `places` always exists.
 *
 * The item links are read to the end here, before the view groups them by
 * type: the old page had every `item_brands` row, and a group built from the
 * first page could show a type short or missing. Should a follow-up read
 * fail, the page keeps what it has and "Show more" carries on from there.
 * Sub-brands and places page on the client ("Show more").
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
  const links = await loadRest(brand.itemLinks, async (after) => {
    const page = await apiServerQuery(BrandItemLinksPageQuery, {
      id: brandId,
      first: BRAND_ITEMS_REST_PAGE_SIZE,
      after,
    });
    const next = unwrapResult(page.brand, "Brand");
    return next.ok ? next.data.itemLinks : null;
  });
  const core = readFragment(BrandCoreFragment, brand);
  const parent =
    brand.parentBrand === null || brand.parentBrand === undefined
      ? null
      : readFragment(BrandCoreFragment, brand.parentBrand);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: "auto" }}>
      <BrandDetailsClient
        brand={{ ...core, parentBrand: parent }}
        initialItems={{
          rows: links.edges.map((edge) => itemLinkFromFragment(edge.node)),
          endCursor: links.pageInfo.endCursor ?? null,
          hasNextPage: links.pageInfo.hasNextPage,
          totalCount: brand.itemLinks.totalCount ?? null,
        }}
        initialChildren={toPage(brand.childBrands, (edge) =>
          readFragment(BrandCoreFragment, edge.node),
        )}
        initialPlaces={toPage(brand.places, (edge) =>
          readFragment(BrandPlaceLinkFragment, edge.node),
        )}
      />
    </Box>
  );
}
