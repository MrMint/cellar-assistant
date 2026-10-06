/**
 * Read a connection to its end, from a first page already in hand.
 *
 * The old UI read most lists unbounded (a Hasura relationship has no page),
 * and where a restored view shows a whole list — "Wineries", a bottle's
 * check-in picker, a brand's items grouped by type — a capped first page is a
 * silent cap: the rows after it simply never appear. A server component calls
 * this after its main query to fetch the rest with `after`, one page at a
 * time, before handing the rows to the view.
 *
 * Stops when `hasNextPage` is false, when a page comes back `null` (a typed
 * error on the follow-up read — the rows so far are still true, and the
 * caller learns it was cut short through `complete`), or when a cursor fails
 * to advance (a server bug would otherwise loop forever).
 */

/** The page shape every connection in the schema shares. */
export type RestConnection<TEdge> = {
  readonly edges: readonly TEdge[];
  readonly pageInfo: {
    readonly hasNextPage: boolean;
    readonly endCursor?: string | null;
  };
};

export type LoadedRest<TEdge> = {
  /** The first page's edges followed by every later page's. */
  edges: TEdge[];
  /** False when a follow-up read failed or stalled before the end. */
  complete: boolean;
  /**
   * The last page's `pageInfo` that was read — so a caller whose read was
   * cut short can still offer "Show more" from where it stopped.
   */
  pageInfo: RestConnection<TEdge>["pageInfo"];
};

export async function loadRest<TEdge>(
  first: RestConnection<TEdge>,
  fetchPage: (after: string) => Promise<RestConnection<TEdge> | null>,
): Promise<LoadedRest<TEdge>> {
  const edges = [...first.edges];
  let pageInfo = first.pageInfo;
  const seen = new Set<string>();
  while (pageInfo.hasNextPage) {
    const after = pageInfo.endCursor ?? null;
    if (after === null || seen.has(after)) {
      return { edges, complete: false, pageInfo };
    }
    seen.add(after);
    const next = await fetchPage(after);
    if (next === null) return { edges, complete: false, pageInfo };
    edges.push(...next.edges);
    pageInfo = next.pageInfo;
  }
  return { edges, complete: true, pageInfo };
}
