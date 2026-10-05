/**
 * `BrandLinksCollectionActor` — A7g, against real Postgres.
 *
 * `services/api/src/schema/collections.test.ts` proves the §1.5 half at the
 * GraphQL boundary: which actor answers `Brand.items`/`Brand.places`, and that
 * the page is one collection call plus one batched fan-out. None of that
 * touches the SQL, and the SQL is where this actor's risk is — a polymorphic
 * item reference with no discriminator column, and a keyset ordered on a
 * *concatenated* sort key rather than a column. So both are driven here.
 *
 * The orderings are the contract, not an implementation detail: `items` is
 * "the flagship first" (`is_primary`), `places` is "an owner above a
 * stockist" (`relationship_type`). Each is asserted across a page boundary,
 * because a keyset that is merely *sorted* can still skip or repeat.
 */
import { randomUUID } from "node:crypto";
import {
  anonymousCtx,
  brandItemCountsActorId,
  brandLinksCollectionActorId,
  ForbiddenError,
  pageArgs,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { BrandLinksCollectionActor } from "./brand-links-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const seedBrand = async (db: DbOrTx, name: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.brands (id, name, brand_type)
    values (${id}::uuid, ${name}, 'winery'::brand_types)
  `);
  return id;
};

/** A `wines` row, with the `item_onboardings` row its FK requires. */
const seedWine = async (
  db: DbOrTx,
  createdById: string,
  name: string,
): Promise<string> => {
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'WINE')
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into public.wines (id, name, created_by_id, vintage, style, item_onboarding_id)
    values (${id}::uuid, ${name}, ${createdById}::uuid, '2020-01-01', 'RED',
            ${onboardingId}::uuid)
  `);
  return id;
};

/** A `beers` row, so the type discriminator is proved on more than one column. */
const seedBeer = async (
  db: DbOrTx,
  createdById: string,
  name: string,
): Promise<string> => {
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'BEER')
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into public.beers (id, name, created_by_id, item_onboarding_id)
    values (${id}::uuid, ${name}, ${createdById}::uuid, ${onboardingId}::uuid)
  `);
  return id;
};

const seedPlace = async (db: DbOrTx, name: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.places (id, name, categories, location, source)
    values (
      ${id}::uuid, ${name}, ARRAY['bar']::text[],
      ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
      'overture'
    )
  `);
  return id;
};

const linkItem = async (
  db: DbOrTx,
  column: "wine_id" | "beer_id",
  itemId: string,
  brandId: string,
  isPrimary: boolean,
  createdAt: string,
): Promise<void> => {
  const target = column === "wine_id" ? sql`wine_id` : sql`beer_id`;
  await db.execute(sql`
    insert into public.item_brands (${target}, brand_id, is_primary, created_at)
    values (${itemId}::uuid, ${brandId}::uuid, ${isPrimary},
            ${createdAt}::timestamptz)
  `);
};

const linkPlace = async (
  db: DbOrTx,
  placeId: string,
  brandId: string,
  relationship: "owned_by" | "affiliated_with" | "serves",
): Promise<void> => {
  await db.execute(sql`
    insert into public.place_brands (place_id, brand_id, relationship_type)
    values (${placeId}::uuid, ${brandId}::uuid, ${relationship})
  `);
};

const actorFor = async (db: DbOrTx, brandId: string) =>
  activate(
    createActor(
      BrandLinksCollectionActor,
      brandLinksCollectionActorId({ brandId }),
      db,
    ),
  );

