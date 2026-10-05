/**
 * `packages/policy`'s four-branch `canSee`, as a SQL `where` clause, built
 * once.
 *
 * A collection lists many rows in one keyset-paged query, so it cannot load
 * each row and call `canSee` on it; it has to hand Postgres the same rule.
 * That translation used to be written by hand three times —
 * `CellarsCollectionActor`, `CheckInsCollectionActor` (whose cellar clause is
 * the same rule again) and `TierListsCollectionActor` — each with its own copy
 * of the "friend ids from friendship rows" derivation, which `RankingsActor`
 * had a fourth copy of. A branch that drifted in one copy would be a row
 * visible on one screen and hidden on another, with every unit test green.
 *
 * The rule, branch for branch (`canSee` in `packages/policy`):
 *
 *   0. `bypassesPolicy` (system, admin)              → every row (`true`)
 *      anonymous                                     → no row (`false`)
 *   1. owner — creator, or a co-owner row            → visible
 *   2. `privacy = 'PUBLIC'`                          → visible
 *   3. `privacy = 'FRIENDS'` and the creator is one
 *      of the viewer's friends                       → visible
 *   4. otherwise                                     → hidden
 *
 * Each collection's parity test (`*-collection-actor.test.ts`) runs the clause
 * against the same fixtures `canSee` is asked about and compares the answers,
 * so this module and the pure rule cannot disagree silently.
 *
 * `false` rather than a throw for an anonymous caller: every caller has
 * already refused one (`requireSignedIn` in `authorize`), and a visibility
 * clause's job is to narrow.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { Friendship } from "@cellar-assistant/policy";
import { bypassesPolicy } from "@cellar-assistant/policy";
import { uuidArray } from "./collection-sql.ts";
import type { DbOrTx } from "./db.ts";
import { friendshipsOf } from "./visibility.ts";

/**
 * The other side of each friendship touching `viewer`, once each, without
 * `viewer` — the ids `canSee`'s third branch compares the creator against.
 * `friends` is directed and read in both directions (`./visibility.ts`), so
 * the steady state has two rows per friendship.
 */
export const friendIdsOf = (
  viewer: string,
  friendships: readonly Friendship[],
): string[] =>
  [
    ...new Set(
      friendships.map((row) =>
        row.userId === viewer ? row.friendId : row.userId,
      ),
    ),
  ].filter((id) => id !== viewer);

/** Who is asking, resolved once per query. */
export type VisibilityScope =
  | { readonly kind: "everything" }
  | { readonly kind: "nothing" }
  | {
      readonly kind: "viewer";
      readonly viewer: string;
      readonly friendIds: readonly string[];
    };

export const visibilityScope = async (
  db: DbOrTx,
  ctx: Ctx,
): Promise<VisibilityScope> => {
  if (bypassesPolicy(ctx)) return { kind: "everything" };
  const viewer = ctx.viewerId;
  if (viewer === null) return { kind: "nothing" };
  return {
    kind: "viewer",
    viewer,
    friendIds: friendIdsOf(viewer, await friendshipsOf(db, viewer)),
  };
};

/** Where the rule's inputs live in the query, as SQL fragments. */
export type VisibleRow = {
  /** The row's `created_by_id` column, e.g. the fragment `c.created_by_id`. */
  readonly createdBy: SQL;
  /** Its `permission_type` column, e.g. the fragment `c.privacy`. */
  readonly privacy: SQL;
  /**
   * The cellar id whose `cellar_owners` rows also count as owners — cellars
   * only; a tier list has no co-owner table.
   */
  readonly coOwnedCellarId?: SQL;
};

/** {@link visibleWhere} for a scope already resolved. */
export const canSeeSql = (scope: VisibilityScope, row: VisibleRow): SQL => {
  if (scope.kind === "everything") return sql`true`;
  if (scope.kind === "nothing") return sql`false`;
  const { viewer } = scope;
  const coOwner =
    row.coOwnedCellarId === undefined
      ? sql``
      : sql`
      or exists (
        select 1 from public.cellar_owners o
        where o.cellar_id = ${row.coOwnedCellarId} and o.user_id = ${viewer}::uuid
      )`;
  return sql`(
      ${row.createdBy} = ${viewer}::uuid${coOwner}
      or ${row.privacy} = 'PUBLIC'
      or (
        ${row.privacy} = 'FRIENDS'
        and ${row.createdBy} = any(${uuidArray(scope.friendIds, "friendId")})
      )
    )`;
};

/** `canSee(ctx, row)` for every row of a query, as its `where` clause. */
export const visibleWhere = async (
  db: DbOrTx,
  ctx: Ctx,
  row: VisibleRow,
): Promise<SQL> => canSeeSql(await visibilityScope(db, ctx), row);
