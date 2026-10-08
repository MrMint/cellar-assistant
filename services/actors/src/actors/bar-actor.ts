/**
 * `BarActor(viewerId)` — X14's view actor: the viewer's bar, and every
 * cocktail judged against it (decisions D9, D18/G29, D23).
 *
 * | method | serves |
 * |---|---|
 * | `inventory` | `RecipeIngredient.availability` (Have / Substitute / Missing) |
 * | `whatCanIMake` | `/recipes/bar`: Make now · One bottle away (G29) |
 * | `cocktailsFor` | an item page's "Cocktails with this" / "Use it up" |
 *
 * ## What "the viewer's bar" is
 *
 * - **Bottles**: `cellar_items` not yet finished (`empty_at is null` and some
 *   left in it) in cellars the viewer **created or co-owns** — the same
 *   ownership predicate `CellarsCollectionActor` uses for "your cellars".
 *   A friend's shared cellar is not your bar; privacy plays no part because
 *   ownership is the whole filter. Each bottle is read as one kind
 *   (`bottleKind` in contracts `bar.ts`).
 * - **The Bar pantry** (D23): the ~30 toggles in `bar_pantry_items`.
 *
 * ## Why a view actor, and why it holds nothing
 *
 * Every row here belongs to another actor — `cellar_items` to `CellarActor`,
 * `bar_pantry_items` to `UserActor`, the recipes to `RecipeActor` — so §1.3
 * forbids caching any of it: a bottle finished or a toggle flipped between two
 * calls must show on the next one. Each method is one or two fresh reads.
 * Keyed by the viewer, and every turn checks `ctx.viewerId === this.key`, as
 * `ViewActorBase` does (an id is an address, not a credential).
 *
 * ## The scan, and its cap
 *
 * Availability is computed in memory by the same pure functions the API and
 * the browser use (`recipeMakeability`), over the {@link BAR_RECIPE_SCAN_CAP}
 * newest cocktail recipes and all their ingredients — one query. Kinds and
 * roles not yet stored are inferred from the referenced item's name in the
 * same pass (`inferIngredientMeta`), so the screen is right before the
 * backfill has run, not only after. Past the cap the answer says how many it
 * looked at (`scanned`), rather than implying it saw the whole catalog.
 *
 * Writes nothing; no entry in `TABLE_WRITERS`.
 */
