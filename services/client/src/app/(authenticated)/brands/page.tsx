import { Page } from "@/components/app/Page";
import { toBrandCardItems } from "@/components/brand/adapter";
import { BrandsListClient } from "@/components/brand/BrandsListClient";
import {
  BRANDS_PAGE_SIZE,
  BrandListCardFragment,
  BrandsListQuery,
} from "@/components/brand/queries";
import { ApiError } from "@/components/cellar-api/ApiError";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/brands` — the old page (`82450ad1`): heading, blurb and
 * `BrandsListClient`, server-rendering the first page of `Query.brands`
 * (paged; the old one-shot `limit: 200` is over the API's cap). The old
 * `getServerUserId()` redirect is the `(authenticated)` layout's job.
 */
export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const data = await apiServerQuery(BrandsListQuery, {
    first: BRANDS_PAGE_SIZE,
    after: null,
  });
  const result = unwrapResult(data.brands, "BrandConnection");

  return (
    <Page wide>
      <header className="flex flex-col gap-2">
        <h1 className="type-large-title">Brands</h1>
        <p className="type-body text-ink-2">
          Browse the wineries, breweries, distilleries, and other producers
          behind the items in your cellar.
        </p>
      </header>
      {result.ok ? (
        <BrandsListClient
          initialPage={{
            rows: toBrandCardItems(
              result.data.edges.map((edge) =>
                readFragment(BrandListCardFragment, edge.node),
              ),
            ),
            endCursor: result.data.pageInfo.endCursor ?? null,
            hasNextPage: result.data.pageInfo.hasNextPage,
            totalCount: result.data.totalCount ?? null,
          }}
        />
      ) : (
        <ApiError error={result.error} title="Brands" />
      )}
    </Page>
  );
}
