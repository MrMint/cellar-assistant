import { Button, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { MdAdd } from "react-icons/md";
import { ApiError } from "@/components/cellar-api/ApiError";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { type SearchResultItem, searchResultsFromNodes } from "./adapter";
import { BARCODE_SEARCH_LIMIT, SearchBarcodeQuery } from "./queries";
import { SearchResultGrid } from "./SearchResultGrid";

/**
 * The old page's "Barcode search results" block
 * (`82450ad1:src/app/(authenticated)/search/page.tsx`), which read its rows
 * out of `?barcode_results=<JSON>` — rows the stub `searchByBarcode` never
 * produced. Now the server looks the code up: `barcode(code:)`. An unknown
 * code is a `NotFoundError`, which is the old "No items found matching the
 * barcode", not a failure.
 */
export async function ServerBarcodeResults({ code }: { code: string }) {
  // Destructured: the code is never rendered here, and
  // `lib/items/barcode.test.ts` reads every `.barcode` in a component as a
  // display site that must go through `displayBarcode`.
  const { barcode: lookup } = await apiServerQuery(SearchBarcodeQuery, {
    code,
    first: BARCODE_SEARCH_LIMIT,
  });
  const result = unwrapResult(lookup, "Barcode");

  let results: SearchResultItem[] = [];
  if (result.ok) {
    results = searchResultsFromNodes(
      result.data.items.edges.map((edge) => edge.node),
    );
  } else if (!isNotFound(result.error)) {
    return <ApiError error={result.error} title="Barcode search failed" />;
  }

  return results.length === 0 ? (
    <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
      <Typography level="body-lg" sx={{ textAlign: "center" }}>
        No items found matching the barcode
      </Typography>
      <Link href="/add" style={{ textDecoration: "none" }}>
        <Button variant="outlined" startDecorator={<MdAdd />}>
          Add an item
        </Button>
      </Link>
    </Stack>
  ) : (
    <SearchResultGrid items={results} />
  );
}
