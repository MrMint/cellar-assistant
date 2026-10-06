/**
 * The half of the server-side GraphQL path that has no Next dependency:
 * building a client for `services/api` and running one operation on it with a
 * given token.
 *
 * Split out from `urql-server.ts` so it can be exercised against the running
 * stack from `node --test`. `urql-server.ts` adds exactly one thing — taking
 * the token from the current request instead of an argument.
 */
import type { Client } from "@urql/core";
import { cacheExchange, createClient, fetchExchange } from "@urql/core";
import type { TadaDocumentNode } from "gql.tada";
import { graphqlApiUrl } from "./config.ts";
import { bearerHeader } from "./token.ts";

export const makeApiServerClient = (url = graphqlApiUrl()): Client =>
  createClient({
    url,
    // The document cache, not graphcache: a server client lives for one
    // request, so there is no normalised store worth maintaining.
    exchanges: [cacheExchange, fetchExchange],
    fetchOptions: () => ({
      // Auth-bearing and per-viewer. Never Next's data cache.
      cache: "no-store",
      method: "POST",
    }),
    preferGetMethod: false,
  });

/**
 * Runs one operation as the holder of `token`, or anonymously when it is
 * `null` — `services/api` reads an absent `Authorization` header as an anonymous
 * viewer and lets the actors decide what that viewer may see (plan §1.6).
 */
export const runApiOperation = async <TData>(
  client: Client,
  kind: "query" | "mutation",
  // biome-ignore lint/suspicious/noExplicitAny: TadaDocumentNode's parameters are contravariant in URQL's signature; `any` is what lets a concrete document be passed at all.
  document: TadaDocumentNode<any, any>,
  variables: Record<string, unknown>,
  token: string | null,
): Promise<TData> => {
  const context = {
    fetchOptions: {
      headers: bearerHeader(token),
      cache: "no-store" as const,
    },
  };

  const result =
    kind === "query"
      ? await client.query(document, variables, context).toPromise()
      : await client.mutation(document, variables, context).toPromise();

  if (result.error) {
    throw new Error(
      `GraphQL ${kind} failed: ` +
        (result.error.graphQLErrors[0]?.message ?? result.error.message),
    );
  }
  if (!result.data) throw new Error(`GraphQL ${kind} returned no data`);
  return result.data as TData;
};
