/**
 * `ReferenceDataActor` — A9 (migration plan §2.5, §4, corrected by A3).
 *
 * One activation per reference table: `ReferenceDataActor("country")`,
 * `ReferenceDataActor("wine_variety")`, … — never a single actor for all ten,
 * because §1.5 warns a singleton read actor is a serialization point ("Dapr
 * runs one turn at a time per actor id") and would queue every dropdown in
 * the app behind the same activation.
 *
 * **The ten kinds, and why not twelve.** §4 splits the old Hasura enum tables
 * into "code branches on this" (→ `pgEnum`, `packages/db/src/schema/tables.ts`)
 * and "catalog data code never branches on" (→ stays a table, read here). A3
 * corrected the unit from *table* to *column* and, separately, converted
 * `instruction_types` and `brand_types` to native enums during the same pass
 * (`packages/db/transform/04_enum_split.sql`) — so of §4's twelve names, only
 * ten are still tables `ReferenceDataActor` can read. `REFERENCE_KINDS`
 * (`@cellar-assistant/contracts`) is those ten, and every one of them is a
 * `(value text primary key, comment text)` lookup — the key-column split A3
 * flagged ("`instruction_types` and `brand_types` key on `id`; the other ten
 * key on `value`") turned out to need no branch here, because the two `id`-keyed
 * tables are gone before this actor ever sees them.
 *
 * Reference actors write nothing (§1.1): `ActorBase.tx()` throws for the
 * `"reference"` category, so there is no write method to accidentally add.
 * Data changes by migration only; a deploy that adds a value restarts this
 * actor and it reads the new row on the next activation.
 *
 * **The ten queries live in `../lib/reference-rows.ts`, not here** (E2c/X1b).
 * A second caller appeared — `lib/ai/vocabulary.ts` builds the item-defaults
 * output schema from all ten tables at once, and §8.5 forbids it reaching this
 * actor for them from inside `ItemOnboardingActor.start`'s turn. Hoisting the
 * `switch` rather than copying it is what keeps the dropdown a user sees and
 * the vocabulary the model is constrained to from drifting apart.
 */
import {
  type ActorCategory,
  type Ctx,
  isReferenceKind,
  NotFoundError,
  ReferenceDataActorDescriptor,
  type ReferenceDataActorInterface,
  type ReferenceKind,
  type ReferenceRow,
} from "@cellar-assistant/contracts";
import { EntityActorBase, type KeyShape } from "../lib/actor-base.ts";
import { selectReferenceRows } from "../lib/reference-rows.ts";

type ReferenceAggregate = {
  readonly kind: ReferenceKind;
  readonly rows: readonly ReferenceRow[];
};

export class ReferenceDataActor
  extends EntityActorBase<ReferenceAggregate>
  implements ReferenceDataActorInterface
{
  static readonly category: ActorCategory =
    ReferenceDataActorDescriptor.category;
  /** Keyed by the table name — one of `REFERENCE_KINDS`. */
  static override readonly keyShape: KeyShape = isReferenceKind;

  /**
   * `id` is the actor id, i.e. the table name (`this.key`). An id that is not
   * one of `REFERENCE_KINDS` — a typo, or a client-constructed actor id for a
   * table that does not exist — loads as `null`, so `requireAggregate()`
   * reports it as `NotFound` exactly like a missing row would (§1.1's
   * `EntityActorBase` doc: "existence first … A viewer who may not see the
   * row gets `NotFound` too").
   */
  protected async loadAggregate(
    id: string,
  ): Promise<ReferenceAggregate | null> {
    if (!isReferenceKind(id)) return null;
    const rows = await selectReferenceRows(this.db, id);
    return { kind: id, rows };
  }

  /** Every row, ordered by `value`. Public catalog data — no viewer check. */
  async all(_ctx: Ctx): Promise<readonly ReferenceRow[]> {
    return this.requireAggregate().rows;
  }

  /** A single row, or `NotFound` — e.g. to validate a client-supplied value. */
  async byValue(_ctx: Ctx, value: string): Promise<ReferenceRow> {
    const { kind, rows } = this.requireAggregate();
    const row = rows.find((r) => r.value === value);
    if (row === undefined) {
      throw new NotFoundError(
        `${kind}: no row for value ${JSON.stringify(value)}`,
      );
    }
    return row;
  }
}
