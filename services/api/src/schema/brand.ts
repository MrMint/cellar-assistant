/**
 * `Brand` — B3 (migration plan §2.1 `BrandActor`, `BrandRegistryActor`).
 *
 * Three root fields, deliberately not four: there is no `createBrand`
 * mutation. §2.1 says `BrandActor.create` is "called only by
 * `BrandRegistryActor`" — a GraphQL field calling it directly would let a
 * client bypass the dedup registry entirely, which is the one thing B3 exists
 * to prevent. `resolveBrand` (→ `BrandRegistryActor.resolve`) is the only
 * creation path exposed here; B2's `ItemOnboardingActor.confirm` reaches the
 * same actor method directly (actor-to-actor, §8.5), not through this field.
 *
 * `Brand` is a `loadableObject` — keyed by id, batching into parallel
 * `BrandActor.get` calls — even though nothing in B3 itself returns a list of
 * brand ids yet. B2's `Item.brands` (`item_brands`) and C3's
 * `BrandsCollectionActor` are the reasons this exists now rather than later:
 * both want to hand back ids and let the loader do the fan-out, exactly as
 * `item.ts`'s `ItemInterface` does for items (§1.5).
 */
import type { BrandDto, BrandUpdateInput } from "@cellar-assistant/contracts";
import {
  BrandActorDescriptor,
  BrandRegistryActorDescriptor,
  BrandsCollectionActorDescriptor,
  brandsCollectionActorId,
  normalizeBrandName,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";
import { BrandTypeEnum } from "./enums.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch } from "./patch.ts";

const loadBrands = async (
  ids: readonly string[],
  context: ApiContext,
): Promise<readonly (BrandDto | Error)[]> =>
  Promise.all(
    ids.map(async (id): Promise<BrandDto | Error> => {
      try {
        return await context.actor(BrandActorDescriptor, id).get();
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause));
      }
    }),
  );

