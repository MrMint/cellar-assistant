/**
 * gql.tada, bound to the API's schema.
 *
 * `packages/schema` holds `schema.graphql` — `printSchema` output written by
 * `services/api` and checked in — plus the `graphql-env.d.ts` generated from it.
 * Nothing introspects a running server, so `bun run typecheck` does not need the
 * stack up and the types cannot drift from what CI built.
 *
 * D1 imported this by relative path because the root package did not depend on
 * the workspace package and adding it needed a root `pnpm install` it could not
 * run while a dev server was live against Hasura. D9 removed the Hasura lane and
 * ran that install, so this is now the package specifier.
 */
export type {
  FragmentOf,
  ResultOf,
  VariablesOf,
} from "@cellar-assistant/schema";
export { graphql, readFragment } from "@cellar-assistant/schema";
