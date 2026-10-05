/**
 * `BrandActor` — B3 (migration plan §2.1, §3).
 *
 * > **`BrandActor(brandId)`**
 * > - Owns: `brands`.
 * > - Methods: `get`, `create` (called only by `BrandRegistryActor`), `update`
 * >   (admin), `setParent`.
 *
 * The only actor that ever writes `brands` — `packages/db/src/writers.ts`
 * already names it so; the single-writer containment test resolves that
 * ownership from this file's path (`actors/brand-actor.ts`, derived from the
 * class name, §8.3).
 *
 * §2.1 gives `BrandActor` no `Visibility:` line, unlike `CellarActor` /
 * `ItemActor` / `TierListActor`. Brands carry no owner column at all — there
 * is nothing to be an owner *of* — so the only gate here is "signed in",
 * applied uniformly to every viewer. That is a deliberate B3 read of §1.6's
 * "for catalog data the stranger case is any signed-in user": three different
 * signed-in viewers (an "owner", a "friend", a "stranger" — the fixture names
 * `brand-actor.test.ts` borrows from `packages/policy`) all see the same row,
 * and only an anonymous caller is refused. See the report for this being
 * flagged as an ambiguity rather than an explicit rule.
 *
 * ## The tripwire
 *
 * `create` and `update`/`setParent`'s rename path can all violate
 * `brands_unique_lower_name` (`nhost/migrations/default/
 * 1773700000000_brands_dedup_and_unique_name_index`) — a case-insensitive
 * unique index on `name` *as stored*, not `trim(name)`. Every write here
 * always stores a trimmed name, which is what keeps "the DB's `lower(name)`"
 * and "§2.1's `lower(trim(name))`" the same index in practice (see
 * `normalizeBrandName` in `@cellar-assistant/contracts`). A violation is
 * translated to `ConflictError` — never left as a raw Postgres error, both
 * because §8.3's typed-error contract expects it and because
 * `BrandRegistryActor.resolve` specifically catches this one to converge two
 * racing creates onto a single row (§2.1, "the unique index stays as the
 * tripwire").
 */
