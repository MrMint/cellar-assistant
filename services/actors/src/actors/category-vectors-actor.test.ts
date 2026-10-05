/**
 * `CategoryVectorsActor` against a real Postgres (A9, migration plan §2.1).
 */
import { ForbiddenError, ValidationError } from "@cellar-assistant/contracts";
import { categoryVectors } from "@cellar-assistant/db";
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
import { CategoryVectorsActor } from "./category-vectors-actor.ts";

const CATEGORY_VECTORS_ACTOR_ID = "singleton";

const newActor = (db: DbOrTx): CategoryVectorsActor =>
  createActor(CategoryVectorsActor, CATEGORY_VECTORS_ACTOR_ID, db);

const vector768 = (fill: number): number[] => Array(768).fill(fill);

let seq = 0;
/** A fixture label unlikely to collide with real category data. */
const fixtureLabel = (): string => {
  seq += 1;
  return `__A9_TEST__${Date.now().toString(36)}-${seq}`;
};

const systemCtx = { viewerId: null, kind: "system" as const, requestId: "r" };
const userCtx = {
  viewerId: "11111111-1111-4111-8111-111111111111",
  kind: "user" as const,
  requestId: "r",
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("CategoryVectorsActor (A9)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §1.1 — it writes category_vectors", () => {
    expect(CategoryVectorsActor.category).toBe("entity");
  });

  it("seed writes a row that all() then returns, without the raw vector", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newActor(db));
      const label = fixtureLabel();

      const result = await actor.seed(systemCtx, [
        {
          label,
          labelType: "category",
          associatedCategories: ["red-wine", "bold"],
          vector: vector768(0.1),
          metadata: { source: "a9-test" },
        },
      ]);
      expect(result).toEqual({ seeded: 1 });

      const rows = await actor.all(systemCtx);
      const row = rows.find((r) => r.label === label);
      expect(row).toBeDefined();
      expect(row).toMatchObject({
        label,
        labelType: "category",
        associatedCategories: ["red-wine", "bold"],
        metadata: { source: "a9-test" },
      });
      expect(row).not.toHaveProperty("vector");
    });
  });

  it("seed upserts on label — a second seed for the same label updates it in place", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newActor(db));
      const label = fixtureLabel();

      await actor.seed(systemCtx, [
        { label, vector: vector768(0.1), metadata: { v: 1 } },
      ]);
      await actor.seed(systemCtx, [
        { label, vector: vector768(0.2), metadata: { v: 2 } },
      ]);

      const [dbRows, actorRows] = await Promise.all([
        db
          .select({ id: categoryVectors.id })
          .from(categoryVectors)
          .where(eq(categoryVectors.label, label)),
        actor.all(systemCtx),
      ]);
      expect(dbRows).toHaveLength(1);
      const row = actorRows.find((r) => r.label === label);
      expect(row?.metadata).toEqual({ v: 2 });
    });
  });

  it("seed is admin/system only", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newActor(db));
      await expect(
        actor.seed(userCtx, [
          { label: fixtureLabel(), vector: vector768(0.1) },
        ]),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  it("seed rejects an empty batch and an empty vector", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newActor(db));
      await expect(actor.seed(systemCtx, [])).rejects.toThrow(ValidationError);
      await expect(
        actor.seed(systemCtx, [{ label: fixtureLabel(), vector: [] }]),
      ).rejects.toThrow(ValidationError);
    });
  });

  it("all() defaults labelType and associatedCategories when omitted", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newActor(db));
      const label = fixtureLabel();
      await actor.seed(systemCtx, [{ label, vector: vector768(0.3) }]);
      const row = (await actor.all(systemCtx)).find((r) => r.label === label);
      expect(row).toMatchObject({ labelType: "category", metadata: {} });
      expect(row?.associatedCategories).toEqual([]);
    });
  });
});
