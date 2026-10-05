/**
 * `BrandRegistryActor` — B3 (migration plan §2.1, §1.2, §1.5, §8.5).
 *
 * > **`BrandRegistryActor(normalizedName)`** — registry (entity category, no
 * > owned table)
 * > - Serializes find-or-create by `lower(trim(name))`. `resolve(name)`
 * >   returns an existing id or calls `BrandActor(newId).create`. Replaces
 * >   the read-check-insert-recheck loop in `src/utilities/brand.ts`. The
 * >   `lower(name)` unique index stays as the tripwire.
 *
 * ## How this actually serializes concurrent creates of the same name
 *
 * The registry is keyed by `normalizeBrandName(name)` (§2.1's own
 * `lower(trim(name))`), so every caller resolving `"Château Margaux"` and
 * every caller resolving `" château margaux "` address the *same* Dapr actor
 * id. Dapr runs one turn at a time per actor id (§1.5) — that is the primary
 * serialization mechanism, and it is *free*: two different brand names key
 * two different actor instances and never contend with each other at all,
 * unlike a single always-locked singleton would.
 *
 * That guarantee lives in Dapr's placement service, not in this file, so it
 * cannot be exercised by the in-process test harness (`src/lib/testing.ts`
 * constructs plain classes with no sidecar). `brand-registry-actor.test.ts`'s
 * concurrent-create test therefore proves the *second* layer instead: what
 * happens if two turns for the same name run genuinely concurrently anyway —
 * a rolling deploy briefly running two hosts, a placement table update, or
 * simply a bug. `brands_unique_lower_name` is `§2.1`'s named tripwire for
 * exactly this, and `resolve` below is what makes hitting it survivable
 * instead of a 500: it catches the `ConflictError` `BrandActor.create`
 * translates the violation into, re-reads by name, and returns the winner's
 * row — so from the caller's side, N concurrent `resolve()` calls for one
 * name always converge on one row, whether or not Dapr's own serialization
 * held.
 *
 * ## Calling `BrandActor` directly
 *
 * §8.5 lists "registry → entity" as a direct, synchronous call — not routed
 * through the outbox (that direction is for "entity → other entity actors").
 * In production this is a real hop through the Dapr sidecar
 * (`invokeActorMethod`, the same primitive `OutboxActor` uses to reach an
 * arbitrary target actor — see `../lib/sidecar.ts`), which is why that
 * module's error handling now reconstructs a typed `ActorError` rather than
 * only a generic `SidecarError`: this actor has to distinguish "the name
 * already exists" from every other failure. The call is injected
 * (`BrandCreator`, defaulted to the real sidecar call) exactly the way
 * `FileActor` injects its storage binding, so tests can substitute an
 * in-process `BrandActor` sharing the test's own transaction instead of
 * standing up a sidecar.
 *
 * ## B10: `loadAggregate` is never trusted as a standing cache
 *
 * §1.3's caching rule is "an actor may cache only the tables it writes."
 * This registry writes no table at all (§2.1: "no owned table") — `brands`
 * belongs to `BrandActor`, per `packages/db/src/writers.ts`. `loadAggregate`
 * still reads it, because that read *is* the find half of find-or-create, but
 * treating what it returns as good for the life of the activation would be
 * exactly B6's `RecipeGroupActor` bug: a warm registry that loaded "no brand
 * named this yet" would keep answering that way forever, even after
 * `BrandActor.update` renamed some other brand onto this name, with nothing
 * to invalidate it. `resolve` therefore re-reads with `this.reload()` on
 * every call before trusting `this.aggregate` — one extra indexed `SELECT`
 * isn't expensive on a path nobody calls in a loop, and it is the price of
 * the cache never being wrong.
 */
import {
  type ActorCategory,
  BrandActorDescriptor,
  type BrandDto,
  BrandRegistryActorDescriptor,
  type BrandRegistryActorInterface,
  ConflictError,
  type Ctx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { brands } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase, type KeyShape, textKey } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import { brandRowToDto } from "./brand-actor.ts";

