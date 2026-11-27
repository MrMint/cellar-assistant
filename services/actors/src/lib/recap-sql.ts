/**
 * L04 — the recap's own read of the drink log (L32, L45): one query over the
 * viewer's `check_ins`, joined to the item or recipe each points at, into
 * `RecapLogRow`. It never goes through `check-in-rows.ts` or `ItemCheckInDto`.
 *
 * The rows run from the start of the viewer's history to the end of the
 * period, each flagged `inPeriod`, so `recap-cards.ts` can tell "new to you"
 * from "had before" without a second query. With no period, every row is
 * in-period (the all-time stamps on Me).
 *
 * Whose log: `check_ins.user_id` is the drinker, so a log a friend wrote for
 * you counts and one you wrote for a friend does not. The drink date is
 * `created_at` (the log's `drankAt`; there is no separate column).
 *
 * What counts as a "style" and a "region" per type:
 *
 * | type | style | region |
 * |---|---|---|
 * | wine | variety, else style | region, else country |
 * | beer | style | country |
 * | spirit | type | country |
 * | coffee | process, else roast level | country |
 * | sake | type | region, else country |
 * | tea | category | region, else country |
 *
 * A recipe's name is returned only when the viewer may still see the recipe
 * (`recipeVisibleSql`): a log outlives a recipe going private, and the count
 * may keep it, but its name must not leak into a chip or a share image.
 */
import type {
  ItemType,
  RecapLogRow,
  RecapPeriodKind,
} from "@cellar-assistant/contracts";
import { isItemType, RECAP_PERIODS_LIMIT } from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";
import type { RecipeScope } from "./recipe-visibility.ts";
import { recipeVisibleSql } from "./recipe-visibility.ts";

export type RecapWindow = {
  /** Local wall-clock start (inclusive), `YYYY-MM-DDT00:00:00`. */
  readonly start: string;
  /** Local wall-clock end (exclusive). */
  readonly end: string;
  readonly timeZone: string;
};

type Row = {
  readonly item_type: string | null;
  readonly item_id: string | null;
  readonly recipe_id: string | null;
  readonly name: string | null;
  readonly style: string | null;
  readonly region: string | null;
  readonly score: number | string | null;
  readonly in_period: boolean;
};

const arc = ARCS.checkIns;
const joinOn = (type: ItemType, alias: string): SQL =>
  sql`${sql.identifier(alias)}.id = ${arc.column(type, "ci")}`;

/**
 * The viewer's logs up to the window's end (all of them with no window).
 * `scope` is the viewer's recipe scope (`recipeScope`): a recipe log whose
 * recipe the viewer may not see is not read at all (FR-8), so neither the
 * recap's cards nor its stamps count it.
 */
export const readRecapLogs = async (
  db: DbOrTx,
  viewerId: string,
  scope: RecipeScope,
  window: RecapWindow | null,
): Promise<RecapLogRow[]> => {
  const inPeriod: SQL =
    window === null
      ? sql`true`
      : sql`ci.created_at >= (${window.start}::timestamp at time zone ${window.timeZone})`;
  const upTo: SQL =
    window === null
      ? sql`true`
      : sql`ci.created_at < (${window.end}::timestamp at time zone ${window.timeZone})`;
  const result = await db.execute<Row>(sql`
    select
      ${arc.typeExpr("ci")} as item_type,
      ${arc.idExpr("ci")}::text as item_id,
      ci.recipe_id::text as recipe_id,
      coalesce(w.name, b.name, s.name, c.name, sk.name, t.name,
               case when r.id is not null and ${recipeVisibleSql(scope, "r")}
                    then r.name end) as name,
      coalesce(w.variety, w.style, b.style, s.type, c.process::text,
               c.roast_level::text, sk.type, t.category) as style,
      coalesce(w.region, sk.region, t.region, w.country, b.country, s.country,
               c.country, sk.country, t.country) as region,
      ci.score as score,
      (${inPeriod}) as in_period
    from public.check_ins ci
    left join public.wines w on ${joinOn("WINE", "w")}
    left join public.beers b on ${joinOn("BEER", "b")}
    left join public.spirits s on ${joinOn("SPIRIT", "s")}
    left join public.coffees c on ${joinOn("COFFEE", "c")}
    left join public.sakes sk on ${joinOn("SAKE", "sk")}
    left join public.teas t on ${joinOn("TEA", "t")}
    left join public.recipes r on r.id = ci.recipe_id
    where ci.user_id = ${viewerId}::uuid and ${upTo}
      -- FR-8 (CB-1), canSeeRecipeLog for your own log: a recipe log counts
      -- only while you may see its recipe (a deleted recipe's log names none).
      and (ci.recipe_id is null
           or (r.id is not null and ${recipeVisibleSql(scope, "r")}))
    order by ci.created_at, ci.id
  `);
  return result.rows.map((row) => ({
    itemType:
      row.item_type !== null && isItemType(row.item_type)
        ? (row.item_type as ItemType)
        : null,
    itemId: row.item_id,
    recipeId: row.recipe_id,
    name: row.name,
    style: row.style,
    region: row.region,
    score: row.score === null ? null : Number(row.score),
    inPeriod: row.in_period === true,
  }));
};

