/**
 * Proof that the harness works: a real entity actor, a real Postgres, no Dapr
 * sidecar anywhere in the process.
 *
 * `DemoCellarActor` is defined here rather than in `src/actors/` on purpose —
 * `CellarActor` belongs to B1, and this file must not pre-empt it. It is,
 * however, exactly the shape B1 should write.
 */
import {
  type Ctx,
  ForbiddenError,
  NotFoundError,
  userCtx,
} from "@cellar-assistant/contracts";
import { cellarOwners, cellars } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { canSeeCellar, isOwner, type Privacy } from "@cellar-assistant/policy";
import { afterAll, describe, expect, it } from "vitest";
import { ActorBase, EntityActorBase } from "./actor-base.ts";
import type { DbOrTx } from "./db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

type CellarAggregate = {
  cellar: typeof cellars.$inferSelect;
  coOwnerIds: string[];
};

class DemoCellarActor extends EntityActorBase<CellarAggregate> {
  protected async loadAggregate(id: string): Promise<CellarAggregate | null> {
    const [cellar] = await this.db
      .select()
      .from(cellars)
      .where(eq(cellars.id, id));
    if (cellar === undefined) return null;
    const owners = await this.db
      .select({ userId: cellarOwners.userId })
      .from(cellarOwners)
      .where(eq(cellarOwners.cellarId, id));
    return { cellar, coOwnerIds: owners.map((o) => o.userId) };
  }

  /** Existence, then policy, then the work — and denial reads as absence. */
  async get(ctx: Ctx): Promise<typeof cellars.$inferSelect> {
    const aggregate = this.requireAggregate();
    const visible = canSeeCellar(ctx, {
      createdById: aggregate.cellar.createdById,
      privacy: aggregate.cellar.privacy as Privacy,
      coOwnerIds: aggregate.coOwnerIds,
      // B1 derives this with `isFriend` over the loaded `friends` rows.
      viewerIsFriendOfCreator: false,
    });
    if (!visible) throw new NotFoundError(`cellar ${this.key} not found`);
    return aggregate.cellar;
  }

  async rename(ctx: Ctx, name: string): Promise<void> {
    const aggregate = this.requireAggregate();
    if (!isOwner(ctx, aggregate.cellar.createdById)) {
      throw new ForbiddenError(`cellar ${this.key} is not yours to rename`);
    }
    await this.tx(async (tx) => {
      await tx
        .update(cellars)
        .set({ name, updatedAt: new Date() })
        .where(eq(cellars.id, this.key));
    });
    await this.reload();
  }

  /** Only so the test can see what activate loaded. */
  async loadedName(): Promise<string | null> {
    return this.aggregate?.cellar.name ?? null;
  }
}

/**
 * The same actor, with a switch that makes the next load fail.
 *
 * It throws rather than issuing a statement that Postgres rejects, and that is
 * not laziness: the harness runs every test inside one transaction, and a
 * failed statement aborts it, so a real `1/0` would take the *repair* load down
 * with it and prove nothing. The message is the one `pg` raises when the pool
 * gives up (`packages/db/src/index.ts`), which is the failure this guards —
 * along with a failover and a placement restart landing between the commit and
 * the reload.
 */
class FlakyCellarActor extends DemoCellarActor {
  failLoads = false;
  loads = 0;

  protected override async loadAggregate(
    id: string,
  ): Promise<CellarAggregate | null> {
    this.loads += 1;
    if (this.failLoads) {
      throw new Error("timeout exceeded when trying to connect");
    }
    return super.loadAggregate(id);
  }

  /** `cacheUnusable` is protected; the test needs to see it. */
  get unusable(): boolean {
    return this.cacheUnusable;
  }
}

/** A read-only category, to prove `tx()` refuses one (§1.1). */
class DemoCellarsCollectionActor extends ActorBase {
  static readonly category = "collection" as const;

  async writeAnyway(): Promise<void> {
    await this.tx(async () => undefined);
  }
}

