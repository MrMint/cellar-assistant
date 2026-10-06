/**
 * `CellarItemSearchActor(hash)` — C1 (migration plan §2.3).
 *
 * > | `CellarItemSearchActor(hash)` | in-cellar semantic sort | **yes** |
 * > cellar_item ids ordered |
 *
 * ## The viewer is in the key, and this is §1.5's first identity-sensitive surface
 *
 * The answer is the contents of one cellar, and whether the viewer may see that
 * cellar is the entire question. If the viewer were not in the hash, the first
 * caller's *authorized* result set would be held by an activation that the next
 * caller — a stranger to a PRIVATE cellar — would then read from. §1.5 names
 * this surface for exactly that reason.
 *
 * The visibility rule is B1's, unchanged: `canSeeCellar`, the four-branch rule
 * over creator + co-owners + privacy, with a `NotFoundError` on denial so that
 * absence and refusal are indistinguishable.
 *
 * ## Overlap with `CellarActor.items(semanticQuery)` — deliberate, and bounded
 *
 * B1 already implements this ordering inside `CellarActor`, over the aggregate
 * it holds. §2.3 nevertheless lists this actor, and both are worth having for
 * different reasons:
 *
 *  - `CellarActor.items` is the **cellar page**. It re-sorts a list it already
 *    has, in the same turn that serves everything else about the cellar, and it
 *    re-embeds the phrase on every page because the aggregate — not the search
 *    — is what its activation caches.
 *  - This actor is the **search**. Its activation caches the *result*, so
 *    paging through a large cellar's semantic sort is one query and one
 *    embedding no matter how many pages are read, and a long scroll does not
 *    occupy `CellarActor`'s single-threaded turn queue (§8.5) while the owner
 *    is trying to write to the same cellar.
 *
 * They must agree, and `cellar-item-search-actor.test.ts` asserts that they do
 * on the same fixture. Recorded in the C1 report as a §2.3 overlap the plan
 * does not call out.
 *
 * ## Un-embedded items sort last rather than disappearing
 *
 * B1's reasoning, preserved verbatim in behaviour: a semantic sort is an
 * ordering, not a filter, and dropping an un-embedded bottle out of its owner's
 * own cellar list would look like data loss.
 */
import type {
  ActorCategory,
  CellarItemSearchActorInterface,
  CellarItemSearchHit,
  CellarItemSearchInput,
  Ctx,
  ItemRef,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  CellarItemSearchActorDescriptor,
  cellarItemSearchActorId,
  ITEM_SEARCH_RESULT_CAP,
  ValidationError,
} from "@cellar-assistant/contracts";
import { cellarItems } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { canSeeCellar } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { absentRow } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import { daprEmbedQuery } from "../lib/embedding-client.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { SearchActorBase } from "../lib/search-actor-base.ts";
import { vectorDistances } from "../lib/vectors.ts";
import { cellarVisibility, loadCellarAccess } from "../lib/visibility.ts";

type CellarItemRow = typeof cellarItems.$inferSelect;

/** The item a row holds — `cellar_items`' arc, as `CellarActor` reads it. */
const itemRefOf = (row: CellarItemRow): ItemRef =>
  ARCS.cellarItems.requireRefOf(row);

export class CellarItemSearchActor
  extends SearchActorBase<CellarItemSearchInput, CellarItemSearchHit>
  implements CellarItemSearchActorInterface
{
  static readonly category: ActorCategory =
    CellarItemSearchActorDescriptor.category;

  readonly #embed: EmbedQuery;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    embed: EmbedQuery = daprEmbedQuery,
  ) {
    super(daprClient, id, db);
    this.#embed = embed;
  }

  protected keyFor(
    input: CellarItemSearchInput,
    viewerId: string | null,
  ): string {
    return cellarItemSearchActorId(input, viewerId);
  }

  async results(
    ctx: Ctx,
    input: CellarItemSearchInput,
    page: PageArgs,
  ): Promise<Page<CellarItemSearchHit>> {
    return this.pageOf(ctx, input, page);
  }

  async all(
    ctx: Ctx,
    input: CellarItemSearchInput,
  ): Promise<readonly CellarItemSearchHit[]> {
    return this.resultSet(ctx, input);
  }

  /**
   * **Every turn, not just the first.** The base class runs this before the
   * cached result set is consulted, which is what stops a warm activation from
   * serving a page of a cellar the viewer stopped being able to see — and,
   * before the base had this hook, from serving one to an anonymous caller.
   */
  protected override async authorize(
    ctx: Ctx,
    input: CellarItemSearchInput,
  ): Promise<"allow"> {
    requireSignedIn(ctx, "search a cellar");
    if (input.query.trim() === "") {
      throw new ValidationError("a cellar search needs a query");
    }
    requireLimit(input.limit ?? ITEM_SEARCH_RESULT_CAP);
    await this.#requireVisibleCellar(ctx, input.cellarId);
    return "allow";
  }

  protected async runSearch(
    ctx: Ctx,
    input: CellarItemSearchInput,
  ): Promise<readonly CellarItemSearchHit[]> {
    const query = input.query.trim();
    const limit = requireLimit(input.limit ?? ITEM_SEARCH_RESULT_CAP);

    const rows = await this.db
      .select()
      .from(cellarItems)
      .where(eq(cellarItems.cellarId, input.cellarId));
    if (rows.length === 0) return [];

    const distances = await this.#distances(ctx, query, rows);

    return rows
      .map((row) => {
        const item = itemRefOf(row);
        return {
          cellarItemId: row.id,
          item,
          distance: distances.get(item.id) ?? null,
        };
      })
      .sort((a, b) => {
        const byDistance =
          (a.distance ?? Number.POSITIVE_INFINITY) -
          (b.distance ?? Number.POSITIVE_INFINITY);
        // A total order: distance ties (identical vectors, or two un-embedded
        // items) are broken by id, so the offset cursor means the same thing on
        // the next page. `created_at` cannot serve — inside `withTestDb` every
        // row ties on `now()` (B1's harness note).
        return byDistance !== 0
          ? byDistance
          : a.cellarItemId < b.cellarItemId
            ? -1
            : 1;
      })
      .slice(0, limit);
  }

  /** One query over `item_vectors`, not one `ItemActor.get` per row (B1). */
  async #distances(
    ctx: Ctx,
    query: string,
    rows: readonly CellarItemRow[],
  ): Promise<Map<string, number>> {
    return vectorDistances(
      this.db,
      rows.map(itemRefOf),
      await this.#embed(ctx, query),
    );
  }

  /**
   * B1's rule, read directly: §1.1 lets a search actor read any table.
   *
   * `NotFound`, not `Forbidden`, and in `CellarActor`'s own words — the same
   * bytes `CellarActor(cellarId).get` gives for an id that names nothing — so
   * neither this search nor the cellar itself is an oracle for a private
   * collection's existence.
   */
  async #requireVisibleCellar(ctx: Ctx, cellarId: string): Promise<void> {
    const cellar = await loadCellarAccess(this.db, cellarId);
    if (
      cellar !== null &&
      canSeeCellar(ctx, await cellarVisibility(this.db, ctx, cellar))
    ) {
      return;
    }
    throw absentRow("CellarActor", cellarId);
  }
}

const requireLimit = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > ITEM_SEARCH_RESULT_CAP) {
    throw new ValidationError(
      `limit must be an integer in [1, ${ITEM_SEARCH_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};
