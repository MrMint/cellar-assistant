/**
 * `BrandRegistryActor` against a real Postgres (B3, migration plan §2.1, §1.2).
 *
 * `createActor` (`src/lib/testing.ts`) only forwards three constructor
 * arguments, so — exactly as `file-actor.test.ts` does for `FileActor`'s
 * storage binding — `BrandRegistryActor`'s fourth constructor argument (the
 * `BrandCreator` seam) is supplied here directly instead of through that
 * helper. `inProcessCreator` wires it to a real, in-process `BrandActor`
 * sharing the caller's own transaction, rather than a Dapr sidecar hop.
 *
 * ## Why the concurrency test does not use `withTestDb`
 *
 * `withTestDb` runs the whole test body inside *one* outer transaction and
 * rolls it back at the end (`src/lib/testing.ts`); every actor's own
 * `this.tx()` opens a *savepoint* inside it. That is perfect for isolating
 * sequential tests from each other, but it cannot produce genuine concurrent
 * contention: everything nested under one transaction runs against one
 * session, serialized by definition. The one test that has to prove real
 * concurrency (`resolve("Same Name")` converges on one brand, migration plan
 * §6 B3) instead opens N independent, real `testDb().transaction(...)` calls
 * against the pool — genuinely overlapping sessions — and cleans up for real
 * afterwards, because nothing here is rolled back for it.
 *
 * ## B3b: re-measured, and this one *did* contend — unlike B5's `PlaceActor`
 *
 * B5 (`place-creation-actor.test.ts`) measured that a bare `Promise.all`
 * against `PlaceActor` does not reliably contend: `createPlace` runs several
 * queries (rate limit, duplicate search, AI review) before its own INSERT,
 * so the pool's first transaction fully commits while the rest are still on
 * their pre-checks, and every loser short-circuits on the already-committed
 * row without ever touching the unique index — 0 collisions in 3 runs.
 *
 * `BrandRegistryActor.resolve` has almost no pre-work: validate the name,
 * check the (already-loaded) cache, call `#createBrand`. Re-running B3's
 * original 50-way `Promise.all` version of this test with collision
 * counting added (not committed — measured directly, three runs) gave
 * `converged=9, settled=1` **every time**: the pool hands out exactly
 * `max` (10) connections at once, all ten reach `#createBrand` closely
 * enough together to collide on `brands_unique_lower_name` for real, and
 * only the remaining 40 — queued for a connection until after the winner
 * commits — short-circuit on the cached row. So B3's original test *was*
 * exercising the tripwire, just not by design and not documented as such.
 *
 * The barrier below is still the right fix: it makes that convergence
 * deterministic and independent of pool size/timing rather than an
 * accident of how fast `resolve` reaches its own INSERT, and it is the same
 * technique B5 uses so the two acceptance tests read the same way.
 */
import {
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  normalizeBrandName,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { brands } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  testDb,
  withTestDb,
} from "../lib/testing.ts";
import { BrandActor } from "./brand-actor.ts";
import type { BrandCreator } from "./brand-registry-actor.ts";
import { BrandRegistryActor } from "./brand-registry-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/** The real production path, but pointed at an in-process `BrandActor`
 *  sharing `db` instead of a Dapr sidecar hop — see the module doc. */
const inProcessCreator =
  (db: DbOrTx): BrandCreator =>
  async (ctx, brandId, input) => {
    const actor = await activate(createActor(BrandActor, brandId, db));
    return actor.create(ctx, input);
  };

const newRegistryActor = (
  normalizedName: string,
  db: DbOrTx,
  createBrand: BrandCreator = inProcessCreator(db),
): BrandRegistryActor =>
  new BrandRegistryActor(
    daprClient(),
    new ActorId(normalizedName),
    db,
    createBrand,
  );

const OWNER = "11111111-1111-1111-1111-111111111111";
const owner = userCtx(OWNER, "req-owner");
const anonymous = anonymousCtx("req-anon");