import {
  type ActorCategory,
  BrandActorDescriptor,
  type BrandActorInterface,
  type BrandCreateInput,
  type BrandDto,
  type BrandType,
  type BrandUpdateInput,
  ConflictError,
  type Ctx,
  NotFoundError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { brands } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { EntityActorBase } from "../lib/actor-base.ts";
import { requirePrivileged, requireSignedIn } from "../lib/guards.ts";

export type BrandRow = typeof brands.$inferSelect;
type BrandAggregate = { readonly brand: BrandRow };

/** How many links `setParent` will walk while checking for a cycle. Brand
 *  hierarchies are shallow (owner → parent company, at most); this is a
 *  generous ceiling, not a realistic depth. */
const MAX_PARENT_CHAIN_DEPTH = 20;

/**
 * Drizzle 1.0.0-rc.4 wraps every driver error in `DrizzleQueryError`, whose
 * `.cause` is the original `pg` `DatabaseError` (`code`, `constraint`, …
 * `drizzle-orm/errors.js`). Unwrap it when present; fall back to the error
 * itself so this still works if a raw driver error is ever thrown directly.
 */
const pgErrorOf = (
  error: unknown,
): { code?: unknown; constraint?: unknown } | undefined => {
  if (!(error instanceof Error)) return undefined;
  const cause = (error as { cause?: unknown }).cause;
  return (cause instanceof Error ? cause : error) as {
    code?: unknown;
    constraint?: unknown;
  };
};

const isUniqueNameViolation = (error: unknown): boolean => {
  const pg = pgErrorOf(error);
  return pg?.code === "23505" && pg?.constraint === "brands_unique_lower_name";
};

const isParentForeignKeyViolation = (error: unknown): boolean => {
  const pg = pgErrorOf(error);
  return (
    pg?.code === "23503" &&
    pg?.constraint === "brands_parent_brand_id_brands_id_fkey"
  );
};

export const brandRowToDto = (row: BrandRow): BrandDto => ({
  id: row.id,
  name: row.name,
  description: row.description,
  logoUrl: row.logoUrl,
  brandType: row.brandType as BrandType | null,
  parentBrandId: row.parentBrandId,
  createdAt: (row.createdAt ?? new Date(0)).toISOString(),
  updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
});

export class BrandActor
  extends EntityActorBase<BrandAggregate>
  implements BrandActorInterface
{
  static readonly category: ActorCategory = BrandActorDescriptor.category;

  protected async loadAggregate(id: string): Promise<BrandAggregate | null> {
    const [row] = await this.db.select().from(brands).where(eq(brands.id, id));
    return row === undefined ? null : { brand: row };
  }

  /** Catalog data — every signed-in viewer sees the same row. */
  async get(ctx: Ctx): Promise<BrandDto> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view brand catalog data");
    return brandRowToDto(aggregate.brand);
  }

  /**
   * Called only by `BrandRegistryActor` (§2.1), synchronously (§8.5:
   * "registry → entity"), with the id `BrandRegistryActor` minted for a new
   * brand — never by a resolver directly.
   *
   * Idempotent on `this.key`: a retried call with the same minted id (the
   * registry re-invoking after an unacknowledged success) returns the
   * existing row rather than conflicting with itself. A *name* collision
   * with a *different* id — the tripwire — throws `ConflictError` for
   * `BrandRegistryActor.resolve` to catch.
   */
  async create(ctx: Ctx, input: BrandCreateInput): Promise<BrandDto> {
    requireSignedIn(ctx, "create a brand");
    if (this.aggregate !== null) return brandRowToDto(this.aggregate.brand);

    const name = input.name.trim();
    if (name.length === 0) {
      throw new ValidationError("brand name must not be blank");
    }

    let inserted: BrandRow;
    try {
      inserted = await this.tx(async (tx) => {
        const [row] = await tx
          .insert(brands)
          .values({
            id: this.key,
            name,
            description: input.description ?? null,
            logoUrl: input.logoUrl ?? null,
            brandType: input.brandType ?? null,
            parentBrandId: input.parentBrandId ?? null,
          })
          .returning();
        if (row === undefined) {
          throw new Error("BrandActor.create: insert returned no row");
        }
        return row;
      });
    } catch (error) {
      if (isUniqueNameViolation(error)) {
        throw new ConflictError(
          `a brand named "${name}" already exists (case-insensitive)`,
        );
      }
      if (isParentForeignKeyViolation(error)) {
        throw new NotFoundError(
          `parent brand ${String(input.parentBrandId)} not found`,
        );
      }
      throw error;
    }

    await this.reload();
    return brandRowToDto(inserted);
  }

  /** Admin only (§2.1). Renaming is subject to the same tripwire as `create`. */
  async update(ctx: Ctx, input: BrandUpdateInput): Promise<BrandDto> {
    const aggregate = this.requireAggregate();
    requirePrivileged(ctx, `only an admin may update brand ${this.key}`);

    const patch: {
      name?: string;
      description?: string | null;
      logoUrl?: string | null;
      brandType?: BrandType | null;
    } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length === 0) {
        throw new ValidationError("brand name must not be blank");
      }
      patch.name = name;
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
    if (input.brandType !== undefined) patch.brandType = input.brandType;

    if (Object.keys(patch).length === 0) return brandRowToDto(aggregate.brand);

    try {
      await this.tx(async (tx) => {
        await tx.update(brands).set(patch).where(eq(brands.id, this.key));
      });
    } catch (error) {
      if (isUniqueNameViolation(error)) {
        throw new ConflictError(
          `a brand named "${String(patch.name)}" already exists (case-insensitive)`,
        );
      }
      throw error;
    }
    await this.reload();
    return brandRowToDto(this.requireAggregate().brand);
  }

  /** Admin only (§2.1). Refuses a self-reference or a cycle. `null` clears it. */
  async setParent(ctx: Ctx, parentBrandId: string | null): Promise<BrandDto> {
    this.requireAggregate();
    requirePrivileged(ctx, `only an admin may reparent brand ${this.key}`);

    if (parentBrandId !== null) {
      if (parentBrandId === this.key) {
        throw new ValidationError("a brand cannot be its own parent");
      }
      await this.#assertNoCycle(parentBrandId);
    }

    try {
      await this.tx(async (tx) => {
        await tx
          .update(brands)
          .set({ parentBrandId })
          .where(eq(brands.id, this.key));
      });
    } catch (error) {
      if (isParentForeignKeyViolation(error)) {
        throw new NotFoundError(`parent brand ${parentBrandId} not found`);
      }
      throw error;
    }
    await this.reload();
    return brandRowToDto(this.requireAggregate().brand);
  }

  /**
   * Walks the proposed parent's own ancestry looking for `this.key`. A plain
   * read of `brands` — not a write, and not routed through another actor:
   * `brands` is this actor's own owned table (§1.1's "its owned tables (+ FK
   * lookups via other actors)" is about *other* aggregates' tables, not this
   * one's).
   */
  async #assertNoCycle(parentBrandId: string): Promise<void> {
    let currentId: string | null = parentBrandId;
    for (let depth = 0; depth < MAX_PARENT_CHAIN_DEPTH; depth += 1) {
      if (currentId === null) return;
      if (currentId === this.key) {
        throw new ValidationError(
          `setting parent to ${parentBrandId} would create a cycle through ${this.key}`,
        );
      }
      const [row] = await this.db
        .select({ parentBrandId: brands.parentBrandId })
        .from(brands)
        .where(eq(brands.id, currentId));
      if (row === undefined) {
        throw new NotFoundError(`parent brand ${currentId} not found`);
      }
      currentId = row.parentBrandId;
    }
    throw new ValidationError(
      `brand parent chain from ${parentBrandId} exceeds ${MAX_PARENT_CHAIN_DEPTH} hops`,
    );
  }
}
