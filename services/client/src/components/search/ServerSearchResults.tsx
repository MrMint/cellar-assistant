import { Button, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { MdAdd } from "react-icons/md";
import { ApiError } from "@/components/cellar-api/ApiError";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { searchResultsFromNodes } from "./adapter";
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
    return (
      <ApiError error={result.error} title="Search is unavailable right now" />
    );
  }

  const results = searchResultsFromNodes(
    result.data.edges.map((edge) => edge.node.item),
  );

  if (results.length === 0) {
    return (
      <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
        <Typography level="body-lg" sx={{ textAlign: "center" }}>
          No items found for &ldquo;{query}&rdquo;
        </Typography>
        <Link href="/add" style={{ textDecoration: "none" }}>
          <Button variant="outlined" startDecorator={<MdAdd />}>
            Add an item
          </Button>
        </Link>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <SearchResultGrid items={results} />
      <Stack alignItems="center">
        <Link href="/add" style={{ textDecoration: "none" }}>
          <Button variant="plain" startDecorator={<MdAdd />}>
            Can&apos;t find what you&apos;re looking for? Add an item
          </Button>
        </Link>
      </Stack>
    </Stack>
  );
}
