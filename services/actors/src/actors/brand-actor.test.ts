/**
 * `BrandActor` against a real Postgres (B3, migration plan §2.1).
 *
 * Brands carry no owner column, so the three-viewer pattern §1.6 asks for
 * ("every method whose result depends on the viewer has three tests: owner,
 * friend, stranger … for catalog data the stranger case is any signed-in
 * user") is adapted per method:
 *
 *  - `get` — three different signed-in viewers ("owner"/"friend"/"stranger",
 *    the same fixture names `packages/policy/src/policy.test.ts` uses) all
 *    see the identical row; only an anonymous caller is refused.
 *  - `update`/`setParent` are admin-gated (§2.1): an admin viewer succeeds,
 *    two different non-admin signed-in viewers are both refused identically
 *    — admin is the "owner" analogue here, and there is no privileged
 *    non-admin viewer to play "friend" against, so both non-admins land in
 *    the same bucket a "friend" and a "stranger" would.
 */
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { brands } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  withTestDb,
} from "../lib/testing.ts";
import { BrandActor } from "./brand-actor.ts";

const OWNER = "11111111-1111-1111-1111-111111111111";
const FRIEND = "33333333-3333-3333-3333-333333333333";
const STRANGER = "44444444-4444-4444-4444-444444444444";
const ADMIN = "55555555-5555-5555-5555-555555555555";

const owner = userCtx(OWNER, "req-owner");
const friend = userCtx(FRIEND, "req-friend");
const stranger = userCtx(STRANGER, "req-stranger");
const admin = adminCtx(ADMIN, "req-admin");
const anonymous = anonymousCtx("req-anon");

let seq = 0;
/** Unlikely to collide with real catalog data, and unique per call. */
const fixtureName = (): string => {
  seq += 1;
  return `__B3_TEST_BRAND__${Date.now().toString(36)}-${seq}`;
};

const newActor = (id: string, db: DbOrTx): BrandActor =>
  createActor(BrandActor, id, db);

