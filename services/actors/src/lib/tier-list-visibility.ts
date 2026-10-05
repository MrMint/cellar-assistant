/**
 * The fix for `target-stack.md` §7's live authorization hole — C1's to close.
 *
 * > `search_places_adaptive_cluster` reads `tier_list_items` inside a
 * > `SECURITY INVOKER` function so tier-list privacy is not enforced on the map
 *
 * A3b ported that function faithfully and left a `COMMENT ON FUNCTION` naming
 * C1 as the fix site. `search_places_hybrid` has the identical hole in its
 * three `EXISTS (SELECT 1 FROM tier_list_items …)` clauses. Both take
 * `tier_list_ids uuid[]`, and neither knows who is asking, so **any caller who
 * knows or guesses a private tier list's id gets its places back** — on Nhost
 * today, and in the ported SQL until this module is used.
 *
 * ## Why the fix is here and not in the SQL
 *
 * §1.6 and §2.4 are explicit: there is no RLS and no in-SQL authorization in
 * the new stack. So the function keeps its body, and the *argument* is
 * sanitised before it is passed. `visibleTierListIds` answers the same question
 * `TierListActor` answers — B7 made `canSeeTierList` the rule, creator-only for
 * writes, four-branch for reads — over a *set* of ids in one round trip.
 *
 * ## Refusing is not the same as not filtering
 *
 * The subtle failure, and the reason `resolveTierListFilter` returns a shape
 * rather than an array: both SQL functions treat `tier_list_ids IS NULL` as
 * "no tier-list filter at all". So a caller who asks for one private tier list
 * they cannot see must **not** have their filter reduced to `NULL` — that would
 * silently widen the query from "these 12 places" to "every place in the
 * viewport", which is the opposite of a denial. The rule is:
 *
 *   - no ids requested            → no filter, and no tier-list read;
 *   - ids requested, some visible → filter to exactly the visible ones;
 *   - ids requested, none visible → **empty result**, without calling the SQL.
 *
 * A viewer therefore cannot tell a private tier list they cannot see from one
 * that does not exist, which is the same `NotFound`-shaped answer B1 and B7
 * give for an aggregate.
 *
 * ## Who must use this
 *
 * Everything that passes `tier_list_ids` to either SQL function, which is
 * `services/actors/src/lib/place-search-sql.ts` and nothing else.
 * `place-search-sql.test.ts` asserts statically that no other module in
 * `services/actors` so much as names those functions, so the gate cannot be
 * routed around by a later workstream — C2's `MapActor` included.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { tierLists } from "@cellar-assistant/db";
import { inArray } from "@cellar-assistant/db/orm";
import { canSeeTierList, isFriend } from "@cellar-assistant/policy";
import type { DbOrTx } from "./db.ts";
import { policyFriendships } from "./visibility.ts";

/**
 * The subset of `ids` this viewer may see, in the order given.
 *
 * Ids that do not exist are simply absent, exactly like ids that exist and are
 * private: the caller cannot distinguish the two, which is the point.
 */
export const visibleTierListIds = async (
  db: DbOrTx,
  ctx: Ctx,
  ids: readonly string[],
): Promise<readonly string[]> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];

  const rows = await db
    .select({
      id: tierLists.id,
      createdById: tierLists.createdById,
      privacy: tierLists.privacy,
    })
    .from(tierLists)
    .where(inArray(tierLists.id, unique));
  if (rows.length === 0) return [];

  // One friendship read for the whole set, not one per tier list.
  const friendships = await policyFriendships(db, ctx);

  const visible = new Set(
    rows
      .filter((row) =>
        canSeeTierList(ctx, {
          createdById: row.createdById,
          privacy: row.privacy,
          viewerIsFriendOfCreator: isFriend(ctx, row.createdById, friendships),
        }),
      )
      .map((row) => row.id),
  );
  return unique.filter((id) => visible.has(id));
};

/**
 * What a place search should do about the tier-list filter it was handed.
 *
 * `kind: "none"` — no filter was asked for.
 * `kind: "filter"` — pass `ids` to the SQL function.
 * `kind: "empty"` — a filter was asked for and nothing in it is visible; return
 * no rows **without** calling the SQL, because passing `NULL` would drop the
 * filter entirely (module doc).
 */
export type TierListFilter =
  | { readonly kind: "none" }
  | { readonly kind: "filter"; readonly ids: readonly string[] }
  | { readonly kind: "empty" };

export const resolveTierListFilter = async (
  db: DbOrTx,
  ctx: Ctx,
  requested: readonly string[] | null | undefined,
): Promise<TierListFilter> => {
  if (requested == null || requested.length === 0) return { kind: "none" };
  const ids = await visibleTierListIds(db, ctx, requested);
  return ids.length === 0 ? { kind: "empty" } : { kind: "filter", ids };
};
