/**
 * N22: a map search that found nothing answers "Not on the map yet", with a
 * way to add the place right there — instead of the silence it used to be
 * (the results panel only rendered when there were results).
 */

export const NOT_ON_MAP_TITLE = "Not on the map yet";
export const ADD_IT_HERE = "Add it here";

export function showNotOnMapYet(input: {
  readonly isSemanticSearch: boolean;
  readonly searchQuery: string;
  /** The query the current results answer (`semanticResultsQuery`). */
  readonly answeredQuery: string | null;
  readonly resultCount: number;
  readonly isLoading: boolean;
  readonly isPlacing: boolean;
}): boolean {
  const query = input.searchQuery.trim();
  return (
    input.isSemanticSearch &&
    query.length > 0 &&
    input.answeredQuery !== null &&
    input.answeredQuery.trim() === query &&
    input.resultCount === 0 &&
    !input.isLoading &&
    !input.isPlacing
  );
}

/** Where the pin flow lands: the create form at the pin, name pre-filled. */
export function createPlaceHref(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly name?: string | null;
}): string {
  const params = new URLSearchParams({
    lat: String(input.latitude),
    lng: String(input.longitude),
  });
  const name = input.name?.trim() ?? "";
  if (name.length > 0) params.set("name", name.slice(0, 200));
  return `/map/create-place?${params.toString()}`;
}
