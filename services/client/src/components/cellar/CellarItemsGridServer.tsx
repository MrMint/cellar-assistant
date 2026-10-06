import { ApiError } from "@/components/cellar-api/ApiError";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { cellarGridItem } from "./adapter";
import { CellarItemsGrid } from "./CellarItemsGrid";
import { cellarItemsVariables } from "./cellarItemsQuery";
import { GetCellarItemsQuery } from "./fragments";

interface CellarItemsGridServerProps {
  cellarId: string;
  search: string;
  types: ItemTypeValue[];
}

/**
 * `82450ad1:src/components/cellar/CellarItemsGridServer.tsx`, restored.
 *
 * Async server component that fetches the first page and renders the grid,
 * wrapped in `Suspense` by the page so the header streams first. The old one
 * read the whole cellar out of an `unstable_cache` keyed across auth tokens
 * (§7); this asks `Cellar.items` for one page, as the viewer, with the
 * variables `CellarItemsGrid` will page on with.
 */
export async function CellarItemsGridServer({
  cellarId,
  search,
  types,
}: CellarItemsGridServerProps) {
  const data = await apiServerQuery(
    GetCellarItemsQuery,
    cellarItemsVariables(cellarId, { search, types }, null),
  );
  const result = unwrapResult(data.cellar, "Cellar");
  if (!result.ok) return <ApiError error={result.error} />;

  const { items } = result.data;
  return (
    <CellarItemsGrid
      initialItems={items.edges.map((edge) => cellarGridItem(edge.node))}
      initialCursor={items.pageInfo.endCursor ?? null}
      initialHasNextPage={items.pageInfo.hasNextPage}
      totalCount={items.totalCount ?? null}
      cellarId={cellarId}
      search={search}
      types={types}
    />
  );
}
