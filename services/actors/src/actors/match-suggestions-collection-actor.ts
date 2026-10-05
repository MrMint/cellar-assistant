/**
 * `MatchSuggestionsCollectionActor(viewerId)` — C3 (migration plan §2.2).
 *
 * ## §2.2's scope for this actor is wrong, and this is what replaced it
 *
 * §2.2 describes `/discoveries` as *"pending `item_match_suggestions` for
 * **places the viewer has interacted with**, by confidence"* — other people's
 * scans, reached through a `user_place_interactions` join. **That is withdrawn
 * and not implemented.**
 *
 * Menu scans are owner-only (§2.1: *"Visibility: scan owner only"*, enforced by
 * B8's `MenuScanActor.#requireOwner`), and every `item_match_suggestions` row
 * hangs off a `place_menu_items` row that carries the `menu_scan_id` it came
 * from. So a suggestion is a fact about somebody's scan: serving one derived
 * from a stranger's scan discloses, per row, that a particular person
 * photographed a particular menu at a particular place. That is the same class
 * of leak as the cellar oracle B1 refused and the tier-list filter C1 closed,
 * and a visit-interaction join does not make it safe — it only changes *which*
 * stranger's scan you are shown.
 *
 * **`/discoveries` is the viewer's own pending suggestions from the viewer's
 * own scans, ordered by confidence.** The `menu_scans.user_id = viewer` join is
 * the authorization and it lives in the `where` clause, so there is no ordering
 * of operations in which it can be skipped and no page in which a row from
 * another user's scan can appear.
 *
 * ## Why a projection
 *
 * §2.2 already says "**projection** (includes `scanId`)" and the reason is
 * `CheckInsCollectionActor`'s: an `item_match_suggestions` row has **no entity
 * actor**. §3 makes `MenuScanActor` its writer and that actor is keyed by
 * *scan*, so a suggestion id addresses nothing. The row also is the screen —
 * menu item name, confidence, reasoning, metrics — with one exception: the
 * suggested target is a typed `ItemRef` or a recipe id, and those are ids,
 * dataloaded through `ItemActor` / `RecipeActor` like any other.
 *
 * The row → DTO mapping is duplicated from `menu-scan-actor.ts` rather than
 * imported: that one is a private detail of an aggregate, and §1.1 lets a
 * collection actor read any table directly. The shapes are pinned together by
 * `MatchSuggestionDto`, which both produce.
 */
import type {
  ActorCategory,
  Ctx,
  MatchSuggestionDto,
  MatchSuggestionsCollectionActorInterface,
  MatchSuggestionTarget,
  Page,
  PageArgs,
  PlaceMenuItemDto,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  MatchSuggestionsCollectionActorDescriptor,
  mapPage,
  requireReverseEdgeBatch,
} from "@cellar-assistant/contracts";
import { menuScans, placeMenuItems } from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  requireUuidValue,
  toIso,
} from "../lib/collection-sql.ts";
import { ARCS, type ArcSqlRow } from "../lib/item-arcs.ts";
import { menuItemRowToDto } from "../lib/place-menu-items.ts";

type SuggestionRow = {
  readonly id: string;
  readonly place_menu_item_id: string;
  readonly menu_scan_id: string | null;
  readonly place_id: string;
  readonly menu_item_name: string;
  readonly suggested_recipe_id: string | null;
  readonly confidence_score: string;
  readonly match_reasoning: string | null;
  readonly similarity_metrics: Record<string, unknown> | null;
  readonly acted_by: string | null;
  readonly acted_at: Date | string | null;
  readonly created_at: Date | string | null;
  readonly sort_key: string;
} & ArcSqlRow;

/** `item_match_suggestions`' arc: its six `suggested_<type>_id` columns. */
const SUGGESTED = ARCS.itemMatchSuggestions;

/** `check_single_suggested_item` guarantees exactly one is non-null. */
const targetOf = (row: SuggestionRow): MatchSuggestionTarget => {
  if (row.suggested_recipe_id !== null) {
    return { kind: "RECIPE", recipeId: row.suggested_recipe_id };
  }
  const item = SUGGESTED.refOf(row, "column");
  if (item !== null) return { kind: "ITEM", item };
  throw new ConflictError(
    `item_match_suggestion ${row.id} names no suggested item`,
  );
};

const SORT = sql`s.confidence_score`;
const ID = sql`s.id`;