const seedCellar = async (
  tx: DbOrTx,
  input: { createdById: string; privacy: Privacy; name?: string },
): Promise<string> => {
  const [row] = await tx
    .insert(cellars)
    .values({
      name: input.name ?? "Demo cellar",
      createdById: input.createdById,
      privacy: input.privacy,
    })
    .returning({ id: cellars.id });
  if (row === undefined) throw new Error("seedCellar: no row returned");
  return row.id;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("actor harness (no Dapr sidecar)", () => {
  afterAll(closeTestDb);

  it("runs onActivate against a real Postgres and caches the aggregate", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: ownerId,
        privacy: "PRIVATE",
        name: "Loaded on activate",
      });

      const actor = createActor(DemoCellarActor, cellarId, db);
      // Nothing is loaded until activation.
      expect(await actor.loadedName()).toBeNull();
      await activate(actor);
      expect(await actor.loadedName()).toBe("Loaded on activate");
    });
  });

  it("runs a method: owner sees a PRIVATE cellar, stranger gets NotFound", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const strangerId = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: ownerId,
        privacy: "PRIVATE",
      });
      const actor = await activate(createActor(DemoCellarActor, cellarId, db));

      const seen = await actor.get(userCtx(ownerId, "req-owner"));
      expect(seen.id).toBe(cellarId);

      await expect(
        actor.get(userCtx(strangerId, "req-stranger")),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("activates an id with no row and reports NotFound", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(
          DemoCellarActor,
          "00000000-0000-0000-0000-0000000000ff",
          db,
        ),
      );
      await expect(actor.get(userCtx("someone", "r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it("writes through the transaction helper and reloads the cache", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: ownerId,
        privacy: "PRIVATE",
        name: "Before",
      });
      const actor = await activate(createActor(DemoCellarActor, cellarId, db));

      await actor.rename(userCtx(ownerId, "req-owner"), "After");

      expect(await actor.loadedName()).toBe("After");
      const [row] = await db
        .select({ name: cellars.name })
        .from(cellars)
        .where(eq(cellars.id, cellarId));
      expect(row?.name).toBe("After");
    });
  });

  it("refuses a write from a non-owner", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const strangerId = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: ownerId,
        privacy: "PUBLIC",
        name: "Untouched",
      });
      const actor = await activate(createActor(DemoCellarActor, cellarId, db));

      await expect(
        actor.rename(userCtx(strangerId, "req-stranger"), "Hijacked"),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(await actor.loadedName()).toBe("Untouched");
    });
  });

  it("rolls every test back: nothing survives withTestDb", async () => {
    const leaked = await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      return seedCellar(db, { createdById: ownerId, privacy: "PUBLIC" });
    });
    const survivors = await withTestDb((db) =>
      db.select({ id: cellars.id }).from(cellars).where(eq(cellars.id, leaked)),
    );
    expect(survivors).toEqual([]);
  });

  it("does not serve the pre-write copy when the reload after a commit fails", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: ownerId,
        privacy: "PRIVATE",
        name: "Before",
      });
      const actor = await activate(createActor(FlakyCellarActor, cellarId, db));
      expect(actor.unusable).toBe(false);

      actor.failLoads = true;
      await expect(
        actor.rename(userCtx(ownerId, "req-owner"), "After"),
      ).rejects.toThrow(/timeout exceeded when trying to connect/);

      // The write committed — that is the whole problem.
      const [row] = await db
        .select({ name: cellars.name })
        .from(cellars)
        .where(eq(cellars.id, cellarId));
      expect(row?.name).toBe("After");

      // The copy is still there and still wrong, and is now flagged. It is
      // deliberately not nulled: `requireAggregate()` would then say NotFound
      // about a row that exists, for every turn until the idle timeout.
      expect(await actor.loadedName()).toBe("Before");
      expect(actor.unusable).toBe(true);

      // Dapr runs this before the next method body. The flagged copy is
      // rebuilt, and what that turn sees is what Postgres holds.
      actor.failLoads = false;
      await actor.onActorMethodPre();
      expect(actor.unusable).toBe(false);
      expect(await actor.loadedName()).toBe("After");
      expect((await actor.get(userCtx(ownerId, "req-owner"))).name).toBe(
        "After",
      );
    });
  });

  it("fails the turn rather than the method when the rebuild fails too", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: ownerId,
        privacy: "PRIVATE",
        name: "Before",
      });
      const actor = await activate(createActor(FlakyCellarActor, cellarId, db));

      actor.failLoads = true;
      await expect(
        actor.rename(userCtx(ownerId, "req-owner"), "After"),
      ).rejects.toThrow();

      // Still down: the pre-hook throws, so no method body runs and the stale
      // copy is never reached. The flag survives for the turn after that.
      await expect(actor.onActorMethodPre()).rejects.toThrow(
        /timeout exceeded when trying to connect/,
      );
      expect(actor.unusable).toBe(true);

      actor.failLoads = false;
      await actor.onActorMethodPre();
      expect(actor.unusable).toBe(false);
      expect(await actor.loadedName()).toBe("After");
    });
  });

  it("costs a healthy turn nothing: the pre-hook does not re-read", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: ownerId,
        privacy: "PRIVATE",
      });
      const actor = await activate(createActor(FlakyCellarActor, cellarId, db));
      expect(actor.loads).toBe(1);

      await actor.onActorMethodPre();
      await actor.onActorMethodPre();
      expect(actor.loads).toBe(1);
    });
  });

  it("refuses a write transaction to a read-only category (§1.1)", async () => {
    await withTestDb(async (db) => {
      const actor = createActor(DemoCellarsCollectionActor, "viewer-1", db);
      await expect(actor.writeAnyway()).rejects.toThrow(
        /is a collection actor and may not write/,
      );
    });
  });
});
