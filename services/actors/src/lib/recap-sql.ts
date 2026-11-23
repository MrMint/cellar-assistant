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
import type { ItemType, RecapLogRow } from "@cellar-assistant/contracts";
import { isItemType } from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
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

const itemTypeSql = sql`case
  when ci.wine_id is not null then 'WINE'
  when ci.beer_id is not null then 'BEER'
  when ci.spirit_id is not null then 'SPIRIT'
  when ci.coffee_id is not null then 'COFFEE'
  when ci.sake_id is not null then 'SAKE'
  when ci.tea_id is not null then 'TEA'
end`;

/**
 * The viewer's logs up to the window's end (all of them with no window).
 * `scope` is the viewer's recipe scope (`recipeScope`), for recipe names.
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
      ${itemTypeSql} as item_type,
      coalesce(ci.wine_id, ci.beer_id, ci.spirit_id, ci.coffee_id, ci.sake_id,
               ci.tea_id)::text as item_id,
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
    left join public.wines w on w.id = ci.wine_id
    left join public.beers b on b.id = ci.beer_id
    left join public.spirits s on s.id = ci.spirit_id
    left join public.coffees c on c.id = ci.coffee_id
    left join public.sakes sk on sk.id = ci.sake_id
    left join public.teas t on t.id = ci.tea_id
    left join public.recipes r on r.id = ci.recipe_id
    where ci.user_id = ${viewerId}::uuid and ${upTo}
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
