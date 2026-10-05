/**
 * `vectors.ts`' pure half. The distance query is exercised against Postgres
 * by `cellar-actor.test.ts` and `cellar-item-search-actor.test.ts`, and the
 * freshness test and the regenerate sequence by both actors'
 * `regenerateVector` suites; this pins the edges those suites do not reach
 * one by one.
 */
import { sql } from "@cellar-assistant/db/orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import { ARCS } from "./item-arcs.ts";
import { seedItemVector, seedWine } from "./search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";
import {
  embeddingModelKey,
  halfvec,
  imageSetKey,
  NO_IMAGES,
  regenerateIfStale,
  type StoredVector,
  storedVector,
  toVectorLiteral,
  vectorDistances,
  vectorIsFresh,
} from "./vectors.ts";

const at = (iso: string): Date => new Date(iso);

describe("toVectorLiteral / halfvec", () => {
  it("renders the text form every halfvec cast takes, as one parameter", () => {
    expect(toVectorLiteral([0.5, -1, 0])).toBe("[0.5,-1,0]");
    const { sql, params } = new PgDialect().sqlToQuery(halfvec([1, 2]));
    expect({ sql, params }).toEqual({ sql: "$1::halfvec", params: ["[1,2]"] });
  });
});

describe("vectorIsFresh", () => {
  const vector = {
    updatedAt: at("2026-01-02T00:00:00Z"),
    model: null,
    images: null,
  };

  it("a missing vector is never fresh", () => {
    expect(vectorIsFresh(null, [])).toBe(false);
    expect(vectorIsFresh(null, [null])).toBe(false);
  });

  it("is fresh when at least as new as every input — equal counts", () => {
    expect(vectorIsFresh(vector, [at("2026-01-01T00:00:00Z")])).toBe(true);
    expect(vectorIsFresh(vector, [at("2026-01-02T00:00:00Z")])).toBe(true);
  });

  it("is stale when any one input is newer (the recipe group case)", () => {
    expect(
      vectorIsFresh(vector, [
        at("2026-01-01T00:00:00Z"),
        at("2026-01-03T00:00:00Z"),
      ]),
    ).toBe(false);
  });

  it("treats a missing input timestamp as the epoch", () => {
    expect(vectorIsFresh(vector, [null, undefined])).toBe(true);
    expect(vectorIsFresh({ ...vector, updatedAt: new Date(0) }, [null])).toBe(
      true,
    );
  });
});

describe("vectorIsFresh — which embedding made it", () => {
  const MODEL = "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT";
  const expected = { model: MODEL, images: "2:front,back" };
  const made = {
    updatedAt: at("2026-01-02T00:00:00Z"),
    model: MODEL,
    images: "2:front,back",
  };
  const older = [at("2026-01-01T00:00:00Z")];

  it("is fresh only when the configured model and image set made it", () => {
    expect(vectorIsFresh(made, older, expected)).toBe(true);
  });

  /**
   * The failure this exists for: after a model change nothing an item is made
   * of has changed, so by timestamp every vector is fresh — and in the old
   * model's space.
   */
  it("is stale when another model made it, however new it is", () => {
    expect(
      vectorIsFresh(
        {
          ...made,
          model: "vertex-ai:text-embedding-005@768/RETRIEVAL_DOCUMENT",
        },
        older,
        expected,
      ),
    ).toBe(false);
  });

  it("is stale when nobody recorded what made it — every migrated legacy vector", () => {
    expect(
      vectorIsFresh({ ...made, model: null, images: null }, older, expected),
    ).toBe(false);
  });

  it("is stale when the image set changed (a new display image)", () => {
    expect(
      vectorIsFresh(made, older, { model: MODEL, images: "2:front,other" }),
    ).toBe(false);
  });

  it("with no model configured, leaves it to the timestamp", () => {
    expect(vectorIsFresh({ ...made, model: null }, older, null)).toBe(true);
  });
});

