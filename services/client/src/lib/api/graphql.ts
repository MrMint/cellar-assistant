/**
 * gql.tada, bound to the API's schema.
 *
 * `packages/schema` holds `schema.graphql` — `printSchema` output written by
 * `services/api` and checked in — plus the `graphql-env.d.ts` generated from it.
 * Nothing introspects a running server, so `bun run typecheck` does not need the
 * stack up and the types cannot drift from what CI built.
 */
export type {
  FragmentOf,
  ResultOf,
  VariablesOf,
} from "@cellar-assistant/schema";
export { graphql, readFragment } from "@cellar-assistant/schema";