export const Brand = builder.loadableObject("Brand", {
  description:
    "A catalog brand (§2.1 BrandActor) — the owner of one or more items or " +
    "places. Deduplicated by case-insensitive name through BrandRegistryActor.",
  load: loadBrands,
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    logoUrl: t.exposeString("logoUrl", { nullable: true }),
    brandType: t.field({
      type: BrandTypeEnum,
      nullable: true,
      resolve: (brand) => brand.brandType,
    }),
    parentBrandId: t.exposeID("parentBrandId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

/**
 * **A7g: the last `Query.x(id:)` that was not a result union.**
 *
 * D4: *"`Query.brand(id:)` is the only `Query.x(id:)` that is not a result
 * union, so a missing id is a top-level error with `data: null` and there is
 * nothing for `unwrapResult` to narrow."* The client's `/brands/[brandId]`
 * page was reduced to a bare `try/catch` around the whole query as a result.
 *
 * ## The error comes from the loader, not the resolver
 *
 * `Brand` is a `loadableObject`, so this resolver returns the **id** and
 * `loadBrands` does the `BrandActor.get`. That is worth stating because it is
 * not obvious that `errors: {}` covers it: `loadBrands` *returns* an `Error`
 * rather than throwing, DataLoader turns a returned `Error` into a rejection
 * for that key, and the rejection surfaces inside the field resolver the
 * **dataloader plugin** installs.
 *
 * It lands in the union because of the plugin order `builder.ts` already sets
 * deliberately — `[ErrorsPlugin, RelayPlugin, DataloaderPlugin]`, with
 * `ErrorsPlugin` first *"so anything a later plugin throws should still land
 * in the field's error union"*. And it stays a typed error because
 * `loadBrands` preserves the instance (`cause instanceof Error ? cause : …`)
 * rather than re-wrapping it, so `instanceof NotFoundError` still holds.
 *
 * That is a chain of three assumptions, so `brand.test.ts` drives the
 * **failing** path and asserts the union member rather than trusting it.
 */
builder.queryField("brand", (t) =>
  t.field({
    type: Brand,
    description:
      "A brand by id (BrandActor.get). `NotFoundError` for an id that does " +
      "not exist; brands are catalog data, so any signed-in viewer may read " +
      "any of them and an anonymous caller is refused.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args) => String(args.id),
  }),
);

export const BrandConnection = builder.connectionObject(
  { type: Brand, name: "BrandConnection" },
  { name: "BrandEdge" },
);

/**
 * **A7g: the two self-referential reverse edges.**
 *
 * D4 listed four missing edges on `Brand`. These are the two that need no new
 * actor — `brands.parent_brand_id` answers both directions — and they are
 * declared here, after `BrandConnection` exists. The other two (`items`,
 * `places`) cross into `ItemActor`'s and `PlaceActor`'s tables and are added
 * to this same type from `item.ts` and `place.ts` with
 * `builder.objectFields`: this module must not import either, because
 * `item.ts` already imports *it* and the cycle would collapse both types to
 * `any` (TS7022).
 *
 * `parentBrand` costs **no** actor call of its own: `parentBrandId` is already
 * on the loaded `BrandDto`, so the field is a key handed straight to the same
 * `Brand` DataLoader that produced the parent row. A page of siblings
 * therefore resolves its parents in one batch. That is what replaces the
 * client's *second* `brand(id:)` round trip.
 */
builder.objectFields(Brand, (t) => ({
  parentBrand: t.field({
    type: Brand,
    nullable: true,
    description:
      "The brand this is a sub-brand of, or null for a top-level brand. " +
      "Batched through the same `Brand` loader, so this costs no extra " +
      "round trip beyond the one that loaded this brand.",
    resolve: (brand) => brand.parentBrandId,
  }),

  childBrands: t.field({
    type: BrandConnection,
    description:
      "Sub-brands of this brand — `brands(parentBrandId:)` scoped to it. " +
      "Alphabetical, like the index. `totalCount` is real, so a page can " +
      "say how many there are without walking them.",
    args: t.arg.connectionArgs(),
    resolve: async (brand, args, context) => {
      const filter = { brandType: null, parentBrandId: brand.id };
      return connectionFromPage(
        await context
          .actor(
            BrandsCollectionActorDescriptor,
            brandsCollectionActorId(filter),
          )
          .list(filter, toPageArgs(args)),
      );
    },
  }),
}));

builder.queryField("brands", (t) =>
  t.field({
    type: BrandConnection,
    description:
      "`/brands` — the alphabetical brand index (C3's " +
      "`BrandsCollectionActor`, §2.2). A **projection**, not ids: §1.5 names " +
      "the brand index as the catalog case, and a `BrandDto` is the whole " +
      "row the card renders. Free text is `brandSearch`, not this.",
    args: {
      ...t.arg.connectionArgs(),
      brandType: t.arg({ type: BrandTypeEnum, required: false }),
      parentBrandId: t.arg.id({
        required: false,
        description:
          "Only brands whose `parentBrandId` is this — what `Brand." +
          "childBrands` is built on. Omit for the whole index.",
      }),
    },
    errors: {},
    resolve: async (_root, args, context) => {
      // The filter *is* the actor id, so it is built once and used twice.
      const filter = {
        brandType: args.brandType ?? null,
        parentBrandId:
          args.parentBrandId == null ? null : String(args.parentBrandId),
      };
      return connectionFromPage(
        await context
          .actor(
            BrandsCollectionActorDescriptor,
            brandsCollectionActorId(filter),
          )
          .list(filter, toPageArgs(args)),
      );
    },
  }),
);

const UpdateBrandInput = builder.inputType("UpdateBrandInput", {
  description:
    "Every field is an explicit overwrite; omit a field to leave it " +
    "unchanged (BrandActor.update, admin only). `null` clears " +
    "`description`, `logoUrl` and `brandType`; a brand always has a name, so " +
    "`name: null` is ignored.",
  fields: (t) => ({
    name: t.string({ required: false }),
    description: t.string({ required: false }),
    logoUrl: t.string({ required: false }),
    brandType: t.field({ type: BrandTypeEnum, required: false }),
  }),
});

/**
 * `BrandActor.update` writes `null` for the three nullable columns, which is
 * what `BrandUpdateInput` says it accepts. Until this policy existed the
 * resolver mapped every `null` to `undefined`, so a brand's description, logo
 * or type could be set but never cleared.
 */
const UPDATE_BRAND = {
  name: "keep",
  description: "clearable",
  logoUrl: "clearable",
  brandType: "clearable",
} satisfies PatchPolicy<typeof UpdateBrandInput.$inferInput>;

builder.mutationField("updateBrand", (t) =>
  t.field({
    type: Brand,
    description: "Admin only (BrandActor.update).",
    errors: {},
    args: {
      id: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateBrandInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(BrandActorDescriptor, String(args.id))
        .update(patch(args.input, UPDATE_BRAND) satisfies BrandUpdateInput),
  }),
);

builder.mutationField("setBrandParent", (t) =>
  t.field({
    type: Brand,
    description:
      "Admin only (BrandActor.setParent). Pass null to clear the parent.",
    errors: {},
    args: {
      id: t.arg.id({ required: true }),
      parentBrandId: t.arg.id({ required: false }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(BrandActorDescriptor, String(args.id))
        .setParent(args.parentBrandId ?? null),
  }),
);

builder.mutationField("resolveBrand", (t) =>
  t.field({
    type: Brand,
    description:
      "Finds the brand named `name` (case-insensitive, trimmed) or creates " +
      "it (BrandRegistryActor.resolve) — the only brand-creation path a " +
      "client has; there is no direct createBrand mutation (see module doc).",
    errors: {},
    args: { name: t.arg.string({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(BrandRegistryActorDescriptor, normalizeBrandName(args.name))
        .resolve(args.name),
  }),
);
