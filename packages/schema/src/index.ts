/**
 * The printed API schema, and gql.tada configured against it.
 *
 * `schema.graphql` is written by `services/api` (`bun run --filter
 * @cellar-assistant/api schema:print`) and checked in; `graphql-env.d.ts` is
 * generated *from that file* by `bun run --filter @cellar-assistant/schema
 * build`. Neither step introspects a running server, so type checking needs
 * no stack and cannot drift from what CI built.
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