describe.skipIf(skip)("BrandLinksCollectionActor", () => {
  afterAll(closeTestDb);

  it("returns item refs, flagship first, and pages across that boundary", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const brandId = await seedBrand(db, `zzz-a7g-${randomUUID()}`);
      // Deliberately inserted out of order, and with the *primary* link the
      // newest: if the sort key lost `is_primary` the page would come back
      // oldest-first and this would read as a passing test for the wrong rule.
      const oldest = await seedWine(db, viewer, "zzz-a7g oldest");
      const newestPrimary = await seedWine(db, viewer, "zzz-a7g flagship");
      const middle = await seedBeer(db, viewer, "zzz-a7g middle");
      await linkItem(
        db,
        "wine_id",
        oldest,
        brandId,
        false,
        "2026-01-01T00:00:00Z",
      );
      await linkItem(
        db,
        "beer_id",
        middle,
        brandId,
        false,
        "2026-06-01T00:00:00Z",
      );
      await linkItem(
        db,
        "wine_id",
        newestPrimary,
        brandId,
        true,
        "2026-09-01T00:00:00Z",
      );

      const actor = await actorFor(db, brandId);
      const ctx = userCtx(viewer, "r");

      const first = await actor.items(ctx, { brandId }, pageArgs({ first: 1 }));
      expect(first.totalCount).toBe(3);
      expect(first.entries.map((entry) => entry.node)).toEqual([
        { type: "WINE", id: newestPrimary },
      ]);
      expect(first.hasNextPage).toBe(true);

      // The keyset walks the concatenated `(is_primary, created_at)` sort key,
      // so the rest must continue in the same order with nothing repeated.
      const rest = await actor.items(
        ctx,
        { brandId },
        pageArgs({ first: 10, after: first.entries.at(-1)?.cursor ?? null }),
      );
      expect(rest.entries.map((entry) => entry.node)).toEqual([
        { type: "WINE", id: oldest },
        { type: "BEER", id: middle },
      ]);
      expect(rest.hasNextPage).toBe(false);
    });
  });

  it("derives the item type from whichever of the six columns is set", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const brandId = await seedBrand(db, `zzz-a7g-${randomUUID()}`);
      const beerId = await seedBeer(db, viewer, "zzz-a7g solo beer");
      await linkItem(
        db,
        "beer_id",
        beerId,
        brandId,
        true,
        "2026-01-01T00:00:00Z",
      );

      const actor = await actorFor(db, brandId);
      const page = await actor.items(
        userCtx(viewer, "r"),
        { brandId },
        pageArgs({ first: 10 }),
      );
      // `item_brands` has no generated `type` column — unlike `item_favorites`
      // — so this is the whole of the discriminator.
      expect(page.entries.map((entry) => entry.node)).toEqual([
        { type: "BEER", id: beerId },
      ]);
    });
  });

  it("returns the place links themselves, owner above stockist", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const brandId = await seedBrand(db, `zzz-a7g-${randomUUID()}`);
      const owner = await seedPlace(db, "zzz-a7g owner");
      const affiliate = await seedPlace(db, "zzz-a7g affiliate");
      const stockist = await seedPlace(db, "zzz-a7g stockist");
      await linkPlace(db, stockist, brandId, "serves");
      await linkPlace(db, owner, brandId, "owned_by");
      await linkPlace(db, affiliate, brandId, "affiliated_with");

      const actor = await actorFor(db, brandId);
      const page = await actor.places(
        userCtx(viewer, "r"),
        { brandId },
        pageArgs({ first: 10 }),
      );
      expect(page.totalCount).toBe(3);
      // The relationship is the reason this returns links rather than places,
      // so it is the thing asserted — and the ordering is alphabetical on it,
      // which puts an owner above an affiliate above a stockist.
      expect(
        page.entries.map((entry) => [
          entry.node.placeId,
          entry.node.relationshipType,
        ]),
      ).toEqual([
        [affiliate, "affiliated_with"],
        [owner, "owned_by"],
        [stockist, "serves"],
      ]);
      expect(page.entries[0]?.node.brandId).toBe(brandId);
      expect(page.entries[0]?.node.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it("refuses anonymous on every turn, warm or cold (§1.6, catalog rule)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const brandId = await seedBrand(db, `zzz-a7g-${randomUUID()}`);
      const actor = await actorFor(db, brandId);

      await actor.items(
        userCtx(viewer, "r"),
        { brandId },
        pageArgs({ first: 5 }),
      );
      await expect(
        actor.items(anonymousCtx("r"), { brandId }, pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.places(anonymousCtx("r"), { brandId }, pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      // Only the authorised turn reached the database.
      expect(actor.queryCount).toBe(1);
    });
  });

  it("refuses a filter that does not hash to its own key", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const brandId = await seedBrand(db, `zzz-a7g-${randomUUID()}`);
      const other = await seedBrand(db, `zzz-a7g-${randomUUID()}`);
      const actor = await actorFor(db, brandId);

      await expect(
        actor.items(
          userCtx(viewer, "r"),
          { brandId: other },
          pageArgs({ first: 5 }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(actor.queryCount).toBe(0);
    });
  });

  it("refuses a brand id that is not a uuid before touching the database", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      // The id is a hash of the filter, so a non-uuid brand id hashes
      // perfectly well and would otherwise reach SQL as a bad cast.
      const brandId = "not-a-uuid";
      const actor = await actorFor(db, brandId);
      await expect(
        actor.places(userCtx(viewer, "r"), { brandId }, pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(actor.queryCount).toBe(0);
    });
  });

  it("itemLinks (UI parity G24): the same rows and order as items, carrying isPrimary", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const brandId = await seedBrand(db, `zzz-g24-${randomUUID()}`);
      const plain = await seedWine(db, viewer, "zzz-g24 plain");
      const flagship = await seedBeer(db, viewer, "zzz-g24 flagship");
      await linkItem(
        db,
        "wine_id",
        plain,
        brandId,
        false,
        "2026-01-01T00:00:00Z",
      );
      await linkItem(
        db,
        "beer_id",
        flagship,
        brandId,
        true,
        "2026-09-01T00:00:00Z",
      );

      const actor = await actorFor(db, brandId);
      const ctx = userCtx(viewer, "r");
      const links = await actor.itemLinks(
        ctx,
        { brandId },
        pageArgs({ first: 10 }),
      );
      const items = await actor.items(
        ctx,
        { brandId },
        pageArgs({ first: 10 }),
      );
      expect(links.totalCount).toBe(2);
      expect(
        links.entries.map(({ node }) => ({
          type: node.itemType,
          id: node.itemId,
        })),
      ).toEqual(items.entries.map((entry) => entry.node));
      expect(links.entries.map(({ node }) => node.isPrimary)).toEqual([
        true,
        false,
      ]);
      expect(links.entries[0]?.node.brandId).toBe(brandId);
      await expect(
        actor.itemLinks(anonymousCtx("r"), { brandId }, pageArgs({ first: 1 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("itemCounts (UI parity G23): one group-by for a page of brands, aligned and keyed by the set", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const busy = await seedBrand(db, `zzz-g23-busy-${randomUUID()}`);
      const idle = await seedBrand(db, `zzz-g23-idle-${randomUUID()}`);
      for (const name of ["a", "b"]) {
        await linkItem(
          db,
          "wine_id",
          await seedWine(db, viewer, `zzz-g23 ${name}`),
          busy,
          false,
          "2026-01-01T00:00:00Z",
        );
      }
      const filter = { brandIds: [idle, busy] };
      const actor = await activate(
        createActor(
          BrandLinksCollectionActor,
          brandItemCountsActorId(filter),
          db,
        ),
      );
      expect(await actor.itemCounts(userCtx(viewer, "r"), filter)).toEqual([
        0, 2,
      ]);
      expect(actor.queryCount).toBe(1);
      // The key is the set: order does not move the activation …
      expect(brandItemCountsActorId({ brandIds: [busy, idle] })).toBe(
        brandItemCountsActorId(filter),
      );
      // … but a different set is refused rather than answered.
      await expect(
        actor.itemCounts(userCtx(viewer, "r"), { brandIds: [busy] }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.itemCounts(anonymousCtx("r"), filter),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(1);
    });
  });
});