describe("imageSetKey / embeddingModelKey", () => {
  it("spells no images as none, and a set as its count and ordered ids", () => {
    expect(imageSetKey([])).toBe(NO_IMAGES);
    expect(imageSetKey(["a", "b"])).toBe("2:a,b");
    expect(imageSetKey(["b", "a"])).not.toBe(imageSetKey(["a", "b"]));
  });

  it("names provider, model, width and the document task", () => {
    expect(
      embeddingModelKey({
        provider: "vertex-ai",
        model: "gemini-embedding-2",
        dimensions: 768,
      }),
    ).toBe("vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT");
  });
});

describe("storedVector", () => {
  it("takes the first row, reading a null updated_at as the epoch", () => {
    expect(storedVector([])).toBeNull();
    expect(
      storedVector([
        { id: 3, updatedAt: null },
        { id: 4, updatedAt: at("2026-01-01T00:00:00Z") },
      ]),
    ).toEqual({ id: 3, updatedAt: new Date(0), model: null, images: null });
  });
});

describe("regenerateIfStale", () => {
  const stored: StoredVector = {
    id: 7,
    updatedAt: at("2026-01-02T00:00:00Z"),
    model: "m",
    images: NO_IMAGES,
  };
  const newer = [at("2026-01-03T00:00:00Z")];

  const recording = () => {
    const calls: string[] = [];
    const steps = {
      embed: async () => {
        calls.push("embed");
        return [1, 2];
      },
      write: async (embedded: number[], existing: StoredVector | null) => {
        calls.push(`write ${embedded.join(",")} ${existing?.id ?? "insert"}`);
      },
    };
    return { calls, steps };
  };

  it("a fresh vector stops before the model and before any write", async () => {
    const { calls, steps } = recording();
    await expect(
      regenerateIfStale(stored, [at("2026-01-01T00:00:00Z")], steps),
    ).resolves.toBe("fresh");
    expect(calls).toEqual([]);
  });

  it("no vector: embeds, then writes with nothing to update", async () => {
    const { calls, steps } = recording();
    await expect(regenerateIfStale(null, [], steps)).resolves.toBe(
      "first vector",
    );
    expect(calls).toEqual(["embed", "write 1,2 insert"]);
  });

  it("a stale vector: embeds, then writes the row it was given", async () => {
    const { calls, steps } = recording();
    await expect(regenerateIfStale(stored, newer, steps)).resolves.toBe(
      "changed",
    );
    expect(calls).toEqual(["embed", "write 1,2 7"]);
  });

  it("a vector another embedding made: re-embeds even though no input is newer", async () => {
    const { calls, steps } = recording();
    await expect(
      regenerateIfStale(stored, [at("2026-01-01T00:00:00Z")], steps, {
        model: "another",
        images: NO_IMAGES,
      }),
    ).resolves.toBe("embedding changed");
    expect(calls).toEqual(["embed", "write 1,2 7"]);
  });

  it("a failed embed propagates unchanged and never writes", async () => {
    const { calls, steps } = recording();
    const boom = new Error("model down");
    await expect(
      regenerateIfStale(stored, newer, {
        ...steps,
        embed: () => Promise.reject(boom),
      }),
    ).rejects.toBe(boom);
    expect(calls).toEqual([]);
  });
});

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("vectorDistances (against Postgres)", () => {
  afterAll(closeTestDb);

  /**
   * `item_vectors.vector` is nullable. A null row's distance is SQL `null`,
   * which `Number()` turns into `0` — a *perfect* match. The `is not null`
   * filter is the only thing keeping such a row out of every ranking, and
   * dropping it used to survive the suite.
   */
  it("leaves out an item whose stored vector is null, rather than ranking it at distance 0", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const embedded = await seedWine(db, user, "Embedded");
      const hollow = await seedWine(db, user, "Hollow");
      const query = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
      await seedItemVector(
        db,
        embedded,
        Array.from({ length: 768 }, (_, i) => (i === 1 ? 1 : 0)),
      );
      await db.execute(sql`
        insert into public.item_vectors (${ARCS.itemVectors.unqualified(hollow.type)}, vector)
        values (${hollow.id}::uuid, null)
      `);

      const distances = await vectorDistances(db, [embedded, hollow], query);
      expect([...distances.keys()]).toEqual([embedded.id]);
      // Orthogonal unit vectors: cosine distance 1, not 0.
      expect(distances.get(embedded.id)).toBeCloseTo(1, 3);
    });
  });
});
