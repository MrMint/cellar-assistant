/**
 * Reference data and category vectors (migration plan §2.5, §2.1
 * `CategoryVectorsActor`, A9).
 *
 * ## `ReferenceDataActor(kind)`
 *
 * §4 splits the old twenty-two Hasura enum tables into two groups: twelve
 * become native Postgres enums (`packages/db/src/schema/tables.ts`'s
 * `pgEnum(...)` calls — code branches on their values, so they belong at
 * compile time) and ten stay tables — catalogs with display data
 * (`country`, `wine_variety`, …) that code never branches on.
 *
 * **A3's correction to §4, load-bearing here:** the unit is the *column*, not
 * the table, and the ten surviving tables' key column is `value` — every one
 * of them is a `(value text primary key, comment text)` lookup
 * (`packages/db/src/schema/tables.ts`). The other two entries §4 originally
 * listed as tables, `instruction_types` and `brand_types`, key on `id` in the
 * *old* Hasura schema — but A3's `04_enum_split.sql` already converts both to
 * native enums (`instructionTypes`, `brandTypes` in `tables.ts`), so neither
 * is a table `ReferenceDataActor` can read any more. `REFERENCE_KINDS` below
 * is deliberately the ten that remain, not twelve.
 *
 * One activation per table (§1.5: "Key read-only actors by something with
 * cardinality … so no single actor serializes every dropdown in the app").
 * Reference actors write nothing — `ActorBase.tx()` refuses for the
 * `"reference"` category — because this data changes by migration only.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";

/**
 * §4's "table" column, corrected by A3. Every one of these keys on `value`.
 * Keep sorted; `packages/db/src/writers.ts`'s `infrastructure:migrations`
 * entries are the same ten names.
 */
export const REFERENCE_KINDS = [
  "beer_style",
  "coffee_cultivar",
  "country",
  "sake_category",
  "sake_rice_variety",
  "sake_type",
  "spirit_type",
  "tea_category",
  "wine_style",
  "wine_variety",
] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const isReferenceKind = (value: string): value is ReferenceKind =>
  (REFERENCE_KINDS as readonly string[]).includes(value);

/** A row from any of the ten tables — every one has exactly these two columns. */
export type ReferenceRow = {
  readonly value: string;
  readonly comment: string | null;
};

/**
 * `ReferenceDataActor(kind)` — reference actor, owned by **A9**.
 *
 * `all()` returns every row, ordered by `value`. `byValue()` is a convenience
 * for a single lookup (e.g. validating a client-supplied value); both read
 * from the same activation cache (§1.5: "everything, loaded on activate").
 */
export type ReferenceDataActorInterface = {
  all(ctx: Ctx): Promise<readonly ReferenceRow[]>;
  byValue(ctx: Ctx, value: string): Promise<ReferenceRow>;
};

export const ReferenceDataActorDescriptor: ActorDescriptor<ReferenceDataActorInterface> =
  {
    actorType: "ReferenceDataActor",
    category: "reference",
    methods: {
      all: {},
      byValue: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* CategoryVectorsActor — singleton (§2.1)                                    */
/* -------------------------------------------------------------------------- */

/** The singleton's actor id — same convention as `MaintenanceActor`/`OutboxActor`. */
export const CATEGORY_VECTORS_ACTOR_ID = "singleton";

/**
 * `category_vectors` minus its raw embedding: §1.5's "screen-shaped
 * projection" applies even to a plain `all()` here — a 768-dimension float
 * array per row is never what a caller wants back over the wire, and every
 * actual consumer of the vector (a future `PlaceSearchActor`/matching pass)
 * computes distances in SQL, not by pulling floats into Node.
 */
export type CategoryVectorRow = {
  readonly id: number;
  readonly label: string;
  readonly labelType: string;
  readonly associatedCategories: readonly string[];
  readonly metadata: Record<string, unknown>;
  /** ISO-8601, or `null` — the column has no `NOT NULL`. */
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/** One row `seed` writes. The embedding itself — computed elsewhere (an AI
 * provider call), never inside this actor's turn, matching §8.5's "no AI or
 * external call runs inside" an entity actor. */
export type CategoryVectorSeedInput = {
  readonly label: string;
  readonly labelType?: string;
  readonly associatedCategories?: readonly string[];
  readonly vector: readonly number[];
  readonly metadata?: Record<string, unknown>;
};

export type CategoryVectorSeedResult = {
  readonly seeded: number;
};

/**
 * `CategoryVectorsActor()` — entity actor (singleton), owned by **A9**.
 *
 * §2.1: "Owns: `category_vectors`. Methods: `seed` (admin; replaces
 * `seedCategoryVectors`), `all`." Tagged `entity` rather than `reference`
 * because it writes (`packages/db/src/writers.ts` already assigns
 * `category_vectors` to it) — §1.1 has no "singleton but writes" category, and
 * A5's gap note (§1.1) says infrastructure singletons "borrow `entity`"; this
 * one is domain data, not infrastructure, but the same reasoning applies:
 * category is about write/read rules, not cardinality.
 */
export type CategoryVectorsActorInterface = {
  all(ctx: Ctx): Promise<readonly CategoryVectorRow[]>;
  seed(
    ctx: Ctx,
    rows: readonly CategoryVectorSeedInput[],
  ): Promise<CategoryVectorSeedResult>;
};

export const CategoryVectorsActorDescriptor: ActorDescriptor<CategoryVectorsActorInterface> =
  {
    actorType: "CategoryVectorsActor",
    category: "entity",
    methods: {
      all: {},
      seed: {},
    },
  };