import type {
  ActorCategory,
  BarActorInterface,
  BarBottle,
  BarInventory,
  BarKind,
  BarRecipeMatch,
  Ctx,
  IngredientFacts,
  ItemCocktailsDto,
  ItemRef,
  ItemType,
  MakeabilityIngredient,
  RecipeMakeability,
  WhatCanIMakeDto,
  WhatCanIMakeInput,
} from "@cellar-assistant/contracts";
import {
  BAR_MATCH_LIMIT_DEFAULT,
  BAR_MATCH_LIMIT_MAX,
  BAR_RECIPE_SCAN_CAP,
  BarActorDescriptor,
  bottleKind,
  ForbiddenError,
  ITEM_TYPES,
  inferIngredientMeta,
  isBarKind,
  isItemType,
  kindsSatisfiedBy,
  NotFoundError,
  PANTRY_KINDS,
  recipeMakeability,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { ActorBase } from "../lib/actor-base.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { requireUuid } from "../lib/uuid.ts";

/** Bottles read per inventory — far past any one person's shelf. */
const BOTTLE_CAP = 2_000;

/** `it_wine`, `it_spirit`… — the alias each item table joins under. */
const itemAlias = (type: ItemType): SQL => sql.raw(`it_${type.toLowerCase()}`);

/**
 * `left join` all six item tables onto an arc's columns, and the one name
 * among them — through `ARCS`, never a hand-listed column (`item-arcs.test.ts`).
 */
const joinItems = (
  arc: { column(type: ItemType, alias?: string): SQL },
  alias: string,
): SQL =>
  sql.join(
    ITEM_TYPES.map(
      (type) =>
        sql`left join ${ITEM_TABLES[type]} ${itemAlias(type)} on ${itemAlias(type)}.id = ${arc.column(type, alias)}`,
    ),
    sql` `,
  );

const ITEM_NAME = sql`coalesce(${sql.join(
  ITEM_TYPES.map((type) => sql`${itemAlias(type)}.name`),
  sql`, `,
)})`;

type BottleRow = {
  readonly cellar_item_id: string;
  readonly cellar_id: string;
  readonly item_type: string;
  readonly item_id: string | null;
  readonly name: string | null;
  readonly spirit_type: string | null;
  readonly wine_style: string | null;
  readonly percentage_remaining: string | number;
  readonly open_at: Date | string | null;
};

type CatalogRow = {
  readonly recipe_id: string;
  readonly recipe_name: string;
  readonly recipe_group_id: string | null;
  readonly canonical_recipe_id: string | null;
  readonly recipe_created_at: Date | string | null;
  readonly ingredient_id: string;
  readonly kind: string | null;
  readonly role: string | null;
  readonly quantity: string | number | null;
  readonly unit: string | null;
  readonly is_optional: boolean | null;
  readonly brand_mentioned: string | null;
  readonly ref_type: string;
  readonly ref_id: string;
  readonly item_name: string | null;
  readonly generic_category: string | null;
  readonly spirit_type: string | null;
  readonly wine_style: string | null;
};

/** One scanned recipe: its ingredients, ready to judge. */
type ScannedRecipe = {
  readonly id: string;
  readonly name: string;
  readonly groupId: string | null;
  readonly isCanonical: boolean;
  readonly createdAt: number;
  readonly ingredients: readonly (MakeabilityIngredient & {
    readonly ref: { readonly type: string; readonly id: string };
  })[];
};

const numberOrNull = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const time = (value: Date | string | null): number =>
  value === null ? 0 : new Date(value).getTime();

const STATUS_ORDER: Readonly<Record<RecipeMakeability["status"], number>> = {
  MAKE_NOW: 0,
  ONE_AWAY: 1,
  MISSING: 2,
};

/** Closest to makeable first; a group's canonical, then the newest, on a tie. */
const compareCandidates = (
  a: { recipe: ScannedRecipe; makeability: RecipeMakeability },
  b: { recipe: ScannedRecipe; makeability: RecipeMakeability },
): number =>
  STATUS_ORDER[a.makeability.status] - STATUS_ORDER[b.makeability.status] ||
  a.makeability.missing.length - b.makeability.missing.length ||
  a.makeability.substituteCount - b.makeability.substituteCount ||
  Number(b.recipe.isCanonical) - Number(a.recipe.isCanonical) ||
  b.recipe.createdAt - a.recipe.createdAt ||
  a.recipe.id.localeCompare(b.recipe.id);

const byName = (a: BarRecipeMatch, b: BarRecipeMatch): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
  a.recipeId.localeCompare(b.recipeId);

const requireLimit = (limit: number | null | undefined): number => {
  if (limit === null || limit === undefined) return BAR_MATCH_LIMIT_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > BAR_MATCH_LIMIT_MAX) {
    throw new ValidationError(
      `limit must be an integer from 1 to ${BAR_MATCH_LIMIT_MAX}, got ${limit}`,
    );
  }
  return limit;
};

export class BarActor extends ActorBase implements BarActorInterface {
  static readonly category: ActorCategory = BarActorDescriptor.category;

  /* ---------------------------------------------------------------------- */
  /* Methods                                                                 */
  /* ---------------------------------------------------------------------- */

  async inventory(ctx: Ctx): Promise<BarInventory> {
    this.#requireViewerKey(ctx);
    return this.#inventory();
  }

  async whatCanIMake(
    ctx: Ctx,
    input: WhatCanIMakeInput = {},
  ): Promise<WhatCanIMakeDto> {
    this.#requireViewerKey(ctx);
    const limit = requireLimit(input?.limit);
    const [inventory, catalog] = await Promise.all([
      this.#inventory(),
      this.#catalog(),
    ]);
    const best = this.#bestPerGroup(catalog, inventory);
    const makeNow = best
      .filter((match) => match.makeability.status === "MAKE_NOW")
      .sort(
        (a, b) =>
          a.makeability.substituteCount - b.makeability.substituteCount ||
          byName(a, b),
      );
    const oneAway = best
      .filter((match) => match.makeability.status === "ONE_AWAY")
      .sort(byName);
    return {
      makeNow: makeNow.slice(0, limit),
      oneAway: oneAway.slice(0, limit),
      makeNowCount: makeNow.length,
      oneAwayCount: oneAway.length,
      bottleCount: inventory.bottles.length,
      pantryCount: inventory.pantry.length,
      scanned: catalog.length,
    };
  }