const seedBrand = async (
  db: DbOrTx,
  name = fixtureName(),
): Promise<{ id: string; name: string }> => {
  const id = crypto.randomUUID();
  const actor = await activate(newActor(id, db));
  const created = await actor.create(owner, { name });
  return { id: created.id, name: created.name };
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("BrandActor (B3)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §1.1 — it writes brands", () => {
    expect(BrandActor.category).toBe("entity");
  });

  describe("get", () => {
    it("owner, friend and stranger — any signed-in viewer — see the same row", async () => {
      await withTestDb(async (db) => {
        const { id, name } = await seedBrand(db);
        for (const ctx of [owner, friend, stranger]) {
          const actor = await activate(newActor(id, db));
          const seen = await actor.get(ctx);
          expect(seen).toMatchObject({ id, name });
        }
      });
    });

    it("refuses an anonymous caller", async () => {
      await withTestDb(async (db) => {
        const { id } = await seedBrand(db);
        const actor = await activate(newActor(id, db));
        await expect(actor.get(anonymous)).rejects.toBeInstanceOf(
          ForbiddenError,
        );
      });
    });

    it("reports NotFound for a brand that does not exist", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(
          newActor("00000000-0000-0000-0000-0000000000ff", db),
        );
        await expect(actor.get(owner)).rejects.toBeInstanceOf(NotFoundError);
      });
    });
  });

  describe("create", () => {
    it("refuses an anonymous caller", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newActor(crypto.randomUUID(), db));
        await expect(
          actor.create(anonymous, { name: fixtureName() }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });

    it("rejects a blank name", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newActor(crypto.randomUUID(), db));
        await expect(
          actor.create(owner, { name: "   " }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });

    it("trims the stored name", async () => {
      await withTestDb(async (db) => {
        const raw = `  ${fixtureName()}  `;
        const brandId = crypto.randomUUID();
        const actor = await activate(newActor(brandId, db));
        const created = await actor.create(owner, { name: raw });
        expect(created.name).toBe(raw.trim());
      });
    });

    it("is idempotent on id: a retried call with the same id returns the existing row, not a second insert", async () => {
      await withTestDb(async (db) => {
        const brandId = crypto.randomUUID();
        const name = fixtureName();

        const first = await activate(newActor(brandId, db));
        const created = await first.create(owner, { name });

        // A fresh activation of the same id — exactly what a redelivered
        // call sees, since Dapr reactivates rather than reusing an instance
        // across every retry.
        const retried = await activate(newActor(brandId, db));
        const again = await retried.create(owner, { name });

        expect(again).toEqual(created);
        const rows = await db
          .select()
          .from(brands)
          .where(eq(brands.id, brandId));
        expect(rows).toHaveLength(1);
      });
    });

    it("throws ConflictError — the tripwire — for a name that already exists under a different id, case-insensitively", async () => {
      await withTestDb(async (db) => {
        const name = fixtureName();
        const first = await activate(newActor(crypto.randomUUID(), db));
        await first.create(owner, { name });

        const second = await activate(newActor(crypto.randomUUID(), db));
        await expect(
          second.create(owner, { name: name.toUpperCase() }),
        ).rejects.toBeInstanceOf(ConflictError);

        const rows = await db
          .select()
          .from(brands)
          .where(eq(brands.name, name));
        expect(rows).toHaveLength(1);
      });
    });
  });

  describe("update", () => {
    it("admin succeeds; two different non-admin signed-in viewers are both refused", async () => {
      await withTestDb(async (db) => {
        const { id } = await seedBrand(db);

        for (const ctx of [friend, stranger]) {
          const actor = await activate(newActor(id, db));
          await expect(
            actor.update(ctx, { description: "nope" }),
          ).rejects.toBeInstanceOf(ForbiddenError);
        }

        const actor = await activate(newActor(id, db));
        const updated = await actor.update(admin, {
          description: "an admin edit",
        });
        expect(updated.description).toBe("an admin edit");
      });
    });

    it("refuses an anonymous caller", async () => {
      await withTestDb(async (db) => {
        const { id } = await seedBrand(db);
        const actor = await activate(newActor(id, db));
        await expect(
          actor.update(anonymous, { description: "nope" }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });

    it("renaming into an existing name throws ConflictError and leaves the row untouched", async () => {
      await withTestDb(async (db) => {
        const taken = await seedBrand(db);
        const { id } = await seedBrand(db);

        const actor = await activate(newActor(id, db));
        await expect(
          actor.update(admin, { name: taken.name }),
        ).rejects.toBeInstanceOf(ConflictError);

        const [row] = await db.select().from(brands).where(eq(brands.id, id));
        expect(row?.name).not.toBe(taken.name);
      });
    });

    it("leaves fields not present in the input unchanged", async () => {
      await withTestDb(async (db) => {
        const brandId = crypto.randomUUID();
        const actor = await activate(newActor(brandId, db));
        await actor.create(owner, {
          name: fixtureName(),
          description: "original",
        });

        const again = await activate(newActor(brandId, db));
        const updated = await again.update(admin, {
          logoUrl: "https://x/y.png",
        });
        expect(updated.description).toBe("original");
        expect(updated.logoUrl).toBe("https://x/y.png");
      });
    });
  });

  describe("setParent", () => {
    it("admin succeeds; a non-admin signed-in viewer is refused", async () => {
      await withTestDb(async (db) => {
        const parent = await seedBrand(db);
        const { id } = await seedBrand(db);

        const asStranger = await activate(newActor(id, db));
        await expect(
          asStranger.setParent(stranger, parent.id),
        ).rejects.toBeInstanceOf(ForbiddenError);

        const asAdmin = await activate(newActor(id, db));
        const updated = await asAdmin.setParent(admin, parent.id);
        expect(updated.parentBrandId).toBe(parent.id);
      });
    });

    it("refuses a self-reference", async () => {
      await withTestDb(async (db) => {
        const { id } = await seedBrand(db);
        const actor = await activate(newActor(id, db));
        await expect(actor.setParent(admin, id)).rejects.toBeInstanceOf(
          ValidationError,
        );
      });
    });

    it("refuses a cycle (A -> B -> A)", async () => {
      await withTestDb(async (db) => {
        const a = await seedBrand(db);
        const b = await seedBrand(db);

        // A's parent is B.
        const actorA = await activate(newActor(a.id, db));
        await actorA.setParent(admin, b.id);

        // B's parent is A would close the loop.
        const actorB = await activate(newActor(b.id, db));
        await expect(actorB.setParent(admin, a.id)).rejects.toBeInstanceOf(
          ValidationError,
        );
      });
    });

    it("reports NotFound for a parent that does not exist", async () => {
      await withTestDb(async (db) => {
        const { id } = await seedBrand(db);
        const actor = await activate(newActor(id, db));
        await expect(
          actor.setParent(admin, "00000000-0000-0000-0000-0000000000ff"),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("clears the parent when passed null", async () => {
      await withTestDb(async (db) => {
        const parent = await seedBrand(db);
        const { id } = await seedBrand(db);

        const first = await activate(newActor(id, db));
        await first.setParent(admin, parent.id);

        const second = await activate(newActor(id, db));
        const cleared = await second.setParent(admin, null);
        expect(cleared.parentBrandId).toBeNull();
      });
    });
  });

  it("rolls every test back: nothing survives withTestDb", async () => {
    const leaked = await withTestDb(async (db) => {
      const { id } = await seedBrand(db);
      return id;
    });
    const survivors = await withTestDb((db) =>
      db.select({ id: brands.id }).from(brands).where(eq(brands.id, leaked)),
    );
    expect(survivors).toEqual([]);
  });
});
