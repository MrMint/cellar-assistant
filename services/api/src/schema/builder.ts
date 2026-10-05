/**
 * The Pothos builder every schema module shares.
 *
 * Three plugins, each pinned to a rule in the migration plan:
 *
 * - `plugin-relay` — §8.3, "every list field is a Relay connection".
 * - `plugin-errors` — §8.3, "mutations return `<Command>Result` unions … the
 *   payload or a typed error".
 * - `plugin-dataloader` — §1.5, "Pothos resolves ids through a DataLoader that
 *   batches into parallel entity-actor calls".
 */
import {
  BudgetExceededError,
  ConflictError,
  DEFAULT_PAGE_SIZE,
  ForbiddenError,
  MAX_PAGE_SIZE,
  NotFoundError,
  ValidationError,
} from "@cellar-assistant/contracts";
import SchemaBuilder from "@pothos/core";
import DataloaderPlugin from "@pothos/plugin-dataloader";
import ErrorsPlugin from "@pothos/plugin-errors";
import RelayPlugin from "@pothos/plugin-relay";
import type { ApiContext } from "../context.ts";

const capitalize = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const builder = new SchemaBuilder<{
  Context: ApiContext;
  Scalars: {
    /** ISO-8601 instant. Actors serialise `timestamptz` as a string. */
    DateTime: { Input: string; Output: string };
    /** ISO-8601 calendar date (`vintage` and friends are `date`, not `timestamptz`). */
    Date: { Input: string; Output: string };
    /**
     * An arbitrary JSON value. `tier_lists.ai_insights` (B7) is the only
     * caller today — a `jsonb` column whose shape is `generateInsights`'s to
     * decide, not this schema's.
     */
    JSON: { Input: unknown; Output: unknown };
  };
  /** Merged into every connection type — see `globalConnectionFields` below. */
  Connection: { totalCount: number | null };
  DefaultEdgesNullability: false;
  DefaultNodeNullability: false;
  /**
   * Pothos v4 defaults fields to nullable. The schema this replaces (Hasura's)
   * was non-null wherever the column was, and every D workstream is porting
   * queries against it — defaulting to nullable would add a null check to
   * every field the frontend reads. Nullability is declared, not inherited.
   */
  DefaultFieldNullability: false;
}>({
  defaultFieldNullability: false,
  // The errors plugin wraps resolvers, so it goes first: anything a later
  // plugin throws should still land in the field's error union.
  plugins: [ErrorsPlugin, RelayPlugin, DataloaderPlugin],

  relay: {
    /**
     * No `Node` interface and no global ids. The frontend addresses rows by
     * their raw uuid today and every D workstream keeps doing so; adopting
     * opaque global ids is a decision for the whole schema at once, not a
     * side effect of A7. The plugin is here for connections.
     */
    nodeQueryOptions: false,
    nodesQueryOptions: false,
    cursorType: "String",
    // Non-null edges and nodes. A null edge in a list the server just built is
    // not a case any client should have to handle.
    edgesFieldOptions: { nullable: false },
    nodeFieldOptions: { nullable: false },

    /**
     * **A7d item 2: the page cap is documented once, on every connection.**
     *
     * `first` is capped at `MAX_PAGE_SIZE` by `pageArgs`, and `pageArgs`
     * *rejects* rather than clamping — deliberately (`packages/contracts/src/
     * page.ts`: "a client asking for 5000 rows has a bug, and returning 100
     * without saying so hides it"). D3 and D6 both hit that cap without
     * knowing it existed, because nothing in the schema mentioned it. A7c
     * fixed how the error *reads* (it is a typed `VALIDATION` now, not
     * "Unexpected error"); this is the other half of the same report — a
     * client should not have to discover the limit by exceeding it.
     *
     * These four hooks are the only place it can be said once. `first` is
     * added to *every* connection field by the relay plugin, so a description
     * written here reaches all ~37 of them and a connection added tomorrow
     * gets it for free; there is no per-field option to forget. The number is
     * interpolated from the constant rather than typed out, matching
     * `map.ts`'s `MAP_RESULT_CAP` arg description — the house style — so the
     * prose cannot drift from the enforcement.
     *
     * `last`/`before` are documented as unsupported for the reason
     * `toPageArgs` throws on them: no actor implements backward paging, and
     * silently returning the *first* page to a client that asked for the last
     * one is worse than refusing.
     */
    firstArgOptions: {
      description:
        `How many edges to return, 1 to ${MAX_PAGE_SIZE} inclusive; ` +
        `defaults to ${DEFAULT_PAGE_SIZE}. Over the cap is a ` +
        "`VALIDATION` error, not a silent clamp.",
    },
    afterArgOptions: {
      description:
        "An `edge.cursor` from a previous page. Opaque and owned by the " +
        "actor that minted it: cursors are not interchangeable between fields.",
    },
    lastArgOptions: {
      description:
        "**Not supported.** Present because the Relay spec puts it here; " +
        "passing it is a `VALIDATION` error rather than a silently forward " +
        "page. Paging is forward-only — use `first`/`after`.",
    },
    beforeArgOptions: {
      description: "**Not supported.** See `last`. Paging is forward-only.",
    },
  },

  errors: {
    /**
     * Every field that opts in with `errors: {}` gets exactly these five —
     * the classes actors throw (`packages/contracts/src/errors.ts`), which
     * `dapr.ts` reconstructs from the wire envelope so `instanceof` works.
     */
    defaultTypes: [
      NotFoundError,
      ForbiddenError,
      ConflictError,
      ValidationError,
      BudgetExceededError,
    ],
    /**
     * The union is the payload *or* an error, with no `…Success { data }`
     * wrapper in between.
     */
    directResult: true,
    defaultUnionOptions: {
      // §8.3 names these `<Command>Result`. A mutation's field name is the
      // command, so `Mutation.checkIn` → `CheckInResult`; a query keeps its
      // parent in the name to avoid colliding with the mutation of the same
      // name.
      name: ({ parentTypeName, fieldName }) =>
        parentTypeName === "Mutation"
          ? `${capitalize(fieldName)}Result`
          : `${parentTypeName}${capitalize(fieldName)}Result`,
    },
  },
});

/**
 * §8.3: "`totalCount` where cheap". Every connection carries it; an actor that
 * cannot count cheaply returns `null` rather than paying for a count.
 */
builder.globalConnectionFields((t) => ({
  totalCount: t.int({
    nullable: true,
    description:
      "Total rows matching the query, or null when counting is not cheap.",
    resolve: (parent) => parent.totalCount,
  }),
}));

/**
 * The root types are declared here, before any module adds a field to them, so
 * that every schema module can use `builder.queryField` / `builder.mutationField`
 * and stay a leaf in the import graph.
 */
builder.queryType({});
builder.mutationType({});