type BrandRegistryAggregate = { readonly brand: BrandDto };

/**
 * How `BrandRegistryActor` reaches `BrandActor(newId).create`. Injectable so
 * tests can substitute an in-process call instead of a Dapr sidecar hop — the
 * same pattern `FileActor` uses for its storage binding
 * (`src/actors/file-actor.ts`).
 */
export type BrandCreator = (
  ctx: Ctx,
  brandId: string,
  input: { readonly name: string },
) => Promise<BrandDto>;

/** The real, production path: a synchronous call through the sidecar. */
const daprBrandCreator: BrandCreator = (ctx, brandId, input) =>
  internal(ctx)(BrandActorDescriptor, brandId).create(input);

export class BrandRegistryActor
  extends EntityActorBase<BrandRegistryAggregate>
  implements BrandRegistryActorInterface
{
  static readonly category: ActorCategory =
    BrandRegistryActorDescriptor.category;
  /** Keyed by a normalised brand name, compared as text. */
  static override readonly keyShape: KeyShape = textKey;

  readonly #createBrand: BrandCreator;

  /**
   * `createBrand` is the fourth, defaulted parameter `ActorBase` leaves room
   * for (see `FileActor`'s constructor doc): production gets the real
   * sidecar call, `brand-registry-actor.test.ts` passes a fake that talks to
   * an in-process `BrandActor` instead.
   */
  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    createBrand: BrandCreator = daprBrandCreator,
  ) {
    super(daprClient, id, db);
    this.#createBrand = createBrand;
  }

  /**
   * `this.key` is already `normalizeBrandName(name)` (§2.1) — the caller
   * builds the actor id that way, so every concurrent `resolve` for the same
   * name is the same Dapr activation.
   *
   * Reads `brands` directly rather than through `BrandActor`: this *is* the
   * find half of find-or-create, and `BrandActor.get` is a keyed-by-id
   * lookup with no way to look up "the row for this name" without already
   * knowing an id — the exact thing the registry exists to resolve.
   *
   * Not `requireAggregate()`-checked anywhere below: a `null` aggregate here
   * just means "no brand named this yet", the normal case for the first
   * `resolve()` of a name, not an error.
   */
  protected async loadAggregate(
    normalizedName: string,
  ): Promise<BrandRegistryAggregate | null> {
    const [row] = await this.db
      .select()
      .from(brands)
      .where(sql`lower(trim(${brands.name})) = ${normalizedName}`)
      .limit(1);
    return row === undefined ? null : { brand: brandRowToDto(row) };
  }

  async resolve(ctx: Ctx, name: string): Promise<BrandDto> {
    requireSignedIn(ctx, "resolve a brand");
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("brand name must not be blank");
    }

    // B10: `brands` is not this actor's table (module doc), so the aggregate
    // loaded at activation cannot be trusted as-is — re-read before every
    // decision this method makes.
    await this.reload();

    // Assigned to a local before narrowing: TS's control-flow analysis
    // treats a bare `this.aggregate !== null` check as narrowing the getter
    // itself for the rest of the method, so the *second* check below (after
    // `this.setAggregate`/`this.reload`, neither of which it can see as
    // mutating the getter) sees it as still provably `null`. A local
    // variable sidesteps that entirely.
    const cached = this.aggregate;
    if (cached !== null) return cached.brand;

    const brandId = crypto.randomUUID();
    try {
      const created = await this.#createBrand(ctx, brandId, {
        name: trimmed,
      });
      this.setAggregate({ brand: created });
      return created;
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      // The tripwire (§2.1): another `resolve()` for this name committed
      // between this activation's load and this call — Dapr's per-actor-id
      // serialization did not hold (or was never in effect, as in the
      // concurrent test). Converge on the winner instead of surfacing the
      // race.
      await this.reload();
      const aggregate = this.aggregate;
      if (aggregate !== null) return aggregate.brand;
      // Vanishingly unlikely (the winner's row would have to disappear
      // between the conflict and this re-read) — surface the original
      // conflict rather than manufacture a confusing NotFound.
      throw error;
    }
  }
}