  async cocktailsFor(ctx: Ctx, ref: ItemRef): Promise<ItemCocktailsDto> {
    this.#requireViewerKey(ctx);
    if (typeof ref?.type !== "string" || !isItemType(ref.type)) {
      throw new ValidationError(`not an item type: ${String(ref?.type)}`);
    }
    const item: ItemRef = { type: ref.type, id: requireUuid(ref.id, "ref.id") };
    const kind = await this.#itemKind(item);
    const [inventory, catalog] = await Promise.all([
      this.#inventory(),
      this.#catalog(),
    ]);
    const answers = new Set<string>(kindsSatisfiedBy(kind));
    const using = catalog.filter((recipe) =>
      recipe.ingredients.some(
        (ingredient) =>
          (ingredient.ref.type === item.type &&
            ingredient.ref.id === item.id) ||
          (ingredient.kind !== null && answers.has(ingredient.kind)),
      ),
    );
    const best = this.#bestPerGroup(using, inventory).sort(
      (a, b) =>
        STATUS_ORDER[a.makeability.status] -
          STATUS_ORDER[b.makeability.status] || byName(a, b),
    );
    const useItUp = inventory.bottles.some(
      (bottle) =>
        bottle.itemType === item.type &&
        bottle.itemId === item.id &&
        bottle.opened,
    );
    return {
      kind,
      useItUp,
      recipes: best.slice(0, BAR_MATCH_LIMIT_DEFAULT),
      total: best.length,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * `this.key === ctx.viewerId`, every turn — `ViewActorBase#requireViewerKey`
   * for an actor that pages nothing and so does not extend it.
   */
  #requireViewerKey(ctx: Ctx): void {
    requireSignedIn(ctx, "read a bar");
    if (ctx.viewerId !== null && ctx.viewerId === this.key) return;
    throw new ForbiddenError(
      `BarActor(${this.key}) may only be called by that viewer`,
    );
  }

  async #inventory(): Promise<BarInventory> {
    const viewer = this.key;
    const [pantryResult, bottleResult] = await Promise.all([
      this.db.execute<{ kind: string }>(sql`
        select kind from public.bar_pantry_items where user_id = ${viewer}::uuid
      `),
      this.db.execute<BottleRow>(sql`
        select
          ci.id as cellar_item_id,
          ci.cellar_id,
          ${ARCS.cellarItems.typeExpr("ci")} as item_type,
          ${ARCS.cellarItems.idExpr("ci")} as item_id,
          ${ITEM_NAME} as name,
          ${itemAlias("SPIRIT")}.type as spirit_type,
          ${itemAlias("WINE")}.style as wine_style,
          ci.percentage_remaining,
          ci.open_at
        from public.cellar_items ci
        join public.cellars ce on ce.id = ci.cellar_id
        ${joinItems(ARCS.cellarItems, "ci")}
        where ci.empty_at is null
          and ci.percentage_remaining > 0
          and (
            ce.created_by_id = ${viewer}::uuid
            or exists (
              select 1 from public.cellar_owners o
              where o.cellar_id = ce.id and o.user_id = ${viewer}::uuid
            )
          )
        order by ci.created_at desc, ci.id
        limit ${BOTTLE_CAP}
      `),
    ]);

    const on = new Set(pantryResult.rows.map((row) => row.kind));
    const pantry = PANTRY_KINDS.filter((kind) => on.has(kind));

