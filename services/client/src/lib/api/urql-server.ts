/**
 * URQL for server components, against `services/api`.
 *
 * Server components call the API **directly**, not through
 * `/api/graphql`. The proxy exists so the browser never learns the API's
 * origin; the Next server already knows it, and self-fetching would add a hop
 * through the same process that is rendering.
 *
 * The token comes from `auth-server.ts`, which memoises the exchange per
 * request — a tree of twenty server components performs one token exchange and
 * twenty GraphQL calls, each carrying the same JWT.
 *
 * Everything here except that token read lives in `urql-server-client.ts`,
 * which is testable without a Next runtime.
 */

import { registerUrql } from "@urql/next/rsc";
import type { TadaDocumentNode } from "gql.tada";
import { getApiToken } from "./auth-server.ts";
import type { ResultOf, VariablesOf } from "./graphql.ts";
import { makeApiServerClient, runApiOperation } from "./urql-server-client.ts";

export { makeApiServerClient } from "./urql-server-client.ts";

/** Per-request client, courtesy of `registerUrql`'s React `cache()`. */
export const { getClient: getApiClient } = registerUrql(() =>
  makeApiServerClient(),
);

/**
 * Query `services/api` as the current viewer.
 *
 * No `token` argument: taking it implicitly from the request is what stops a
 * caller passing the wrong one.
 */
export async function apiServerQuery<
  // biome-ignore lint/suspicious/noExplicitAny: see runApiOperation.
  TDocument extends TadaDocumentNode<any, any>,
>(
  document: TDocument,
  variables?: VariablesOf<TDocument>,
): Promise<ResultOf<TDocument>> {
  return runApiOperation<ResultOf<TDocument>>(
    getApiClient(),
    "query",
    document,
    (variables ?? {}) as Record<string, unknown>,
    await getApiToken(),
  );
}

/** As {@link apiServerQuery}, for server actions. */
export async function apiServerMutation<
  // biome-ignore lint/suspicious/noExplicitAny: see runApiOperation.
  TDocument extends TadaDocumentNode<any, any>,
>(
  document: TDocument,
  variables?: VariablesOf<TDocument>,
): Promise<ResultOf<TDocument>> {
  return runApiOperation<ResultOf<TDocument>>(
    getApiClient(),
    "mutation",
    document,
    (variables ?? {}) as Record<string, unknown>,
    await getApiToken(),
  );
}
