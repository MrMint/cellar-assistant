/**
 * "Cellars this user created or co-owns" as SQL — the ownership half of
 * `canSeeCellar`, without privacy (an owner sees their own cellar whatever it
 * is set to). Shared by the readers that count or list *somebody's* cellars:
 * `CellarsCollectionActor` (the viewer's own, for `stats` and the Yours-first
 * sort), `UserActor.counts` (the Me hub's bottles, X18) and
 * `FriendsCollectionActor.profileCellars` (a friend's, X18) — so "whose
 * cellar" means one thing everywhere.
 *
 * Columns only; nothing here issues a query.
 */
import { type SQL, sql } from "@cellar-assistant/db/orm";

/** `alias` is the `cellars` row's alias in the caller's query (`c`). */
export const cellarOwnedBySql = (userId: string, alias = "c"): SQL => {
  const row = sql.identifier(alias);
  return sql`(
  ${row}.created_by_id = ${userId}::uuid
  or exists (
    select 1 from public.cellar_owners o
    where o.cellar_id = ${row}.id and o.user_id = ${userId}::uuid
  )
)`;
};