/** `ts` inside the window, read in the window's zone. */
const inWindow = (ts: SQL, window: RecapWindow): SQL => sql`(
  ${ts} >= (${window.start}::timestamp at time zone ${window.timeZone})
  and ${ts} < (${window.end}::timestamp at time zone ${window.timeZone})
)`;

/**
 * MC-recap / L4: the two totals the drink log cannot give. A rating is one of
 * the viewer's `item_reviews` (the stars the item page reads) created or
 * changed in the window; a bottle is a `cellar_items` row the viewer created,
 * in any cellar, co-owned ones included. `created_by` is who added it, so a
 * co-owner's additions to the same cellar never count.
 */
export const readRecapTotals = async (
  db: DbOrTx,
  viewerId: string,
  window: RecapWindow,
): Promise<{ readonly ratings: number; readonly bottlesAdded: number }> => {
  const result = await db.execute<{
    readonly ratings: number | string;
    readonly bottles_added: number | string;
  }>(sql`
    select
      (select count(*) from public.item_reviews r
        where r.user_id = ${viewerId}::uuid
          and (${inWindow(sql`r.created_at`, window)}
               or ${inWindow(sql`r.updated_at`, window)})) as ratings,
      (select count(*) from public.cellar_items ci
        where ci.created_by = ${viewerId}::uuid
          and ${inWindow(sql`ci.created_at`, window)}) as bottles_added
  `);
  const row = result.rows[0];
  return {
    ratings: Number(row?.ratings ?? 0),
    bottlesAdded: Number(row?.bottles_added ?? 0),
  };
};

/**
 * MC-recap: every period, in `recap(period)`'s format, holding any activity
 * the totals count, newest first. Check-ins follow `readRecapLogs`' rule (a
 * recipe log counts only while the viewer may see its recipe), so a listed
 * period never opens on an empty recap.
 */
export const readRecapPeriods = async (
  db: DbOrTx,
  viewerId: string,
  scope: RecipeScope,
  kind: RecapPeriodKind,
  timeZone: string,
): Promise<string[]> => {
  const format = kind === "MONTH" ? "YYYY-MM" : "YYYY";
  const result = await db.execute<{ readonly period: string }>(sql`
    with activity(at) as (
      select ci.created_at
      from public.check_ins ci
      left join public.recipes r on r.id = ci.recipe_id
      where ci.user_id = ${viewerId}::uuid
        and (ci.recipe_id is null
             or (r.id is not null and ${recipeVisibleSql(scope, "r")}))
      union all
      select r.created_at from public.item_reviews r
      where r.user_id = ${viewerId}::uuid
      union all
      select r.updated_at from public.item_reviews r
      where r.user_id = ${viewerId}::uuid
      union all
      select ci.created_at from public.cellar_items ci
      where ci.created_by = ${viewerId}::uuid
    )
    select distinct to_char(at at time zone ${timeZone}, ${format}) as period
    from activity
    where at is not null
    order by period desc
    limit ${RECAP_PERIODS_LIMIT}
  `);
  return result.rows.map((row) => row.period);
};
