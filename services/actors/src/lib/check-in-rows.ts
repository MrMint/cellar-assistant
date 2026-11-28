/**
 * One `check_ins` row → `ItemCheckInDto`, for the raw-SQL readers
 * (`CheckInsCollectionActor`, `FriendsCollectionActor`'s CHECKED_IN feed).
 * `CheckInActor` maps its own Drizzle rows with the same rules
 * (`toEntryDto`), so the two paths cannot disagree about what a viewer sees.
 *
 * Columns only — nothing here issues a query or writes (the single-writer
 * scan, `packages/db/src/writers-scan.ts`).
 */
import type { ItemCheckInDto } from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { toIso } from "./collection-sql.ts";
import { ARCS, type ArcSqlRow } from "./item-arcs.ts";
import { placeRefVisibleToSql } from "./unshared-places.ts";
import type { VisibilityScope } from "./visibility-sql.ts";

export type CheckInSqlRow = ArcSqlRow & {
  readonly id: string;
  readonly user_id: string;
  readonly created_by_id: string;
  readonly cellar_item_id: string | null;
  /** ux-c L08: a "Made it" log's recipe (no item then), or null. */
  readonly recipe_id: string | null;
  readonly score: number | null;
  readonly note: string | null;
  readonly tags: readonly string[] | null;
  readonly place_id: string | null;
  readonly photo_file_id: string | null;
  readonly companion_ids: readonly string[] | null;
  /** `canSeeCheckInDetailsSql` for this viewer — see `toItemCheckInDto`. */
  readonly details_visible: boolean;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
};

/**
 * The select list for one entry, `alias` being the `check_ins` row. The
 * companions are the other rows of the same occasion, oldest first.
 * `details` is `canSeeCheckInDetailsSql` for the same viewer and alias.
 *
 * `place_id` comes back null when it names a place `scope` may not see — a
 * place still under review is its creator's alone (X27 / D28), so a friend's
 * "at <place>" must not name it, nor hand out its id
 * (`placeRefVisibleToSql`, the rule tier-list entries use).
 */
export const checkInColumns = (
  alias: string,
  details: SQL,
  scope: VisibilityScope,
): SQL => {
  const row = sql.identifier(alias);
  const placeId = sql`${row}.place_id`;
  const placeVisible = placeRefVisibleToSql(
    scope.kind === "everything"
      ? "everything"
      : scope.kind === "viewer"
        ? scope.viewer
        : null,
    placeId,
  );
  return sql`${row}.id, ${row}.user_id, ${row}.created_by_id,
    (${details}) as details_visible,
    ${row}.cellar_item_id, ${row}.recipe_id, ${row}.score, ${row}.note, ${row}.tags,
    (case when ${placeVisible} then ${placeId} end) as place_id,
    ${row}.photo_file_id, ${row}.created_at, ${row}.updated_at,
    ${ARCS.checkIns.columnList(alias)},
    coalesce((
      select array_agg(other.user_id order by other.created_at, other.id)
      from public.check_ins other
      where other.group_id = ${row}.group_id and other.id <> ${row}.id
    ), '{}'::uuid[]) as companion_ids`;
};

/**
 * `fromCellar` is the drinker's own view only (`ItemCheckInDto`'s doc): to
 * anyone else it reads `false`, so the entry says nothing about a cellar the
 * viewer may not be able to see.
 *
 * A viewer admitted only through the bottle's cellar (`details_visible`
 * false) gets the bare entry — who, what, when — and none of what the drinker
 * said about it (`canSeeCheckInDetails`).
 */
export const toItemCheckInDto = (
  row: CheckInSqlRow,
  viewerId: string | null,
): ItemCheckInDto => {
  const entry: ItemCheckInDto = {
    id: row.id,
    userId: row.user_id,
    createdById: row.created_by_id,
    item: ARCS.checkIns.refOf(row, "column"),
    recipe: row.recipe_id === null ? null : { id: row.recipe_id },
    score: row.score === null ? null : Number(row.score),
    note: row.note,
    tags: row.tags ?? [],
    placeId: row.place_id,
    photoFileId: row.photo_file_id,
    companionIds: (row.companion_ids ?? []).filter((id) => id !== row.user_id),
    fromCellar: row.cellar_item_id !== null && viewerId === row.user_id,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
  return row.details_visible === true ? entry : withoutDetails(entry);
};

/** The entry as a cellar viewer sees it: that it happened, and nothing said. */
export const withoutDetails = (entry: ItemCheckInDto): ItemCheckInDto => ({
  ...entry,
  score: null,
  note: null,
  tags: [],
  placeId: null,
  photoFileId: null,
  companionIds: [],
});
