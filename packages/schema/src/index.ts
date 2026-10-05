/**
 * The printed API schema, and gql.tada configured against it.
 *
 * `schema.graphql` is written by `services/api` (`pnpm --filter
 * @cellar-assistant/api schema:print`) and checked in; `graphql-env.d.ts` is
 * generated *from that file* by `pnpm --filter @cellar-assistant/schema
 * codegen`. Neither step introspects a running server — the old setup pointed
 * gql.tada at `https://local.graphql.nhost.run/v1`, which meant type checking
 * needed the stack up and could silently drift from what CI built.
 *
 * The frontend (D1 onwards) imports `graphql` from here.
 */
import { initGraphQLTada } from "gql.tada";
import type { introspection } from "../graphql-env.d.ts";

export type { FragmentOf, ResultOf, VariablesOf } from "gql.tada";
export { readFragment } from "gql.tada";

export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: {
    /** ISO-8601 instant. Parse with `new Date(...)` at the edge, not here. */
    DateTime: string;
    /** ISO-8601 calendar date. */
    Date: string;
    ID: string;
  };
}>();
