/**
 * The anonymous API client (X17): a query with **no** token, for the public
 * share pages and their link-preview cards.
 *
 * Deliberately not `apiServerQuery` with the token left out by accident:
 * those pages render for a viewer who may have a session cookie, and the
 * public page must say exactly what it says to everyone — so the token is
 * never read here at all. `services/api` treats a request without one as
 * anonymous (`viewerId: null`), and only the `shared*` and
 * `friendInvitePreview` fields answer one; everything else is refused there.
 *
 * Its own client per call rather than `registerUrql`'s per-request one: a
 * share page and its card are one or two queries, and keeping this client
 * apart from the viewer's means the two can never share a document cache.
 */
import type { TadaDocumentNode } from "gql.tada";
import type { ResultOf, VariablesOf } from "./graphql.ts";
import { makeApiServerClient, runApiOperation } from "./urql-server-client.ts";

export async function anonymousApiQuery<
  // biome-ignore lint/suspicious/noExplicitAny: see runApiOperation.
  TDocument extends TadaDocumentNode<any, any>,
>(
  document: TDocument,
  variables: VariablesOf<TDocument>,
): Promise<ResultOf<TDocument>> {
  return runApiOperation<ResultOf<TDocument>>(
    makeApiServerClient(),
    "query",
    document,
    variables as Record<string, unknown>,
    null,
  );
}
