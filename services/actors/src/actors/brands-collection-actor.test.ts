/**
 * `BrandsCollectionActor` — C3 (§2.2, §1.5, §1.6).
 *
 * The catalog half of C3: a projection rather than ids, a key with cardinality
 * rather than §2.2's singleton, and the catalog visibility rule — any signed-in
 * viewer, anonymous refused — checked on **every** turn of a warm activation.
 */
import {
  anonymousCtx,
  brandsCollectionActorId,
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
import { BrandsCollectionActor } from "./brands-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const seedBrand = async (
  db: DbOrTx,
  name: string,
  brandType: string | null = null,
): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.brands (name, brand_type)
    values (${name}, ${brandType}::brand_types)
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no brand id");
  return id;
};

const NO_FILTER = {} as const;

describe.skipIf(skip)("BrandsCollectionActor", () => {
  afterAll(closeTestDb);

  it("pages the index alphabetically as a projection", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const prefix = `zzz-c3-${crypto.randomUUID().slice(0, 8)}`;
      await seedBrand(db, `${prefix}-charlie`, "winery");
      await seedBrand(db, `${prefix}-alpha`, "brewery");
      await seedBrand(db, `${prefix}-bravo`, "winery");

      const actor = await activate(
        createActor(
          BrandsCollectionActor,
          brandsCollectionActorId(NO_FILTER),
          db,
        ),
      );
      const ctx = userCtx(viewer, "r");
      // Walk to this test's own rows rather than asserting a global ordering:
      // `brands` is shared with every other suite in this database.
      const seen: string[] = [];
      let after: string | null = null;
      for (let hop = 0; hop < 200; hop += 1) {
        const page = await actor.list(
          ctx,
          NO_FILTER,
          pageArgs({ first: 100, after }),
        );
        for (const entry of page.entries) {
          if (entry.node.name.startsWith(prefix)) seen.push(entry.node.name);
        }
        if (!page.hasNextPage) break;
        after = page.entries.at(-1)?.cursor ?? null;
      }
      expect(seen).toEqual([
        `${prefix}-alpha`,
        `${prefix}-bravo`,
        `${prefix}-charlie`,
      ]);
    });
  });

  it("returns the whole row, not an id", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const name = `zzz-c3-solo-${crypto.randomUUID().slice(0, 8)}`;
      const id = await seedBrand(db, name, "distillery");
      const filter = { brandType: "distillery" } as const;
      const actor = await activate(
        createActor(BrandsCollectionActor, brandsCollectionActorId(filter), db),
      );
      const page = await actor.list(
        userCtx(viewer, "r"),
        filter,
        pageArgs({ first: 100 }),
      );
      const row = page.entries.find((entry) => entry.node.id === id)?.node;
      expect(row).toMatchObject({
        id,
        name,
        brandType: "distillery",
        parentBrandId: null,
      });
      expect(row?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it("refuses anonymous on every turn, warm or cold (§1.5, C1)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedBrand(db, `zzz-c3-anon-${crypto.randomUUID().slice(0, 8)}`);
      const actor = await activate(
        createActor(
          BrandsCollectionActor,
          brandsCollectionActorId(NO_FILTER),
          db,
        ),
      );
      const warm = await actor.list(
        userCtx(viewer, "r"),
        NO_FILTER,
        pageArgs({ first: 5 }),
      );
      expect(warm.entries.length).toBeGreaterThan(0);
      await expect(
        actor.list(anonymousCtx("r"), NO_FILTER, pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(1);
    });
  });

  it("refuses a filter that does not hash to its own key", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const actor = await activate(
        createActor(
          BrandsCollectionActor,
          brandsCollectionActorId(NO_FILTER),
          db,
        ),
      );
      await expect(
        actor.list(
          userCtx(viewer, "r"),
          { brandType: "winery" },
          pageArgs({ first: 5 }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(actor.queryCount).toBe(0);
    });
  });
});
