/**
 * Yours / From friends / Discover (decision D2, roadmap X11) as SQL: the
 * `section` argument of `CellarsCollectionActor.list` and
 * `TierListsCollectionActor.list`.
 *
 * A section is `and`ed with the collection's visibility clause, never used
 * instead of it, so it can only narrow what `canSee` already admits. The
 * three are a partition of that set (`COLLECTION_SECTIONS` in
 * `@cellar-assistant/contracts` has the table), which is what lets the page
 * render three lists without a row appearing twice — and what keeps a
 * stranger's PUBLIC cellar out of "Yours" by construction rather than by a
 * client-side filter over a paged connection.
 *
 * The friend ids come from the same read the visibility clause uses
 * (`visibilityScope`), so a section and the clause it narrows cannot disagree
 * about who is a friend. An admin's visibility scope is `everything` and
 * carries no friend ids, so they are read separately there.
 */
import type { CollectionSection, Ctx } from "@cellar-assistant/contracts";
import {
  isCollectionSection,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { uuidArray } from "./collection-sql.ts";
import type { DbOrTx } from "./db.ts";
import { friendshipsOf } from "./visibility.ts";
import {
  canSeeSql,
  friendIdsOf,
  type VisibleRow,
  visibilityScope,
} from "./visibility-sql.ts";

/** The argument as it arrives over the actor boundary: checked, not trusted. */
export const requireSection = (value: unknown): CollectionSection | null => {
  if (value === undefined || value === null) return null;
  if (isCollectionSection(value)) return value;
  throw new ValidationError(
    `not a collection section: ${JSON.stringify(value)}`,
  );
};

/**
 * Whether the row is the viewer's own: its creator, or — for a cellar — a
 * co-owner. Privacy plays no part.
 */
export const ownedSql = (viewer: string, row: VisibleRow): SQL => {
  const coOwner =
    row.coOwnedCellarId === undefined
      ? sql``
      : sql`
      or exists (
        select 1 from public.cellar_owners o
        where o.cellar_id = ${row.coOwnedCellarId} and o.user_id = ${viewer}::uuid
      )`;
  return sql`(${row.createdBy} = ${viewer}::uuid${coOwner})`;
};

/** One section's own condition, before the visibility clause is added. */
export const sectionSql = (
  section: CollectionSection,
  viewer: string,
  friendIds: readonly string[],
  row: VisibleRow,
): SQL => {
  const owned = ownedSql(viewer, row);
  const byFriend = sql`${row.createdBy} = any(${uuidArray(friendIds, "friendId")})`;
  switch (section) {
    case "MINE":
      return owned;
    case "FRIENDS":
      return sql`(not ${owned} and ${byFriend} and ${row.privacy} in ('PUBLIC', 'FRIENDS'))`;
    case "DISCOVER":
      return sql`(not ${owned} and not (${byFriend}) and ${row.privacy} = 'PUBLIC')`;
  }
};

/**
 * The visibility clause, narrowed to `section` when one is given — the
 * `where` a sectioned collection pages and counts by.
 */
export const sectionedVisibleWhere = async (
  db: DbOrTx,
  ctx: Ctx,
  row: VisibleRow,
  section: CollectionSection | null,
): Promise<SQL> => {
  const scope = await visibilityScope(db, ctx);
  const visible = canSeeSql(scope, row);
  const viewer = ctx.viewerId;
  if (section === null || viewer === null || scope.kind === "nothing") {
    return visible;
  }
  const friendIds =
    scope.kind === "viewer"
      ? scope.friendIds
      : friendIdsOf(viewer, await friendshipsOf(db, viewer));
  return sql`(${visible} and ${sectionSql(section, viewer, friendIds, row)})`;
};
