/**
 * `RecipeGroupsCollectionActor(hash(filter))` — C3 (migration plan §2.2).
 *
 * > | `RecipeGroupsCollectionActor()` | `/recipes` list, category filter, paged
 * > | **projection** |
 *
 * **A projection**, and §2.2 is right about why: this is §1.5's
 * high-cardinality catalog case. Every field the index card renders — name,
 * description, category, base spirit, tags, image, recipe count — is a
 * `recipe_groups` column or one cheap aggregate over `recipes`, so a page of
 * ids would be twenty cold `RecipeGroupActor` activations re-reading rows this
 * one query already returned. `RecipeGroupActor` loads its recipes, votes and
 * ingredients on activate; paying that to render a card is the N+1 §1.5 exists
 * to avoid.
 *
 * ## It is keyed by its filter, not by nothing
 *
 * §2.2 writes it `RecipeGroupsCollectionActor()`, a true singleton. §1.5 warns
 * against exactly that: *"Reference and other singleton read actors are a
 * serialization point: Dapr runs one turn at a time per actor id. Key read-only
 * actors by something with cardinality, and reserve true singletons for things
 * that should serialize."* Nothing about `/recipes` should serialize, so the id
 * is `recipeGroupsCollectionActorId(filter)` and there is one activation per
 * distinct filter. `ScopedCollectionActorBase` re-derives that hash from the
 * filter it is handed on every turn, so an activation addressed as one scope
 * cannot be driven with another.
 *
 * ## Free text narrows the index; it does not rank it
 *
 * `RecipeSearchActor` (§2.3) ranks recipes by `_ilike` and by
 * `recipe_vectors`, and a second, differently-*ranked* search over the same
 * catalog is how two lists start disagreeing about order. UI parity G26 adds
 * `term` here anyway, because the old `/recipes` page's one search box was a
 * filter on this list — name, description, or any version's name, `_ilike`,
 * still alphabetical, still paged with a total. A filter keeps the index's
 * order, so there is still only one ranking.
 *
 * Catalog visibility (§1.6): any signed-in viewer. `recipe_groups` has no
 * privacy column, and B6 already treats the recipe catalog that way.
 */
import type {
  ActorCategory,
  CappedList,
  Ctx,
  ItemRef,
  Page,
  PageArgs,
  RecipeCategory,
  RecipeGroupDto,
  RecipeGroupsCollectionActorInterface,
  RecipeGroupsFilter,
  RecipeIngredientDto,
  RecipeIngredientUsesFilter,
} from "@cellar-assistant/contracts";
import {
  ITEM_TYPES,
  isItemType,
  mapPage,
  normalizeRecipeGroupTerm,
  RECIPE_CATEGORIES,
  RECIPE_GROUP_TERM_MAX_LENGTH,
  REVERSE_EDGE_CAP,
  RecipeGroupsCollectionActorDescriptor,
  recipeGroupsCollectionActorId,
  recipeIngredientUsesActorId,
  requireReverseEdgeBatch,
  ValidationError,
} from "@cellar-assistant/contracts";
import { recipeIngredients } from "@cellar-assistant/db";
import { inArray, sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ScopedCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  toIso,
  uuidArray,
} from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ingredientRowToDto } from "../lib/recipe-ingredients.ts";
import { escapeLike } from "./brand-search-actor.ts";

type GroupRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string;
  readonly base_spirit: string | null;
  readonly tags: string[] | null;
  readonly image_url: string | null;
  readonly created_by_id: string | null;
  readonly canonical_recipe_id: string | null;
  readonly recipe_count: string | number;
  readonly created_at: Date | string | null;
  readonly updated_at: Date | string | null;
};

const isRecipeCategory = (value: string): value is RecipeCategory =>
  (RECIPE_CATEGORIES as readonly string[]).includes(value);

const SORT = sql`g.name`;
const ID = sql`g.id`;

