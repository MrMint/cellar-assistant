/**
 * `canSeeCheckIn` (`@cellar-assistant/policy`) as SQL, for the readers that
 * filter many `check_ins` rows at once — the item page's list
 * (`CheckInsCollectionActor`), the friends feed (`FriendsCollectionActor`) and
 * a log's photo (`FileActor`). `CheckInActor` decides one row with the policy
 * function itself; `check-in-visibility.test.ts` holds the two to the same
 * answers.
 *
 * Branch for branch, in the policy's order:
 *
 *   1. the entry is about the viewer (`user_id`);
 *   2. the viewer has a row of their own in the same occasion (`group_id`) —
 *      a companion;
 *   3. the entry is about a friend of the viewer;
 *   4. it still points at a bottle (`cellar_item_id` is set) in a cellar the
 *      viewer can see — `canSeeCellar`, the four-branch rule.
 *
 * A bottle-less entry has no fourth branch, which is what keeps it private to
 * the drinker, their companions and their friends.
 */
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { uuidArray } from "./collection-sql.ts";
import { canSeeSql, type VisibilityScope } from "./visibility-sql.ts";

/** `alias` is the `check_ins` row's alias in the caller's query (`ci`). */
export const canSeeCheckInSql = (
  scope: VisibilityScope,
  alias: string,
): SQL => {
  if (scope.kind === "everything") return sql`true`;
  if (scope.kind === "nothing") return sql`false`;
  const row = sql.identifier(alias);
  const cellar = canSeeSql(scope, {
    createdBy: sql`vc.created_by_id`,
    privacy: sql`vc.privacy`,
    coOwnedCellarId: sql`vc.id`,
  });
  return sql`(
    ${row}.user_id = ${scope.viewer}::uuid
    or exists (
      select 1 from public.check_ins companion
      where companion.group_id = ${row}.group_id
        and companion.user_id = ${scope.viewer}::uuid
    )
    or ${row}.user_id = any(${uuidArray(scope.friendIds, "friendId")})
    or exists (
      select 1 from public.cellar_items vi
      join public.cellars vc on vc.id = vi.cellar_id
      where vi.id = ${row}.cellar_item_id and ${cellar}
    )
  )`;
};
