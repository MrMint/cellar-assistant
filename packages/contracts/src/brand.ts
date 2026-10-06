/**
 * The `Brand` aggregate (migration plan §2.1 `BrandActor`, `BrandRegistryActor`; B3).
 *
 * `BrandActor(brandId)` owns `brands` outright — the only actor that may write
 * it (`packages/db/src/writers.ts` already names it as such). `BrandRegistryActor(normalizedName)`
 * is the deduplication point: §1.2 says "registry actors hold a lock and call
 * the entity actor's create; they do not insert", so it never touches `brands`
 * directly. It is keyed by `normalizeBrandName(name)` so every concurrent
 * `resolve()` call for the *same* name lands on the *same* Dapr activation —
 * "Dapr runs one turn at a time per actor id" (§1.5) is the primary
 * serialization mechanism. The `brands_unique_lower_name` index
 * (`nhost/migrations/default/1773700000000_brands_dedup_and_unique_name_index`)
 * is the tripwire behind it, for the (defence-in-depth) case that guarantee is
 * ever violated — see `services/actors/src/actors/brand-registry-actor.ts`.
 *
 * **These DTOs are the wire shape, not the row shape** (see `items.ts`'s note
 * on the same point): `timestamptz` columns cross the Dapr wire as ISO-8601
 * strings, because `services/api` has no Drizzle and no database.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { BrandType } from "./enums.ts";

export type BrandDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly logoUrl: string | null;
  readonly brandType: BrandType | null;
  readonly parentBrandId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** `BrandActor.create` input. `name` is trimmed by the actor before storage. */
export type BrandCreateInput = {
  readonly name: string;
  readonly description?: string | null;
  readonly logoUrl?: string | null;
  readonly brandType?: BrandType | null;
  readonly parentBrandId?: string | null;
};

/**
 * `BrandActor.update` input. Every field is an explicit overwrite — a field
 * left `undefined` is unchanged, which is not the same as passing `null`.
 */
export type BrandUpdateInput = {
  readonly name?: string;
  readonly description?: string | null;
  readonly logoUrl?: string | null;
  readonly brandType?: BrandType | null;
};

/**
 * `BrandActor(brandId)` — entity actor, owned by **B3** (§2.1).
 */
export type BrandActorInterface = {
  get(ctx: Ctx): Promise<BrandDto>;
  /** Called only by `BrandRegistryActor` (§2.1) — never directly from a resolver. */
  create(ctx: Ctx, input: BrandCreateInput): Promise<BrandDto>;
  /** Admin only. */
  update(ctx: Ctx, input: BrandUpdateInput): Promise<BrandDto>;
  /** Admin only. `null` clears the parent. */
  setParent(ctx: Ctx, parentBrandId: string | null): Promise<BrandDto>;
};

export const BrandActorDescriptor: ActorDescriptor<BrandActorInterface> = {
  actorType: "BrandActor",
  category: "entity",
  methods: {
    get: {},
    create: {},
    update: {},
    setParent: {},
  },
};

/**
 * §2.1's normalization: `lower(trim(name))`. This is both the key
 * `BrandRegistryActor` is addressed by and the value it caches against — and
 * it is what the caller (a resolver, or B2's `ItemOnboardingActor.confirm`)
 * uses to build the actor id: `context.actor(BrandRegistryActorDescriptor,
 * normalizeBrandName(name)).resolve(name)`.
 */
export const normalizeBrandName = (name: string): string =>
  name.trim().toLowerCase();

/**
 * `BrandRegistryActor(normalizedName)` — registry (entity category, no owned
 * table; §2.1). `resolve` finds the brand named `name`, or creates it.
 */
export type BrandRegistryActorInterface = {
  resolve(ctx: Ctx, name: string): Promise<BrandDto>;
};

export const BrandRegistryActorDescriptor: ActorDescriptor<BrandRegistryActorInterface> =
  {
    actorType: "BrandRegistryActor",
    category: "entity",
    methods: {
      resolve: {},
    },
  };