    const bottles: BarBottle[] = [];
    for (const row of bottleResult.rows) {
      if (row.item_id === null || !isItemType(row.item_type)) continue;
      const name = row.name ?? "";
      bottles.push({
        cellarItemId: row.cellar_item_id,
        cellarId: row.cellar_id,
        itemType: row.item_type,
        itemId: row.item_id,
        name,
        kind: bottleKind({
          type: row.item_type,
          name,
          spiritType: row.spirit_type,
          wineStyle: row.wine_style,
        }),
        percentageRemaining: Number(row.percentage_remaining),
        opened: row.open_at !== null,
      });
    }
    return { pantry, bottles };
  }

  /** What a bottle of this item is read as. */
  async #itemKind(ref: ItemRef): Promise<BarKind | null> {
    const table = ITEM_TABLES[ref.type];
    const extra =
      ref.type === "SPIRIT"
        ? sql`, type as spirit_type`
        : ref.type === "WINE"
          ? sql`, style as wine_style`
          : sql``;
    const { rows } = await this.db.execute<{
      name: string;
      spirit_type?: string | null;
      wine_style?: string | null;
    }>(sql`select name${extra} from ${table} where id = ${ref.id}::uuid`);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError(`${ref.type.toLowerCase()} ${ref.id} not found`);
    }
    return bottleKind({
      type: ref.type,
      name: row.name,
      spiritType: row.spirit_type ?? null,
      wineStyle: row.wine_style ?? null,
    });
  }

  /**
   * The newest {@link BAR_RECIPE_SCAN_CAP} cocktail recipes with every
   * ingredient, kinds and roles stored or inferred. One query: the recipe
   * set is chosen in a CTE so the cap counts recipes, not ingredient rows
   * (a row cap would cut a recipe's list in half and misjudge it).
   */
  async #catalog(): Promise<ScannedRecipe[]> {
    const { rows } = await this.db.execute<CatalogRow>(sql`
      with scanned as (
        select r.id, r.name, r.recipe_group_id, r.created_at,
               g.canonical_recipe_id
        from public.recipes r
        left join public.recipe_groups g on g.id = r.recipe_group_id
        where r.type = 'cocktail'
        order by r.created_at desc nulls last, r.id desc
        limit ${BAR_RECIPE_SCAN_CAP}
      )
      select
        sc.id as recipe_id,
        sc.name as recipe_name,
        sc.recipe_group_id,
        sc.canonical_recipe_id,
        sc.created_at as recipe_created_at,
        ri.id as ingredient_id,
        ri.kind,
        ri.role,
        ri.quantity,
        ri.unit,
        ri.is_optional,
        ri.brand_mentioned,
        coalesce(
          case when ri.generic_item_id is not null then 'GENERIC' end,
          ${ARCS.recipeIngredients.typeExpr("ri")}
        ) as ref_type,
        coalesce(ri.generic_item_id, ${ARCS.recipeIngredients.idExpr("ri")})
          as ref_id,
        coalesce(gi.name, ${ITEM_NAME}) as item_name,
        nullif(concat_ws(' ', gi.subcategory, gi.category), '')
          as generic_category,
        ${itemAlias("SPIRIT")}.type as spirit_type,
        ${itemAlias("WINE")}.style as wine_style
      from scanned sc
      join public.recipe_ingredients ri on ri.recipe_id = sc.id
      left join public.generic_items gi on gi.id = ri.generic_item_id
      ${joinItems(ARCS.recipeIngredients, "ri")}
      order by sc.created_at desc nulls last, sc.id, ri.created_at, ri.id
    `);

    const byRecipe = new Map<string, CatalogRow[]>();
    for (const row of rows) {
      const list = byRecipe.get(row.recipe_id) ?? [];
      list.push(row);
      byRecipe.set(row.recipe_id, list);
    }

    const scanned: ScannedRecipe[] = [];
    for (const [id, list] of byRecipe) {
      const first = list[0];
      if (first === undefined) continue;
      const facts: IngredientFacts[] = list.map((row) => ({
        name: row.item_name,
        refType: row.ref_type,
        brandMentioned: row.brand_mentioned,
        genericCategory: row.generic_category,
        spiritType: row.spirit_type,
        wineStyle: row.wine_style,
        quantity: numberOrNull(row.quantity),
        unit: row.unit,
        isOptional: row.is_optional ?? false,
        kind: row.kind,
        role: row.role,
      }));
      const meta = inferIngredientMeta(facts);
      scanned.push({
        id,
        name: first.recipe_name,
        groupId: first.recipe_group_id,
        isCanonical: first.canonical_recipe_id === id,
        createdAt: time(first.recipe_created_at),
        ingredients: list.map((row, index) => {
          const kind = meta[index]?.kind ?? null;
          return {
            kind: isBarKind(kind) ? kind : null,
            role: meta[index]?.role ?? null,
            isOptional: row.is_optional ?? false,
            name: row.item_name,
            ref: { type: row.ref_type, id: row.ref_id },
            item:
              row.ref_type === "GENERIC"
                ? null
                : { type: row.ref_type as ItemType, id: row.ref_id },
          };
        }),
      });
    }
    return scanned;
  }

  /**
   * One recipe per group — the version closest to makeable — plus every
   * ungrouped recipe, each with its makeability.
   */
  #bestPerGroup(
    recipes: readonly ScannedRecipe[],
    inventory: BarInventory,
  ): BarRecipeMatch[] {
    const judged = recipes.map((recipe) => ({
      recipe,
      makeability: recipeMakeability(recipe.ingredients, inventory),
    }));
    const winners = new Map<string, (typeof judged)[number]>();
    for (const candidate of judged) {
      const key = candidate.recipe.groupId ?? `recipe:${candidate.recipe.id}`;
      const current = winners.get(key);
      if (current === undefined || compareCandidates(candidate, current) < 0) {
        winners.set(key, candidate);
      }
    }
    return [...winners.values()].map(({ recipe, makeability }) => ({
      recipeId: recipe.id,
      recipeGroupId: recipe.groupId,
      name: recipe.name,
      makeability,
    }));
  }
}