export class RecipeGroupsCollectionActor
  extends ScopedCollectionActorBase<RecipeGroupsFilter>
  implements RecipeGroupsCollectionActorInterface
{
  static readonly category: ActorCategory =
    RecipeGroupsCollectionActorDescriptor.category;

  protected keyFor(filter: RecipeGroupsFilter): string {
    return recipeGroupsCollectionActorId(filter);
  }

  /**
   * UI parity G11 — the old `{wine,sake,tea}.recipe_ingredients { recipe … }`
   * for every item a page shows, in one statement: the rows naming each item,
   * by recipe name, windowed to {@link REVERSE_EDGE_CAP} per item. Recipes are
   * catalog data (B6: any signed-in viewer), so `keyedBatch`'s signed-in check
   * is the whole of the rule.
   */
  async ingredientUses(
    ctx: Ctx,
    filter: RecipeIngredientUsesFilter,
  ): Promise<readonly CappedList<RecipeIngredientDto>[]> {
    requireReverseEdgeBatch(filter.refs, "ingredientUses refs");
    for (const ref of filter.refs) {
      if (!isItemType(ref.type)) {
        throw new ValidationError(`not an item type: ${ref.type}`);
      }
    }
    return await this.keyedBatch(
      ctx,
      recipeIngredientUsesActorId(filter),
      async () => {
        if (filter.refs.length === 0) return [];
        const arc = ARCS.recipeIngredients;
        const matches = ITEM_TYPES.flatMap((type) => {
          const ids = filter.refs
            .filter((ref) => ref.type === type)
            .map((ref) => ref.id);
          return ids.length === 0
            ? []
            : [
                sql`${arc.column(type, "ri")} = any(${uuidArray(ids, "item id")})`,
              ];
        });
        const partition = sql`${arc.typeExpr("ri")}, ${arc.idExpr("ri")}`;
        // Two statements: the window picks the ids (and counts), then Drizzle
        // reads those rows typed, so the row → DTO mapping is `RecipeActor`'s.
        const { rows: picked } = await this.db.execute<{
          readonly id: string;
          readonly total: number;
        }>(sql`
          select id, total from (
            select ri.id,
                   row_number() over (
                     partition by ${partition}
                     order by r.name asc, r.id asc, ri.id asc
                   ) as rn,
                   (count(*) over (partition by ${partition}))::int as total
            from public.recipe_ingredients ri
            join public.recipes r on r.id = ri.recipe_id
            where ${sql.join(matches, sql` or `)}
          ) ranked
          where rn <= ${REVERSE_EDGE_CAP}
          order by rn
        `);
        const order = new Map(picked.map((row, index) => [row.id, index]));
        const totals = new Map(picked.map((row) => [row.id, row.total]));
        const rows =
          picked.length === 0
            ? []
            : (
                await this.db
                  .select()
                  .from(recipeIngredients)
                  .where(
                    inArray(
                      recipeIngredients.id,
                      picked.map((row) => row.id),
                    ),
                  )
              )
                .map((row) => ({ row, total: totals.get(row.id) ?? 0 }))
                .sort(
                  (a, b) =>
                    (order.get(a.row.id) ?? 0) - (order.get(b.row.id) ?? 0),
                );

        const byRef = new Map<
          string,
          { nodes: RecipeIngredientDto[]; total: number }
        >();
        for (const { row, total } of rows) {
          const dto = ingredientRowToDto(row);
          const key = `${dto.ref.type}:${dto.ref.id}`;
          const bucket = byRef.get(key) ?? { nodes: [], total: Number(total) };
          bucket.nodes.push(dto);
          byRef.set(key, bucket);
        }
        return filter.refs.map((ref: ItemRef) => {
          const bucket = byRef.get(`${ref.type}:${ref.id}`);
          return {
            nodes: bucket?.nodes ?? [],
            totalCount: bucket?.total ?? 0,
          };
        });
      },
    );
  }

  async list(
    ctx: Ctx,
    filter: RecipeGroupsFilter,
    page: PageArgs,
  ): Promise<Page<RecipeGroupDto>> {
    const term = normalizeRecipeGroupTerm(filter.term);
    if (term !== null && term.length > RECIPE_GROUP_TERM_MAX_LENGTH) {
      throw new ValidationError(
        `term must be at most ${RECIPE_GROUP_TERM_MAX_LENGTH} characters`,
      );
    }
    return mapPage(
      await this.paged<GroupRow>(
        ctx,
        filter,
        page,
        (after, limit) => this.#read(filter, after, limit),
        (row) => ({ sort: row.name, id: row.id }),
        () => this.#scope(filter),
      ),
      (row): RecipeGroupDto => {
        if (!isRecipeCategory(row.category)) {
          throw new ValidationError(
            `recipe_groups.category ${JSON.stringify(row.category)} is not a RecipeCategory`,
          );
        }
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          baseSpirit: row.base_spirit,
          tags: row.tags ?? [],
          imageUrl: row.image_url,
          createdById: row.created_by_id,
          canonicalRecipeId: row.canonical_recipe_id,
          recipeCount: Number(row.recipe_count),
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        };
      },
    );
  }

  /** Shared by the page and its `count(*)` — see `PageScope`. */
  #scope(filter: RecipeGroupsFilter): PageScope {
    const category =
      filter.category == null
        ? sql`true`
        : sql`g.category = ${filter.category}::recipe_category`;
    const baseSpirit =
      filter.baseSpirit == null
        ? sql`true`
        : sql`g.base_spirit = ${filter.baseSpirit}`;
    // G26: the old page's one search box — name, description, or any
    // version's name. `escape '\\'` so a `%` or `_` someone typed is a
    // literal, as `RecipeSearchActor` and `BrandSearchActor` do it.
    const term = normalizeRecipeGroupTerm(filter.term);
    const pattern = term === null ? null : `%${escapeLike(term)}%`;
    const text =
      pattern === null
        ? sql`true`
        : sql`(g.name ilike ${pattern} escape '\\'
            or coalesce(g.description, '') ilike ${pattern} escape '\\'
            or exists (select 1 from public.recipes r
                        where r.recipe_group_id = g.id
                          and r.name ilike ${pattern} escape '\\'))`;
    return {
      from: sql`public.recipe_groups g`,
      where: sql`${category} and ${baseSpirit} and ${text}`,
    };
  }

  async #read(
    filter: RecipeGroupsFilter,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly GroupRow[]> {
    const { from, where } = this.#scope(filter);
    const { rows } = await this.db.execute<GroupRow>(sql`
      select g.id, g.name, g.description, g.category::text as category,
             g.base_spirit, g.tags, g.image_url, g.created_by_id,
             g.canonical_recipe_id, g.created_at, g.updated_at,
             (select count(*) from public.recipes r
               where r.recipe_group_id = g.id) as recipe_count
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "text", "asc")}
      order by ${keysetOrder(SORT, ID, "asc")}
      limit ${limit}
    `);
    return rows;
  }
}
