import { Typography } from "@mui/joy";
import { Cellars } from "@/components/cellar/Cellars";
import { GetCellarsQuery } from "@/components/cellar/fragments";
import { CELLARS_PAGE_SIZE } from "@/components/cellar-api/pagination";
import { ViewerQuery } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";

/**
 * `/cellars` — the old `Cellars` grid (`82450ad1`), server-rendered first page.
 *
 * Both reads share one token exchange (`getApiToken()` is `cache()`d per
 * request). `myCellars` is paged; `Cellars` walks the rest from the client.
 */
export const dynamic = "force-dynamic";

export default async function CellarsPage() {
  const [cellars, viewer] = await Promise.all([
    apiServerQuery(GetCellarsQuery, { first: CELLARS_PAGE_SIZE, after: null }),
    apiServerQuery(ViewerQuery, {}),
  ]);

  const result = unwrapResult(cellars.myCellars, "CellarConnection");
  if (!result.ok) {
    // `myCellars` has no "not found" case, and an anonymous request would
    // have been redirected by the layout: every branch here is a failure.
    return <Typography color="danger">{result.error.message}</Typography>;
  }

  return (
    <Cellars
      cellars={[...result.data.edges]}
      userId={viewer.me?.id ?? ""}
      initialCursor={result.data.pageInfo.endCursor ?? null}
      initialHasNextPage={result.data.pageInfo.hasNextPage}
      totalCount={result.data.totalCount ?? null}
    />
  );
}
