/**
 * `canSeeCheckIn` (`@cellar-assistant/policy`) as SQL, for the readers that
 * filter many `check_ins` rows at once — the item page's list
 * (`CheckInsCollectionActor`), the friends feed (`FriendsCollectionActor`) and
 * a log's photo (`FileActor`). `CheckInActor` decides one row with the policy
 * function itself; `check-ins-collection-actor.test.ts` holds the SQL and the
 * policy to the same answers, and it and `file-actor.test.ts` pin the
 * details rule.
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
 * the drinker, their companions and their friends. And the fourth branch
 * admits the *entry* only — that a bottle was drunk, when and by whom — never
 * what the drinker said about it (`canSeeCheckInDetails`, below).
 *
 * ux-c L08: a "Made it" log names a recipe, and is visible only to a viewer
 * who may also see that recipe (`canSeeRecipeLog`) — `recipeRefVisibleSql`,
 * which is false for a recipe id that names nothing, as the policy is for a
 * recipe it was not handed. A log whose recipe was deleted (`recipe_id` set
 * null, L44) is an ordinary bottle-less check-in.
 */
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { uuidArray } from "./collection-sql.ts";
import { recipeRefVisibleSql } from "./recipe-visibility.ts";
import { canSeeSql, type VisibilityScope } from "./visibility-sql.ts";

/** `alias` is the `check_ins` row's alias in the caller's query (`ci`). */
export const canSeeCheckInSql = (
  scope: VisibilityScope,
  alias: string,
): SQL => {
  if (scope.kind === "everything") return sql`true`;
  if (scope.kind === "nothing") return sql`false`;
  const row = sql.identifier(alias);
  const personal = canSeeCheckInDetailsSql(scope, alias);
  const cellar = canSeeSql(scope, {
    createdBy: sql`vc.created_by_id`,
    privacy: sql`vc.privacy`,
    coOwnedCellarId: sql`vc.id`,
  });
  const recipe = recipeRefVisibleSql(
    { kind: "viewer", viewer: scope.viewer, friendIds: scope.friendIds },
    sql`${row}.recipe_id`,
  );
  return sql`((
    ${personal}
    or exists (
      select 1 from public.cellar_items vi
      join public.cellars vc on vc.id = vi.cellar_id
      where vi.id = ${row}.cellar_item_id and ${cellar}
    )
  ) and (${row}.recipe_id is null or ${recipe}))`;
};

/**
 * `canSeeCheckInDetails` as SQL: branches 1–3 above, without the cellar. A
 * row the viewer sees *only* through a cellar comes back without the
 * drinker's score, note, tags, place, photo and companions
 * (`toItemCheckInDto`), and its photo is not readable (`FileActor`).
 */
export const canSeeCheckInDetailsSql = (
  scope: VisibilityScope,
  alias: string,
): SQL => {
  if (scope.kind === "everything") return sql`true`;
  if (scope.kind === "nothing") return sql`false`;
  const row = sql.identifier(alias);
  return sql`(
    ${row}.user_id = ${scope.viewer}::uuid
    or exists (
      select 1 from public.check_ins companion
      where companion.group_id = ${row}.group_id
        and companion.user_id = ${scope.viewer}::uuid
    )
    or ${row}.user_id = any(${uuidArray(scope.friendIds, "friendId")})
  )`;
};
