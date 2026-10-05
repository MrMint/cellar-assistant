/**
 * `MenuScansCollectionActor(viewerId)` — C3 (migration plan §2.2, §2.1).
 *
 * > | `MenuScansCollectionActor(viewerId)` | `/map/scans` | ids |
 *
 * **Ids.** `MenuScanDto` is twenty fields wide — status, error, two image ids,
 * three place columns, counts, timings — and `MenuScanActor.get` answers all of
 * it from an aggregate loaded on activate, so the list returns uuids and
 * `services/api` fans them out through the `MenuScan` DataLoader.
 *
 * This is the one collection where ids also buy a **safety** property rather
 * than only a shape. Scans are owner-only (§2.1: *"Visibility: scan owner
 * only"*, enforced by B8's `MenuScanActor.#requireOwner`), and the `where`
 * clause here already restricts the page to `menu_scans.user_id = viewer`. The
 * fan-out then re-checks ownership *independently*, inside the actor that owns
 * the row — so a bug in this query cannot widen what the client sees, it can
 * only make the fan-out fail. A projection would have no such second check.
 *
 * Ordered by `coalesce(scanned_at, created_at)`: both columns are nullable in
 * the live schema and `scanned_at` is what the scans list is about. The
 * `coalesce` is in the cursor expression as well as the `ORDER BY`, because a
 * keyset cursor and its ordering must be the same expression or paging skips
 * rows.
 */
import type {
  ActorCategory,
  Ctx,
  MenuScansCollectionActorInterface,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  MenuScansCollectionActorDescriptor,
  mapPage,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import { keysetOrder, keysetWhere } from "../lib/collection-sql.ts";

type ScanIdRow = { readonly id: string; readonly sort_key: string };

/**
 * Both columns are nullable, so the ordering expression is a `coalesce` with a
 * floor — a null sort key cannot be compared and would break the page-walk.
 */
const SORT = sql`coalesce(s.scanned_at, s.created_at, 'epoch'::timestamptz)`;
const ID = sql`s.id`;

export class MenuScansCollectionActor
  extends ViewerCollectionActorBase<null>
  implements MenuScansCollectionActorInterface
{
  static readonly category: ActorCategory =
    MenuScansCollectionActorDescriptor.category;

  async list(ctx: Ctx, page: PageArgs): Promise<Page<string>> {
    return mapPage(
      await this.paged<ScanIdRow>(
        ctx,
        null,
        page,
        (after, limit) => this.#read(ctx, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#scope(ctx),
      ),
      (row) => row.id,
    );
  }

  /**
   * Shared by the page and its `count(*)` — see `PageScope`.
   *
   * `requireKey` has already refused an anonymous ctx, so the `false` branch is
   * unreachable; it is a narrowing rather than a throw, the same shape the
   * visibility clauses in the sibling actors use.
   */
  #scope(ctx: Ctx): PageScope {
    const viewer = ctx.viewerId;
    return {
      from: sql`public.menu_scans s`,
      where: viewer === null ? sql`false` : sql`s.user_id = ${viewer}::uuid`,
    };
  }

  async #read(
    ctx: Ctx,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly ScanIdRow[]> {
    const { from, where } = this.#scope(ctx);
    const { rows } = await this.db.execute<ScanIdRow>(sql`
      select s.id, (${SORT})::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "timestamptz", "desc")}
      order by ${keysetOrder(SORT, ID, "desc")}
      limit ${limit}
    `);
    return rows;
  }
}
