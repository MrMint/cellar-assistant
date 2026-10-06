import { Button, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { MdAdd } from "react-icons/md";
import { ApiError } from "@/components/cellar-api/ApiError";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import {
  IMAGE_SEARCH_LIMIT,
  isImageSearchUnavailable,
} from "@/lib/items/image-search";
import { searchResultsFromNodes } from "./adapter";
import { SearchImageQuery } from "./queries";
import { SearchResultGrid } from "./SearchResultGrid";

/** The old page's empty state for an image search, verbatim. */
const NoImageMatches = ({ message }: { message: string }) => (
  <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
    <Typography level="body-lg" sx={{ textAlign: "center" }}>
      {message}
    </Typography>
    <Link href="/add" style={{ textDecoration: "none" }}>
      <Button variant="outlined" startDecorator={<MdAdd />}>
        Add an item
      </Button>
    </Link>
  </Stack>
);

/**
 * An image-search link with no photo behind it any more: an old
 * `?image_results=` link, or a `?image=<fileId>` whose photo has been
 * discarded. A search photo is short-lived (G32): `ItemSearchActor` deletes it
 * once the search has used it, so reloading the page later — after the
 * cached result has gone — finds no file, and the API answers `NotFoundError`.
 * That is an expired link, not a failure, and it asks for a new photo.
 */
export const ExpiredImageSearch = () => (
  <NoImageMatches message="This image search link has expired. Tap Photo to search with a new picture." />
);

/**
 * The old page's "Image search results" block
 * (`82450ad1:src/app/(authenticated)/search/page.tsx` 179-197), which read its
 * rows out of `?image_results=<JSON>`. Now the URL carries the uploaded
 * photo's file id and the server searches: `itemSearch(imageFileId:)` (G32).
 *
 * Three answers the old block had no way to give, kept apart from "No items
 * found" because each is a different claim: a deployment that cannot embed a
 * photo (`IMAGE_SEARCH_UNAVAILABLE` — the local lane's Ollama, say), a photo
 * that is no longer there (`NOT_FOUND` — {@link ExpiredImageSearch}), and any
 * other refusal (budget, say).
 */
export async function ServerImageResults({
  imageFileId,
}: {
  imageFileId: string;
}) {
  const data = await apiServerQuery(SearchImageQuery, {
    imageFileId,
    first: IMAGE_SEARCH_LIMIT,
  });
  const result = unwrapResult(data.itemSearch, "ItemSearchConnection");

  if (!result.ok) {
    if (isImageSearchUnavailable(result.error)) {
      return (
        <NoImageMatches message="Photo search isn't available here. Search by name or scan a barcode instead." />
      );
    }
    if (result.error.code === "NOT_FOUND") return <ExpiredImageSearch />;
    return <ApiError error={result.error} title="Image search failed" />;
  }

  const results = searchResultsFromNodes(
    result.data.edges.map((edge) => edge.node.item),
  );
  return results.length === 0 ? (
    <NoImageMatches message="No items found matching the image" />
  ) : (
    <SearchResultGrid items={results} />
  );
}