export class MatchSuggestionsCollectionActor
  extends ViewerCollectionActorBase<null>
  implements MatchSuggestionsCollectionActorInterface
{
  static readonly category: ActorCategory =
    MatchSuggestionsCollectionActorDescriptor.category;

  async list(ctx: Ctx, page: PageArgs): Promise<Page<MatchSuggestionDto>> {
    return mapPage(
      await this.paged<SuggestionRow>(
        ctx,
        null,
        page,
        (after, limit) => this.#read(ctx, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#scope(ctx),
      ),
      (row): MatchSuggestionDto => ({
        id: row.id,
        menuScanId: row.menu_scan_id,
        placeMenuItemId: row.place_menu_item_id,
        placeId: row.place_id,
        menuItemName: row.menu_item_name,
        target: targetOf(row),
        confidenceScore: Number(row.confidence_score),
        matchReasoning: row.match_reasoning,
        similarityMetrics: row.similarity_metrics,
        accepted: null,
        rejected: null,
        actedBy: row.acted_by,
        actedAt: toIso(row.acted_at),
        createdAt: toIso(row.created_at),
      }),
    );
  }

  /**
   * UI parity G20 — the menu line behind each of a page of suggestions, in
   * one statement. The old `/discoveries` card read
   * `item_match_suggestions.place_menu_item { … }` straight off the row.
   *
   * The `menu_scans.user_id = viewer` join is the authorization, as in
   * `#scope`: a line from anybody else's scan is answered `null`, never read
   * into the result, so an id guessed or replayed from elsewhere is not an
   * oracle for another person's menu. `batch` checks the key (this viewer's
   * own activation) and the signed-in rule before the read.
   */
  async menuItemsOf(
    ctx: Ctx,
    menuItemIds: readonly string[],
  ): Promise<readonly (PlaceMenuItemDto | null)[]> {
    requireReverseEdgeBatch(menuItemIds, "menuItemsOf menuItemIds");
    const none = menuItemIds.map(() => null);
    return await this.batch(ctx, null, none, async () => {
      const viewer = ctx.viewerId;
      if (menuItemIds.length === 0 || viewer === null) {
        return none;
      }
      const ids = menuItemIds.map((id) =>
        requireUuidValue(id, "menuItemId").toLowerCase(),
      );
      const rows = await this.db
        .select({ line: placeMenuItems })
        .from(placeMenuItems)
        .innerJoin(menuScans, eq(menuScans.id, placeMenuItems.menuScanId))
        .where(
          and(inArray(placeMenuItems.id, ids), eq(menuScans.userId, viewer)),
        );
      const byId = new Map(
        rows.map(({ line }) => [line.id, menuItemRowToDto(line)]),
      );
      return ids.map((id) => byId.get(id) ?? null);
    });
  }

  /**
   * The `/discoveries` feed.
   *
   * Three clauses, and the first is the whole of the authorization:
   *
   *   1. `sc.user_id = viewer` — the scan is the viewer's own;
   *   2. `accepted is null and rejected is null` — §2.2's "pending". This is
   *      the partial index `idx_match_suggestions_pending`'s own predicate, so
   *      `accepted`/`rejected` are known to be null and the DTO says so rather
   *      than selecting two columns whose values are already decided;
   *   3. the keyset, on `(confidence_score, id)` — §2.2's "by confidence".
   */
  /**
   * Shared by the page and its `count(*)` — see `PageScope`. The three clauses
   * are the ones the module doc enumerates, and the `menu_scans` join carries
   * the first of them, so neither join is droppable from the count.
   */
  #scope(ctx: Ctx): PageScope {
    const viewer = ctx.viewerId;
    return {
      from: sql`public.item_match_suggestions s
      join public.place_menu_items i on i.id = s.place_menu_item_id
      join public.menu_scans sc on sc.id = i.menu_scan_id`,
      where:
        viewer === null
          ? sql`false`
          : sql`sc.user_id = ${viewer}::uuid
        and s.accepted is null
        and s.rejected is null`,
    };
  }

  async #read(
    ctx: Ctx,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly SuggestionRow[]> {
    const { from, where } = this.#scope(ctx);
    const { rows } = await this.db.execute<SuggestionRow>(sql`
      select s.id, s.place_menu_item_id,
             ${SUGGESTED.columnList("s")},
             s.suggested_recipe_id,
             s.confidence_score, s.match_reasoning, s.similarity_metrics,
             s.acted_by, s.acted_at, s.created_at,
             i.menu_scan_id, i.place_id, i.menu_item_name,
             (s.confidence_score)::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "numeric", "desc")}
      order by ${keysetOrder(SORT, ID, "desc")}
      limit ${limit}
    `);
    return rows;
  }
}
