import { AiFailureStatus } from "@/components/common/AiStatus";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { searchResultsFromNodes } from "./adapter";
import { AddItemLink, NoSearchResults } from "./NoSearchResults";
import {
  ITEM_SEARCH_LIMIT,
  ITEM_SEARCH_MAX_DISTANCE,
  SearchItemsQuery,
} from "./queries";
import { SearchResultGrid } from "./SearchResultGrid";

interface ServerSearchResultsProps {
  query: string;
}

/**
 * `82450ad1:src/components/search/ServerSearchResults.tsx`, restored over
 * `itemSearch` (the old `searchByText` server action embedded the phrase and
 * ran `text_search`; the actor now does both).
 *
 * One addition: `itemSearch` answers a typed failure — most often "no
 * embedding provider" — and the page says so instead of rendering "No items
 * found", which would be a different and false claim.
 */
export async function ServerSearchResults({ query }: ServerSearchResultsProps) {
  const data = await apiServerQuery(SearchItemsQuery, {
    text: query,
    first: ITEM_SEARCH_LIMIT,
    limit: ITEM_SEARCH_LIMIT,
    maxDistance: ITEM_SEARCH_MAX_DISTANCE,
  });
  const result = unwrapResult(data.itemSearch, "ItemSearchConnection");

  if (!result.ok) {
    // N07: most often "no embedding provider" or a spent allowance — said in
    // words chosen from the reason, never the server's message.
    return (
      <AiFailureStatus
        failure={{
          code: result.error.code,
          reason: result.error.reason,
          retryAt: result.error.retryAt,
        }}
        title="Search is unavailable right now"
        fallback="scan a barcode or browse your cellars"
        subject="search"
      />
    );
  }

  const results = searchResultsFromNodes(
    result.data.edges.map((edge) => edge.node.item),
  );

  if (results.length === 0) {
    return (
      <NoSearchResults>
        No items found for &ldquo;{query}&rdquo;
      </NoSearchResults>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SearchResultGrid items={results} />
      <div className="flex flex-col items-center">
        <AddItemLink variant="ghost">
          Can&apos;t find what you&apos;re looking for? Add an item
        </AddItemLink>
      </div>
    </div>
  );
}