let seq = 0;
/** Unlikely to collide with real catalog data, and unique per call. */
const fixtureName = (): string => {
  seq += 1;
  return `__B3_TEST_REGISTRY__${Date.now().toString(36)}-${seq}`;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("BrandRegistryActor (B3)", () => {
  afterAll(closeTestDb);

  it("is tagged entity (§2.1: 'registry (entity category, no owned table)')", () => {
    expect(BrandRegistryActor.category).toBe("entity");
  });

  it("refuses an anonymous caller", async () => {
    await withTestDb(async (db) => {
      const name = fixtureName();
      const actor = await activate(
        newRegistryActor(normalizeBrandName(name), db),
      );
      await expect(actor.resolve(anonymous, name)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  it("rejects a blank name", async () => {
    await withTestDb(async (db) => {
      // The actor id is independent of the (invalid) `name` argument being
      // tested here — a real caller normalizes first and would never
      // address `BrandRegistryActor("")`, but `resolve`'s own validation of
      // its `name` parameter does not depend on `this.key` at all.
      const actor = await activate(newRegistryActor("placeholder", db));
      await expect(actor.resolve(owner, "   ")).rejects.toBeInstanceOf(
        ValidationError,
      );
    });
  });

  it("first resolve() creates the brand; a second resolve() for the same (differently-cased, padded) name returns the same id without a second insert", async () => {
    await withTestDb(async (db) => {
      const name = fixtureName();
      const normalized = normalizeBrandName(name);

      const first = await activate(newRegistryActor(normalized, db));
      const created = await first.resolve(owner, name);

      // A fresh activation, as a second, unrelated call would see — and a
      // different casing/padding of the same name, normalizing to the same key.
      const second = await activate(newRegistryActor(normalized, db));
      const again = await second.resolve(owner, `  ${name.toUpperCase()}  `);

      expect(again.id).toBe(created.id);

      const rows = await db
        .select()
        .from(brands)
        .where(sql`lower(trim(${brands.name})) = ${normalized}`);
      expect(rows).toHaveLength(1);
    });
  });

  /**
   * The regression test for B10 (module doc: "`loadAggregate` is never
   * trusted as a standing cache"). `brands` is `BrandActor`'s table, not
   * this registry's — before the fix, a registry activated while a name was
   * still free cached "not found" for the life of the activation, and a
   * later `resolve()` for that same name would call `#createBrand` again
   * even if the brand had, in the meantime, been created directly. This
   * activation never calls `reload()` itself; `unreachableCreator` turns a
   * stale read into a failing assertion, because a correct `resolve()` finds
   * the brand on its own fresh read and never reaches the creator at all.
   */
  it("sees a brand created directly by BrandActor after this activation started", async () => {
    await withTestDb(async (db) => {
      const name = fixtureName();
      const normalized = normalizeBrandName(name);

      const unreachableCreator: BrandCreator = async () => {
        throw new Error(
          "resolve() should have found the brand on a fresh read, not tried to create one",
        );
      };
      // Activated while no brand named this exists yet — `loadAggregate`
      // caches "not found".
      const registry = await activate(
        newRegistryActor(normalized, db, unreachableCreator),
      );

      // A *different* aggregate writes `brands`, bypassing the registry
      // entirely — exactly the case §2.1 names as "called only by
      // `BrandRegistryActor`" in convention, not in enforcement.
      const direct = await activate(
        createActor(BrandActor, crypto.randomUUID(), db),
      );
      const created = await direct.create(owner, { name });

      // The same, still-warm registry activation, no reload() call here.
      const resolved = await registry.resolve(owner, name);
      expect(resolved.id).toBe(created.id);
    });
  });

  it("catches the tripwire: when create() reports a name conflict, it re-reads and returns the winner instead of failing", async () => {
    await withTestDb(async (db) => {
      const name = fixtureName();
      const normalized = normalizeBrandName(name);

      // Simulate the race directly: someone else's row is already committed
      // under this name (as it would be, for `BrandActor.create`'s unique
      // violation to fire in the first place), and the injected creator
      // reports exactly the error `BrandActor.create` translates a unique
      // violation into.
      const winner = await activate(
        createActor(BrandActor, crypto.randomUUID(), db),
      );
      const winnerRow = await winner.create(owner, { name });

      const alwaysConflicts: BrandCreator = async () => {
        throw new ConflictError(`a brand named "${name}" already exists`);
      };
      const registry = await activate(
        newRegistryActor(normalized, db, alwaysConflicts),
      );

      const resolved = await registry.resolve(owner, name);
      expect(resolved.id).toBe(winnerRow.id);
    });
  });

  it("re-throws a non-conflict failure from create() rather than masking it", async () => {
    await withTestDb(async (db) => {
      const name = fixtureName();
      const boom = new Error("sidecar unreachable");
      const alwaysFails: BrandCreator = async () => {
        throw boom;
      };
      const registry = await activate(
        newRegistryActor(normalizeBrandName(name), db, alwaysFails),
      );
      await expect(registry.resolve(owner, name)).rejects.toBe(boom);
    });
  });

  /**
   * The acceptance proof (migration plan §6 B3: "50 concurrent
   * resolve("Same Name") produce one brand"), re-worked for B3b. See the
   * module doc for why this cannot run inside `withTestDb`, and for why a
   * bare `Promise.all` is not enough on its own.
   *
   * Each attempt is its own top-level transaction against the real pool, its
   * own `BrandRegistryActor` activation (a fresh `SELECT` sees "no row yet"
   * for every one of them, since none has committed), and its own
   * freshly-minted candidate `brandId`. The barrier holds every attempt at
   * the door of `#createBrand` — the injected seam that reaches
   * `BrandActor.create` — until all `CONCURRENCY` have arrived, then releases
   * them together, so their INSERTs genuinely race for
   * `brands_unique_lower_name` instead of arriving one at a time. `resolve`'s
   * own recovery (catch `ConflictError`, re-read, return the winner) is
   * exercised for real rather than by a hand-thrown stub.
   *
   * `CONCURRENCY` stays under node-postgres's default pool size of 10, the
   * same ceiling `place-creation-actor.test.ts` (B5) documents: a barrier
   * waiting on more transactions than there are connections would deadlock
   * rather than fail.
   */
  it("8 simultaneous resolve() calls for the same name — real, independent Postgres transactions, released into create() together — converge on exactly one brand row", async () => {
    const name = fixtureName();
    const normalized = normalizeBrandName(name);
    const CONCURRENCY = 8;

    let arrived = 0;
    let release: () => void = () => {};
    const allArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    const barrier = async (): Promise<void> => {
      arrived += 1;
      if (arrived === CONCURRENCY) release();
      await allArrived;
    };

    // How each turn came out. `converged` is a turn whose INSERT lost the
    // `brands_unique_lower_name` race and was handed back the typed
    // `ConflictError` that `resolve` catches to re-read and return the
    // winner; `settled` is the winner plus anything that got there late
    // enough to see the committed row instead of racing for it.
    const outcome = { settled: 0, converged: 0 };
    const barrieredCreator =
      (db: DbOrTx): BrandCreator =>
      async (ctx, brandId, input) => {
        await barrier();
        try {
          const created = await inProcessCreator(db)(ctx, brandId, input);
          outcome.settled += 1;
          return created;
        } catch (error) {
          if (error instanceof ConflictError) outcome.converged += 1;
          throw error;
        }
      };

    const attempt = (): Promise<{ id: string }> =>
      testDb().transaction(async (tx) => {
        const actor = await activate(
          newRegistryActor(normalized, tx, barrieredCreator(tx)),
        );
        return actor.resolve(owner, name);
      });

    try {
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => attempt()),
      );

      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(1);
      // The tripwire really fired: at least one INSERT lost the race and
      // came back through `resolve`'s `ConflictError` catch rather than
      // every attempt simply seeing an already-committed row.
      expect(outcome.converged).toBeGreaterThan(0);
      expect(outcome.settled + outcome.converged).toBe(CONCURRENCY);

      const rows = await testDb()
        .select()
        .from(brands)
        .where(sql`lower(trim(${brands.name})) = ${normalized}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe([...ids][0]);

      console.log(
        `[B3b acceptance] ${CONCURRENCY} simultaneous resolve(), one name: ` +
          `${outcome.converged} converged via brands_unique_lower_name, ` +
          `${outcome.settled} settled without a collision; ` +
          `${ids.size} distinct id returned, ${rows.length} row in brands`,
      );
    } finally {
      // Real commits, so real cleanup — nothing here rolls back.
      await testDb()
        .delete(brands)
        .where(sql`lower(trim(${brands.name})) = ${normalized}`);
    }
  }, 30_000);
});
