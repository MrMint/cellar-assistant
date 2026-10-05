/**
 * Relay connection ⇄ actor `Page` (§1.5, §8.3).
 *
 * The two functions below are the whole of it, and every list field in every B
 * and C workstream is written the same way:
 *
 * ```ts
 * t.connection({
 *   type: SomeType,
 *   resolve: async (_root, args, context) =>
 *     connectionFromPage(
 *       await context.actor(SomeCollectionActorDescriptor, context.ctx.viewerId ?? "")
 *         .list(toPageArgs(args)),
 *     ),
 * })
 * ```
 *
 * ## Every paging *root* field carries an error union (A7e)
 *
 * A connection field is non-null, so an error raised anywhere under it nulls
 * the field, and a null cannot stop at a non-null field: it propagates to the
 * root and the whole response becomes `data: null`. On a root field that is
 * the entire document. A7c found this on `referenceData` — a form filling ten
 * dropdowns aliases one field ten times, and one alias over the 100-row cap
 * blanked the other nine — and gave that field `errors: {}` so the failure is
 * a *value* in `data` instead. A7e finished the set: the eight remaining
 * paging root fields (`itemSearch`, `cellarItemSearch`, `brandSearch`,
 * `recipeSearch`, `userSearch`, `placeSearch`, `mapBrowse`, `rankings`) now do
 * the same, so `Query<Field>Result` is the one shape a client branches on.
 *
 * **Only a typed `ActorError` becomes a union member.** `plugin-errors` is
 * configured (`builder.ts`) with exactly the five classes actors throw, and
 * `dapr.ts` reconstructs those from the wire envelope — a `200` carrying
 * `X-Daprerrorresponseheader`. A transport failure is an
 * `ActorInvocationError`, which is none of the five, so it is re-thrown, masked
 * by `index.ts`, and still arrives as a top-level GraphQL error. "The sidecar
 * is down" must never read to a client as "your input was invalid".
 */
import type { Page, PageArgs } from "@cellar-assistant/contracts";
import { pageArgs, ValidationError } from "@cellar-assistant/contracts";

/** The four arguments `plugin-relay` adds to every connection field. */
export type ConnectionArgs = {
  first?: number | null;
  after?: string | null;
  last?: number | null;
  before?: string | null;
};

/**
 * Paging is forward-only. `last`/`before` exist in the schema because the Relay
 * spec puts them there, but no actor implements backward paging and silently
 * ignoring them would return the *first* page to a client that asked for the
 * last one.
 */
export const toPageArgs = (args: ConnectionArgs): PageArgs => {
  if (args.last != null || args.before != null) {
    throw new ValidationError(
      "backward pagination (last/before) is not supported; use first/after",
    );
  }
  return pageArgs({ first: args.first, after: args.after });
};

export type Connection<T> = {
  edges: { cursor: string; node: T }[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  totalCount: number | null;
};

export const connectionFromPage = <T>(page: Page<T>): Connection<T> => ({
  edges: page.entries.map(({ cursor, node }) => ({ cursor, node })),
  pageInfo: {
    hasNextPage: page.hasNextPage,
    hasPreviousPage: page.hasPreviousPage,
    startCursor: page.entries[0]?.cursor ?? null,
    endCursor: page.entries.at(-1)?.cursor ?? null,
  },
  totalCount: page.totalCount,
});
