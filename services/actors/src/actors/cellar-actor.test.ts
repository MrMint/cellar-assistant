/**
 * `CellarActor` against a real Postgres (B1).
 *
 * Three things this file is built to prove, because they are B1's acceptance
 * criteria (§6 B1):
 *
 *   1. the four-branch visibility rule holds for `get`, `items` **and**
 *      `checkIns`, from all three viewpoints §1.6 requires — owner, friend,
 *      stranger — at every privacy;
 *   2. (moved) `bulkCheckIn`'s non-friend refusal is `CheckInActor.log`'s now
 *      (`check-in-actor.test.ts`), since X02 made it the log's writer;
 *   3. `update` with a changed owner set is **one** transaction: a co-owner id
 *      the foreign key rejects rolls the rename back with it.
 *
 * (3) is the one that needs a real database to mean anything, which is why the
 * harness runs against the transformed schema inside a rolled-back transaction
 * rather than against a stub (`src/lib/testing.ts`).
 */
import { randomUUID } from "node:crypto";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  type ItemRef,
  NotFoundError,
  type PermissionType,
  pageArgs,
  STARTER_CELLAR_NAME,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { cellars, checkIns } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { idempotencyKey } from "../lib/delivery.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import { starterCellarId } from "../lib/starter-cellar.ts";
import {
  activate,
  claimingDelivery,
  closeTestDb,
  deliveryCtx,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { toVectorLiteral } from "../lib/vectors.ts";
import { CellarActor } from "./cellar-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/**
 * `createActor` only forwards three constructor arguments, so the embedding
 * seam — `CellarActor`'s fourth — is supplied here, the same way
 * `file-actor.test.ts` supplies the files binding.
 */
const newCellarActor = (
  id: string,
  db: DbOrTx,
  embed: EmbedQuery = async () => {
    throw new Error("no embedder in this test");
  },
): CellarActor => new CellarActor(daprClient(), new ActorId(id), db, embed);

const page = pageArgs({ first: 50 });

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const seedCellar = async (
  db: DbOrTx,
  options: {
    createdById: string;
    privacy?: PermissionType;
    name?: string;
    coOwnerIds?: readonly string[];
  },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.cellars (id, name, created_by_id, privacy)
    values (${id}::uuid, ${options.name ?? "Cellar"}, ${options.createdById}::uuid,
            ${options.privacy ?? "PRIVATE"}::permission_type)
  `);
  for (const userId of options.coOwnerIds ?? []) {
    await db.execute(sql`
      insert into public.cellar_owners (cellar_id, user_id)
      values (${id}::uuid, ${userId}::uuid)
    `);
  }
  return id;
};

/** §1.7 writes both directions; one row is enough, `isFriend` matches either. */
const seedFriendship = async (
  db: DbOrTx,
  userId: string,
  friendId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${userId}::uuid, ${friendId}::uuid)
    on conflict do nothing
  `);
};

/**
 * A `wines` row, which is the cheapest real `ItemRef`. `wines` needs an
 * `item_onboardings` parent and a `wine_style` reference value, so both are
 * seeded here; `RED` is idempotent against an already-seeded database.
 */
const seedWine = async (
  db: DbOrTx,
  createdById: string,
  name = "Test Wine",
): Promise<ItemRef> => {
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
  return { type: "WINE", id };
};

/** A `beers` row, for the per-type counts and the type filter (UI parity G1/G2). */
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

/** A 768-dimension halfvec for `item_vectors`, pointing at one axis. */
const seedItemVector = async (
  db: DbOrTx,
  wineId: string,
  axis: number,
): Promise<void> => {
  const vector = Array.from({ length: 768 }, (_, i) => (i === axis ? 1 : 0));
  await db.execute(sql`
    insert into public.item_vectors (wine_id, vector)
    values (${wineId}::uuid, ${toVectorLiteral(vector)}::halfvec)
  `);
};

const unitVector = (axis: number): number[] =>
  Array.from({ length: 768 }, (_, i) => (i === axis ? 1 : 0));

/**
 * A log poured from `cellarItemId`, written straight into `check_ins`: since
 * X02 the writer is `CheckInActor` (`check-in-actor.test.ts`), and this file
 * only reads the rows back through the cellar.
 */
const seedCheckIn = async (
  db: DbOrTx,
  options: { userId: string; cellarItemId: string; wineId: string },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.check_ins
      (id, user_id, created_by_id, group_id, cellar_item_id, wine_id)
    values (${id}::uuid, ${options.userId}::uuid, ${options.userId}::uuid,
            ${id}::uuid, ${options.cellarItemId}::uuid, ${options.wineId}::uuid)
  `);
  return id;
};

/**
 * Owner, one friend of the owner, one stranger, and a cellar at `privacy` with
 * one item and one check-in on it. Everything the three-viewer matrix needs.
 */
const seedScenario = async (db: DbOrTx, privacy: PermissionType) => {
  const owner = await seedUser(db);
  const friend = await seedUser(db);
  const stranger = await seedUser(db);
  await seedFriendship(db, owner, friend);

  const cellarId = await seedCellar(db, { createdById: owner, privacy });
  const actor = await activate(newCellarActor(cellarId, db));
  const wine = await seedWine(db, owner);
  const item = await actor.addItem(userCtx(owner, "seed-add"), { item: wine });
  await seedCheckIn(db, {
    userId: owner,
    cellarItemId: item.id,
    wineId: wine.id,
  });

  return { owner, friend, stranger, cellarId, actor, wine, itemId: item.id };
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("CellarActor (B1)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §8.3", () => {
    expect(CellarActor.category).toBe("entity");
  });

  /* ------------------------------------------------------------------ */
  /* §1.6 — the four-branch rule, three viewers, three methods           */
  /* ------------------------------------------------------------------ */

  describe("four-branch visibility (§1.6): get / items / checkIns", () => {
    /**
     * The whole matrix in one table. `true` means the viewer gets an answer
     * from all three methods; `false` means all three say `NotFound`.
     */
    const matrix = [
      { privacy: "PUBLIC", owner: true, friend: true, stranger: true },
      { privacy: "FRIENDS", owner: true, friend: true, stranger: false },
      { privacy: "PRIVATE", owner: true, friend: false, stranger: false },
    ] as const;

    for (const row of matrix) {
      it(`${row.privacy}: owner=${row.owner} friend=${row.friend} stranger=${row.stranger}`, async () => {
        await withTestDb(async (db) => {
          const scenario = await seedScenario(db, row.privacy);
          const viewers = [
            ["owner", scenario.owner, row.owner],
            ["friend", scenario.friend, row.friend],
            ["stranger", scenario.stranger, row.stranger],
          ] as const;

          for (const [label, viewerId, visible] of viewers) {
            const ctx = userCtx(viewerId, `r-${label}`);
            if (visible) {
              expect((await scenario.actor.get(ctx)).id, label).toBe(
                scenario.cellarId,
              );
              expect(
                (await scenario.actor.items(ctx, { page })).entries,
                label,
              ).toHaveLength(1);
              expect(
                (await scenario.actor.checkIns(ctx, page)).entries,
                label,
              ).toHaveLength(1);
            } else {
              await expect(scenario.actor.get(ctx)).rejects.toBeInstanceOf(
                NotFoundError,
              );
              await expect(
                scenario.actor.items(ctx, { page }),
              ).rejects.toBeInstanceOf(NotFoundError);
              await expect(
                scenario.actor.checkIns(ctx, page),
              ).rejects.toBeInstanceOf(NotFoundError);
            }
          }
        });
      });
    }

    it("a co-owner sees a PRIVATE cellar, and its check-ins, without being a friend", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const coOwner = await seedUser(db);
        await scenario.actor.update(userCtx(scenario.owner, "r"), {
          coOwnerIds: [coOwner],
        });

        const ctx = userCtx(coOwner, "r2");
        expect((await scenario.actor.get(ctx)).coOwnerIds).toEqual([coOwner]);
        // The consequence of gating `checkIns` on the cellar rather than on
        // friendship: co-owners see each other's history. The Hasura rule
        // this replaces could not express that.
        expect((await scenario.actor.checkIns(ctx, page)).entries).toHaveLength(
          1,
        );
      });
    });

    it("an anonymous viewer sees a PUBLIC cellar and nothing else", async () => {
      await withTestDb(async (db) => {
        const publicCellar = await seedScenario(db, "PUBLIC");
        const privateCellar = await seedScenario(db, "PRIVATE");
        const ctx = anonymousCtx("r");
        expect((await publicCellar.actor.get(ctx)).id).toBe(
          publicCellar.cellarId,
        );
        await expect(privateCellar.actor.get(ctx)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    it("system and admin bypass the rule (§1.6)", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const admin = await seedUser(db);
        expect((await scenario.actor.get(systemCtx("r"))).id).toBe(
          scenario.cellarId,
        );
        expect((await scenario.actor.get(adminCtx(admin, "r"))).id).toBe(
          scenario.cellarId,
        );
      });
    });

    it("a friendship in either direction counts (§1.7 writes both rows)", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        // The *friend's* row, not the owner's — the half §1.7 delivers second.
        await seedFriendship(db, friend, owner);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          privacy: "FRIENDS",
        });
        const actor = await activate(newCellarActor(cellarId, db));
        expect((await actor.get(userCtx(friend, "r"))).id).toBe(cellarId);
      });
    });

    it("a cellar that does not exist is NotFound, like one you may not see", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newCellarActor(randomUUID(), db));
        await expect(
          actor.get(userCtx(await seedUser(db), "r")),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* create / update / delete                                            */
  /* ------------------------------------------------------------------ */

  describe("create", () => {
    it("writes the cellar and its co-owners in one call", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const coOwner = await seedUser(db);
        const cellarId = randomUUID();
        const actor = await activate(newCellarActor(cellarId, db));

        const created = await actor.create(userCtx(owner, "r"), {
          name: "  Reds  ",
          privacy: "FRIENDS",
          // The creator is filtered out of the co-owner set.
          coOwnerIds: [coOwner, owner],
        });

        expect(created).toMatchObject({
          id: cellarId,
          name: "Reds",
          privacy: "FRIENDS",
          createdById: owner,
          coOwnerIds: [coOwner],
          itemCount: 0,
        });
      });
    });

    it("refuses an anonymous creator, a blank name, and a second create", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const actor = await activate(newCellarActor(randomUUID(), db));
        await expect(
          actor.create(anonymousCtx("r"), { name: "x" }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          actor.create(userCtx(owner, "r"), { name: "   " }),
        ).rejects.toBeInstanceOf(ValidationError);

        await actor.create(userCtx(owner, "r"), { name: "Reds" });
        await expect(
          actor.create(userCtx(owner, "r2"), { name: "Reds" }),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });
  });

  describe("update", () => {
    it("lets a co-owner rename, but only the creator change the owner set", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const coOwner = await seedUser(db);
        const outsider = await seedUser(db);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          coOwnerIds: [coOwner],
        });
        const actor = await activate(newCellarActor(cellarId, db));

        expect(
          (await actor.update(userCtx(coOwner, "r"), { name: "Renamed" })).name,
        ).toBe("Renamed");
        await expect(
          actor.update(userCtx(coOwner, "r2"), { coOwnerIds: [outsider] }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        // A stranger cannot even learn the cellar is there.
        await expect(
          actor.update(userCtx(outsider, "r3"), { name: "Nope" }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("diffs the owner set rather than deleting and re-inserting it", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const keep = await seedUser(db);
        const drop = await seedUser(db);
        const add = await seedUser(db);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          coOwnerIds: [keep, drop],
        });
        const actor = await activate(newCellarActor(cellarId, db));

        const updated = await actor.update(userCtx(owner, "r"), {
          coOwnerIds: [keep, add],
        });
        expect([...updated.coOwnerIds].sort()).toEqual([keep, add].sort());

        // `keep`'s row was never touched, so its created_at is the seeded one.
        const rows = await db.execute<{ user_id: string }>(sql`
          select user_id from public.cellar_owners
          where cellar_id = ${cellarId}::uuid order by created_at
        `);
        expect(rows.rows.map((r) => r.user_id)).toEqual([keep, add]);

        expect(
          (await actor.update(userCtx(owner, "r2"), { coOwnerIds: [] }))
            .coOwnerIds,
        ).toEqual([]);
      });
    });

    /**
     * **B1 acceptance**: one transaction. The rename is issued first and the
     * co-owner insert second, so a co-owner id no `user` row answers to
     * fails the foreign key *after* the rename has run. If the two were
     * separate transactions the cellar would come back renamed.
     */
    it("rolls the rename back when the owner insert fails midway", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          name: "Original",
          privacy: "PRIVATE",
        });
        const actor = await activate(newCellarActor(cellarId, db));
        const ghost = randomUUID();

        // Drizzle wraps the driver error; the foreign-key violation is the
        // `cause`, and 23503 is Postgres's `foreign_key_violation`.
        const failure = await actor
          .update(userCtx(owner, "r"), {
            name: "Renamed",
            privacy: "PUBLIC",
            coOwnerIds: [ghost],
          })
          .then(
            () => null,
            (error: unknown) => error as Error & { cause?: { code?: string } },
          );
        expect(failure?.message).toMatch(/insert into "cellar_owners"/);
        expect(failure?.cause?.code).toBe("23503");

        const [row] = await db
          .select({ name: cellars.name, privacy: cellars.privacy })
          .from(cellars)
          .where(eq(cellars.id, cellarId));
        expect(row).toEqual({ name: "Original", privacy: "PRIVATE" });

        const owners = await db.execute<{ count: string }>(sql`
          select count(*)::text as count from public.cellar_owners
          where cellar_id = ${cellarId}::uuid
        `);
        expect(owners.rows[0]?.count).toBe("0");

        // The activation is still usable, and still says the old name.
        expect((await actor.get(userCtx(owner, "r2"))).name).toBe("Original");

        // …and the assertion above is not vacuous: the identical call with a
        // co-owner the foreign key accepts *does* rename the cellar, so the
        // rename statement is issued, and issued before the insert that fails.
        const real = await seedUser(db);
        const applied = await actor.update(userCtx(owner, "r3"), {
          name: "Renamed",
          privacy: "PUBLIC",
          coOwnerIds: [real],
        });
        expect(applied).toMatchObject({
          name: "Renamed",
          privacy: "PUBLIC",
          coOwnerIds: [real],
        });
      });
    });

    it("is a no-op when nothing was passed", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          name: "Same",
        });
        const actor = await activate(newCellarActor(cellarId, db));
        const before = await actor.get(userCtx(owner, "r"));
        expect(await actor.update(userCtx(owner, "r2"), {})).toEqual(before);
      });
    });

    /**
     * Review W4 #3. `coOwnerIds[]` passed a case-insensitive uuid check and
     * was then compared with `===` — against the creator's id (so an
     * upper-cased creator survived the "the creator is not a co-owner"
     * filter and was inserted as a co-owner of their own cellar), and
     * against the cached owners (so an upper-cased existing co-owner read as
     * "added" and hit `cellar_owners`' primary key as a raw 23505).
     */
    it("compares co-owner ids in their canonical spelling", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const coOwner = await seedUser(db);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          coOwnerIds: [coOwner],
        });
        const actor = await activate(newCellarActor(cellarId, db));

        const updated = await actor.update(userCtx(owner, "r"), {
          coOwnerIds: [coOwner.toUpperCase(), owner.toUpperCase()],
        });
        expect(updated.coOwnerIds).toEqual([coOwner]);
        const rows = await db.execute<{ user_id: string }>(sql`
          select user_id from public.cellar_owners
          where cellar_id = ${cellarId}::uuid
        `);
        expect(rows.rows.map((r) => r.user_id)).toEqual([coOwner]);
      });
    });
  });

  describe("delete", () => {
    it("is the creator's alone, and refuses a cellar that still holds items", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const coOwner = await seedUser(db);
        await scenario.actor.update(userCtx(scenario.owner, "r"), {
          coOwnerIds: [coOwner],
        });

        await expect(
          scenario.actor.delete(userCtx(coOwner, "r2")),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          scenario.actor.delete(userCtx(scenario.owner, "r3")),
        ).rejects.toBeInstanceOf(ConflictError);

        await scenario.actor.removeItem(
          userCtx(scenario.owner, "r4"),
          scenario.itemId,
        );
        expect(
          await scenario.actor.delete(userCtx(scenario.owner, "r5")),
        ).toEqual({ id: scenario.cellarId });
        await expect(
          scenario.actor.get(userCtx(scenario.owner, "r6")),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    /* ---------------------------------------------------------------- *
     * E5b — the refusal must not say whether the cellar is there.
     *
     * `delete` reached `#requireCreator` straight off `requireAggregate()`,
     * so a stranger got `ForbiddenError("only the cellar's creator may delete
     * a cellar")` for a cellar that exists and `NotFoundError` for an id that
     * names no row. Two answers is an existence oracle: a signed-in caller
     * could sweep ids and learn which are real cellars, PRIVATE included,
     * without being able to see one of them. `get`/`items`/`checkIns` have
     * always refused both the same way; this is the write path catching up.
     *
     * The co-owner case above is the deliberate exception and stays
     * `ForbiddenError`: they can already see the cellar, so its existence is
     * not what is being protected.
     * ---------------------------------------------------------------- */
    it("answers a stranger identically whether or not the cellar exists (E5b)", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const absentId = randomUUID();
        const absent = await activate(newCellarActor(absentId, db));

        const refusal = async (
          call: () => Promise<unknown>,
          id: string,
        ): Promise<string> =>
          await call().then(
            () => "resolved",
            (error: Error) =>
              `${error.name}: ${error.message.replace(id, "<id>")}`,
          );

        const hidden = await refusal(
          () => scenario.actor.delete(userCtx(scenario.stranger, "r1")),
          scenario.cellarId,
        );
        const missing = await refusal(
          () => absent.delete(userCtx(scenario.stranger, "r2")),
          absentId,
        );
        expect(hidden).toBe(missing);
        expect(hidden).toContain("NotFoundError");

        // A FRIENDS cellar is invisible to a stranger for the same reason, and
        // visible to the friend — who is then told the honest thing.
        const friendsCellar = await seedScenario(db, "FRIENDS");
        await expect(
          friendsCellar.actor.delete(userCtx(friendsCellar.stranger, "r3")),
        ).rejects.toBeInstanceOf(NotFoundError);
        await expect(
          friendsCellar.actor.delete(userCtx(friendsCellar.friend, "r4")),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Items                                                               */
  /* ------------------------------------------------------------------ */

  describe("items", () => {
    it("hides the six-column polymorphic FK behind an ItemRef", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PUBLIC");
        const [entry] = (
          await scenario.actor.items(userCtx(scenario.owner, "r"), { page })
        ).entries;
        expect(entry?.node.item).toEqual(scenario.wine);
        expect(entry?.node.percentageRemaining).toBe(100);
        expect(entry?.node.distance).toBeNull();
      });
    });

    it("only an owner may add, change or remove an item", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PUBLIC");
        const outsider = await seedUser(db);
        const ctx = userCtx(outsider, "r");
        const wine = await seedWine(db, outsider);
        await expect(
          scenario.actor.addItem(ctx, { item: wine }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          scenario.actor.removeItem(ctx, scenario.itemId),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          scenario.actor.setItemPercentage(ctx, scenario.itemId, 50),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });

    it("open, empty and percentage are idempotent and validated", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const ctx = userCtx(scenario.owner, "r");

        const opened = await scenario.actor.openItem(ctx, scenario.itemId);
        expect(opened.openAt).not.toBeNull();
        expect(
          (await scenario.actor.openItem(ctx, scenario.itemId)).openAt,
        ).toBe(opened.openAt);

        const emptied = await scenario.actor.emptyItem(ctx, scenario.itemId);
        expect(emptied.emptyAt).not.toBeNull();
        expect(emptied.percentageRemaining).toBe(0);
        expect(
          (await scenario.actor.emptyItem(ctx, scenario.itemId)).emptyAt,
        ).toBe(emptied.emptyAt);

        await expect(
          scenario.actor.setItemPercentage(ctx, scenario.itemId, 101),
        ).rejects.toBeInstanceOf(ValidationError);
        expect(
          (await scenario.actor.setItemPercentage(ctx, scenario.itemId, 40))
            .percentageRemaining,
        ).toBe(40);
      });
    });

    it("Undo after finishing: updateItem(emptyAt: null) puts the bottle back (N13a)", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const ctx = userCtx(scenario.owner, "r");

        // A never-opened bottle: emptyItem opens it too, so Undo clears both.
        const emptied = await scenario.actor.emptyItem(ctx, scenario.itemId);
        expect(emptied.openAt).not.toBeNull();
        const undone = await scenario.actor.updateItem(ctx, scenario.itemId, {
          emptyAt: null,
          openAt: null,
          percentageRemaining: 100,
        });
        expect(undone.emptyAt).toBeNull();
        expect(undone.openAt).toBeNull();
        expect(undone.percentageRemaining).toBe(100);

        // An opened bottle keeps its date: Undo sends no openAt.
        const opened = await scenario.actor.openItem(ctx, scenario.itemId);
        await scenario.actor.setItemPercentage(ctx, scenario.itemId, 30);
        await scenario.actor.emptyItem(ctx, scenario.itemId);
        const back = await scenario.actor.updateItem(ctx, scenario.itemId, {
          emptyAt: null,
          percentageRemaining: 30,
        });
        expect(back.emptyAt).toBeNull();
        expect(back.openAt).toBe(opened.openAt);
        expect(back.percentageRemaining).toBe(30);
      });
    });

    it("removeItem keeps the bottle's logs, detached (X02, D5)", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const before = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.cellarItemId, scenario.itemId));
        expect(before).toHaveLength(1);

        await scenario.actor.removeItem(
          userCtx(scenario.owner, "r"),
          scenario.itemId,
        );
        const [kept] = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.id, before[0]?.id ?? ""));
        // Still there, still about the same wine — only the bottle is gone.
        expect(kept?.cellarItemId).toBeNull();
        expect(kept?.wineId).toBe(scenario.wine.id);
        expect(kept?.userId).toBe(scenario.owner);
        expect(
          (await scenario.actor.get(userCtx(scenario.owner, "r2"))).itemCount,
        ).toBe(0);
        // …and the cellar's own history no longer lists it.
        expect(
          (await scenario.actor.checkIns(userCtx(scenario.owner, "r3"), page))
            .totalCount,
        ).toBe(0);
      });
    });

    it("rejects an unknown cellar item as NotFound", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        await expect(
          scenario.actor.openItem(userCtx(scenario.owner, "r"), randomUUID()),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("sorts the cached list without re-querying", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const ctx = userCtx(owner, "r");

        const first = await actor.addItem(ctx, {
          item: await seedWine(db, owner, "First"),
          percentageRemaining: 10,
        });
        const second = await actor.addItem(ctx, {
          item: await seedWine(db, owner, "Second"),
          percentageRemaining: 90,
        });
        await actor.openItem(ctx, second.id);

        const ids = async (
          sort: "ADDED_DESC" | "ADDED_ASC" | "PERCENTAGE_ASC" | "OPEN_FIRST",
        ) =>
          (await actor.items(ctx, { page, sort })).entries.map(
            (e) => e.node.id,
          );

        // `created_at` defaults to `now()`, which inside the harness's single
        // transaction is the *same* instant for every row — so ADDED_* is
        // asserted as each other's reverse rather than against insertion
        // order, which the fixture cannot control here.
        expect(await ids("ADDED_ASC")).toEqual(
          [...(await ids("ADDED_DESC"))].reverse(),
        );
        expect(await ids("PERCENTAGE_ASC")).toEqual([first.id, second.id]);
        expect(await ids("OPEN_FIRST")).toEqual([second.id, first.id]);
      });
    });

    it("orders by cosine distance for a semanticQuery, un-embedded items last", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
        const actor = await activate(newCellarActor(cellarId, db, embed));
        const ctx = userCtx(owner, "r");

        const near = await seedWine(db, owner, "Near");
        const far = await seedWine(db, owner, "Far");
        const unembedded = await seedWine(db, owner, "Unembedded");
        await seedItemVector(db, near.id, 0);
        await seedItemVector(db, far.id, 1);

        const nearItem = await actor.addItem(ctx, { item: near });
        const farItem = await actor.addItem(ctx, { item: far });
        const unembeddedItem = await actor.addItem(ctx, { item: unembedded });

        const result = await actor.items(ctx, {
          page,
          semanticQuery: "  Pinot Noir  ",
        });
        expect(result.entries.map((e) => e.node.id)).toEqual([
          nearItem.id,
          farItem.id,
          unembeddedItem.id,
        ]);
        expect(result.entries[0]?.node.distance).toBeCloseTo(0, 5);
        expect(result.entries[1]?.node.distance).toBeCloseTo(1, 5);
        expect(result.entries[2]?.node.distance).toBeNull();
        expect(embed).toHaveBeenCalledWith(ctx, "Pinot Noir");
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* §8.4 idempotency                                                    */
  /* ------------------------------------------------------------------ */

  describe("addItem: a source place under review (X27)", () => {
    it("somebody else's pending place is refused as an unknown one; the owner's own is accepted", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const other = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const wine = await seedWine(db, owner);
        const placeIdFor = async (createdBy: string) => {
          const id = randomUUID();
          await db.execute(sql`
            insert into public.places
              (id, name, categories, location, source, review_status, created_by)
            values (${id}::uuid, 'Pending shop', ARRAY['wine_shop']::text[],
              ST_SetSRID(ST_MakePoint(-122.41, 37.77), 4326)::geography,
              'user', 'pending', ${createdBy}::uuid)
          `);
          return id;
        };
        const theirs = await placeIdFor(other);
        const mine = await placeIdFor(owner);
        const ctx = userCtx(owner, "r");

        const hidden = await actor
          .addItem(ctx, { item: wine, sourcePlaceId: theirs })
          .catch((error: unknown) => error);
        const absentId = randomUUID();
        const absent = await actor
          .addItem(ctx, { item: wine, sourcePlaceId: absentId })
          .catch((error: unknown) => error);
        expect(hidden).toBeInstanceOf(NotFoundError);
        expect(String((hidden as Error).message).replace(theirs, "<id>")).toBe(
          String((absent as Error).message).replace(absentId, "<id>"),
        );

        const added = await actor.addItem(ctx, {
          item: wine,
          sourcePlaceId: mine,
        });
        expect(added.sourcePlaceId).toBe(mine);
      });
    });
  });

  describe("addItem idempotency (§8.4)", () => {
    it("a re-delivered outbox call creates exactly one cellar item", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const wine = await seedWine(db, owner);

        // What `OutboxActor` passes: a system ctx carrying `delivery`. A
        // redelivery of the same row is attempt 2 of the same `outboxId`.
        const rowId = randomUUID();
        const input = { item: wine, createdBy: owner };

        const once = await actor.addItem(deliveryCtx(rowId), input);
        const twice = await actor.addItem(deliveryCtx(rowId, 1), input);

        // Keyed on the delivery, and never the row id itself (lib/delivery.ts).
        expect(once.id).toBe(
          idempotencyKey(deliveryCtx(rowId), "CellarActor.addItem:cellar-item"),
        );
        expect(once.id).not.toBe(rowId);
        expect(twice).toEqual(once);
        expect((await actor.get(systemCtx("r"))).itemCount).toBe(1);
      });
    });

    /**
     * A request's ctx carries whatever `x-request-id` the edge let through
     * (the Next proxy forwards the browser's), so a signed-in user sending
     * `outbox:<uuid>` used to be treated as a redelivery: it chose the new
     * cellar item's primary key, and a repeat collapsed into the first. The
     * same claim made with the field that replaced the prefix is refused too.
     */
    it("a user claiming to be a delivery gets no redelivery treatment", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const wine = await seedWine(db, owner);

        const spoofedRowId = randomUUID();
        const request = claimingDelivery(userCtx(owner, "r"), spoofedRowId);
        const once = await actor.addItem(request, { item: wine });
        const twice = await actor.addItem(request, { item: wine });

        expect(once.id).not.toBe(spoofedRowId);
        expect(once.id).not.toBe(
          idempotencyKey(
            deliveryCtx(spoofedRowId),
            "CellarActor.addItem:cellar-item",
          ),
        );
        expect(twice.id).not.toBe(once.id);
        expect((await actor.get(systemCtx("r"))).itemCount).toBe(2);
      });
    });

    it("an explicit cellarItemId wins over the outbox row id", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const wine = await seedWine(db, owner);
        const chosen = randomUUID();

        const item = await actor.addItem(deliveryCtx(randomUUID()), {
          item: wine,
          cellarItemId: chosen,
          createdBy: owner,
        });
        expect(item.id).toBe(chosen);
      });
    });

    it("a system call with no createdBy is a ValidationError, not a null row", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const wine = await seedWine(db, owner);
        await expect(
          actor.addItem(systemCtx("r"), { item: wine }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Check-ins: read fresh, never cached (X02)                           */
  /* ------------------------------------------------------------------ */

  describe("checkIns reads what another actor wrote", () => {
    it("sees a log written after the cellar activated", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const ctx = userCtx(scenario.owner, "r");
        expect((await scenario.actor.checkIns(ctx, page)).totalCount).toBe(1);
        // `CheckInActor` writes these now; a cache loaded on activate would
        // still say 1.
        await seedCheckIn(db, {
          userId: scenario.owner,
          cellarItemId: scenario.itemId,
          wineId: scenario.wine.id,
        });
        expect((await scenario.actor.checkIns(ctx, page)).totalCount).toBe(2);
      });
    });

    it("lists only logs still poured from its bottles", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const ctx = userCtx(scenario.owner, "r");
        // A bottle-less log of the same wine is the drinker's, not the cellar's.
        const id = randomUUID();
        await db.execute(sql`
          insert into public.check_ins (id, user_id, created_by_id, group_id, wine_id)
          values (${id}::uuid, ${scenario.owner}::uuid, ${scenario.owner}::uuid,
                  ${id}::uuid, ${scenario.wine.id}::uuid)
        `);
        const listed = await scenario.actor.checkIns(ctx, page);
        expect(listed.totalCount).toBe(1);
        expect(listed.entries.map((e) => e.node.id)).not.toContain(id);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* UI parity wave A: BUG 1, G1, G2, G3                                 */
  /* ------------------------------------------------------------------ */

  describe("update: the co-owner save bug (UI parity BUG 1)", () => {
    /**
     * The edit form sends the whole owner set on every save. A co-owner who
     * only renamed the cellar therefore sent `coOwnerIds` too, and the actor
     * read its mere presence as "change the owners" — creator only — so no
     * co-owner could ever save the form.
     */
    it("lets a co-owner save with the owner set unchanged, however it is spelled", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const coOwner = await seedUser(db);
        const other = await seedUser(db);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          coOwnerIds: [coOwner, other],
        });
        const actor = await activate(newCellarActor(cellarId, db));

        const saved = await actor.update(userCtx(coOwner, "r"), {
          name: "Renamed by a co-owner",
          privacy: "FRIENDS",
          // Reordered, upper-cased, duplicated, and with the creator in it:
          // all four normalise to the set the cellar already has.
          coOwnerIds: [other.toUpperCase(), coOwner, coOwner, owner],
        });
        expect(saved.name).toBe("Renamed by a co-owner");
        expect(saved.privacy).toBe("FRIENDS");
        expect([...saved.coOwnerIds].sort()).toEqual([coOwner, other].sort());

        // The unchanged set alone is a no-op, not a refusal.
        const before = await actor.get(userCtx(coOwner, "r2"));
        expect(
          await actor.update(userCtx(coOwner, "r3"), {
            coOwnerIds: [coOwner, other],
          }),
        ).toEqual(before);
      });
    });

    it("still refuses a co-owner any real change to the set, and writes nothing", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const coOwner = await seedUser(db);
        const outsider = await seedUser(db);
        const cellarId = await seedCellar(db, {
          createdById: owner,
          name: "Original",
          coOwnerIds: [coOwner],
        });
        const actor = await activate(newCellarActor(cellarId, db));

        for (const coOwnerIds of [[coOwner, outsider], [], [outsider]]) {
          await expect(
            actor.update(userCtx(coOwner, "r"), {
              name: "Sneaky",
              coOwnerIds,
            }),
          ).rejects.toBeInstanceOf(ForbiddenError);
        }
        const after = await actor.get(userCtx(owner, "r2"));
        expect(after.name).toBe("Original");
        expect(after.coOwnerIds).toEqual([coOwner]);

        // And the creator may make exactly that change.
        expect(
          [
            ...(
              await actor.update(userCtx(owner, "r3"), {
                coOwnerIds: [coOwner, outsider],
              })
            ).coOwnerIds,
          ].sort(),
        ).toEqual([coOwner, outsider].sort());
      });
    });
  });

  describe("item counts and filters (UI parity G1, G2, G3)", () => {
    /** Two wines (one emptied) and one beer, in a cellar of `privacy`. */
    const seedMixed = async (
      db: DbOrTx,
      privacy: PermissionType = "PRIVATE",
    ) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner, privacy });
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "seed");
      const zinfandel = await actor.addItem(ctx, {
        item: await seedWine(db, owner, "zinfandel"),
      });
      const albarino = await actor.addItem(ctx, {
        item: await seedWine(db, owner, "Albariño"),
      });
      const beer = await actor.addItem(ctx, {
        item: { type: "BEER", id: await seedBeer(db, owner, "Märzen") },
      });
      await actor.emptyItem(ctx, albarino.id);
      return { owner, cellarId, actor, ctx, zinfandel, albarino, beer };
    };

    it("G1: counts non-empty bottles per type; itemCount still counts all", async () => {
      await withTestDb(async (db) => {
        const { actor, ctx } = await seedMixed(db);
        const cellar = await actor.get(ctx);
        expect(cellar.itemCount).toBe(3);
        expect(cellar.itemCounts).toEqual({
          total: 2,
          byType: { WINE: 1, BEER: 1, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
        });
      });
    });

    it("G1: a viewer who may not see the cellar gets no counts at all", async () => {
      await withTestDb(async (db) => {
        const { actor } = await seedMixed(db, "PRIVATE");
        const stranger = await seedUser(db);
        await expect(actor.get(userCtx(stranger, "r"))).rejects.toBeInstanceOf(
          NotFoundError,
        );
        await expect(
          actor.items(userCtx(stranger, "r2"), {
            page,
            status: "ALL",
            types: ["WINE"],
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("G2: hides empty bottles by default, and filters before paging", async () => {
      await withTestDb(async (db) => {
        const { actor, ctx, zinfandel, albarino, beer } = await seedMixed(db);
        const ids = async (
          args: Partial<Parameters<typeof actor.items>[1]>,
        ) => {
          const result = await actor.items(ctx, { page, ...args });
          return {
            ids: result.entries.map((entry) => entry.node.id).sort(),
            total: result.totalCount,
          };
        };

        expect(await ids({})).toEqual({
          ids: [zinfandel.id, beer.id].sort(),
          total: 2,
        });
        expect(await ids({ status: "EMPTY" })).toEqual({
          ids: [albarino.id],
          total: 1,
        });
        expect((await ids({ status: "ALL" })).total).toBe(3);
        expect(await ids({ types: ["WINE"] })).toEqual({
          ids: [zinfandel.id],
          total: 1,
        });
        expect(await ids({ types: ["WINE"], status: "ALL" })).toEqual({
          ids: [zinfandel.id, albarino.id].sort(),
          total: 2,
        });
        // Empty means all six, not none.
        expect((await ids({ types: [] })).total).toBe(2);

        // `totalCount` and the cursor follow the filter: one per page, and
        // the second page is the last.
        const first = await actor.items(ctx, {
          page: pageArgs({ first: 1 }),
          status: "ALL",
          types: ["WINE"],
        });
        expect(first.totalCount).toBe(2);
        expect(first.hasNextPage).toBe(true);
        const second = await actor.items(ctx, {
          page: pageArgs({ first: 1, after: first.entries[0]?.cursor }),
          status: "ALL",
          types: ["WINE"],
        });
        expect(second.hasNextPage).toBe(false);
        expect(second.entries[0]?.node.item.type).toBe("WINE");

        await expect(
          actor.items(ctx, {
            page,
            types: ["MEAD" as unknown as "WINE"],
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });

    it("G3: NAME_ASC orders by item name, case-insensitively", async () => {
      await withTestDb(async (db) => {
        const { actor, ctx, zinfandel, albarino, beer } = await seedMixed(db);
        const result = await actor.items(ctx, {
          page,
          sort: "NAME_ASC",
          status: "ALL",
        });
        // Albariño < Märzen < zinfandel, whatever the case or insert order.
        expect(result.entries.map((entry) => entry.node.id)).toEqual([
          albarino.id,
          beer.id,
          zinfandel.id,
        ]);
      });
    });

    it("G3: a semanticQuery breaks distance ties by name", async () => {
      await withTestDb(async (db) => {
        const { owner, cellarId, zinfandel, albarino, beer } =
          await seedMixed(db);
        const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
        const actor = await activate(newCellarActor(cellarId, db, embed));
        // No item is embedded, so every distance ties at "infinite" and the
        // order is by name alone.
        const result = await actor.items(userCtx(owner, "r"), {
          page,
          semanticQuery: "anything",
          status: "ALL",
        });
        expect(result.entries.map((entry) => entry.node.id)).toEqual([
          albarino.id,
          beer.id,
          zinfandel.id,
        ]);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Paging (§1.5)                                                       */
  /* ------------------------------------------------------------------ */

  describe("bottle lookups and per-bottle check-ins (UI parity G10, G14)", () => {
    it("G10: item(id) is the bottle by cellar_items.id, emptied ones included", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const other = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const ctx = userCtx(owner, "r");
        const bottle = await actor.addItem(ctx, {
          item: await seedWine(db, owner),
        });
        await actor.emptyItem(ctx, bottle.id);

        const found = await actor.item(ctx, bottle.id);
        expect(found.id).toBe(bottle.id);
        expect(found.emptyAt).not.toBeNull();

        // Another cellar's bottle is not this cellar's, whoever owns both.
        const elsewhere = await (
          await activate(newCellarActor(other, db))
        ).addItem(ctx, { item: await seedWine(db, owner) });
        await expect(actor.item(ctx, elsewhere.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    it("G10: bottleFor answers only when there is exactly one bottle to send to", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const ctx = userCtx(owner, "r");
        const single = await seedWine(db, owner, "single");
        const twice = await seedWine(db, owner, "twice");
        const finished = await seedWine(db, owner, "finished");
        const mixed = await seedWine(db, owner, "mixed");
        const absent = await seedWine(db, owner, "absent");

        const one = await actor.addItem(ctx, { item: single });
        await actor.addItem(ctx, { item: twice });
        await actor.addItem(ctx, { item: twice });
        const done = await actor.addItem(ctx, { item: finished });
        await actor.emptyItem(ctx, done.id);
        const live = await actor.addItem(ctx, { item: mixed });
        const dead = await actor.addItem(ctx, { item: mixed });
        await actor.emptyItem(ctx, dead.id);

        expect((await actor.bottleFor(ctx, single))?.id).toBe(one.id);
        expect(await actor.bottleFor(ctx, twice)).toBeNull();
        // No live bottle, one finished one: that one.
        expect((await actor.bottleFor(ctx, finished))?.id).toBe(done.id);
        // A live bottle beats an emptied one of the same item.
        expect((await actor.bottleFor(ctx, mixed))?.id).toBe(live.id);
        expect(await actor.bottleFor(ctx, absent)).toBeNull();
        // Same id, wrong type: a different item.
        expect(
          await actor.bottleFor(ctx, { type: "BEER", id: single.id }),
        ).toBeNull();
      });
    });

    it("X09: bottlesOf lists every bottle of each item, open then sealed then finished", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const stranger = await seedUser(db);
        const cellarId = await seedCellar(db, { createdById: owner });
        const actor = await activate(newCellarActor(cellarId, db));
        const ctx = userCtx(owner, "r");
        const wine = await seedWine(db, owner, "wine");
        const other = await seedWine(db, owner, "other");

        const sealed = await actor.addItem(ctx, { item: wine });
        const opened = await actor.addItem(ctx, { item: wine });
        await actor.openItem(ctx, opened.id);
        const done = await actor.addItem(ctx, { item: wine });
        await actor.emptyItem(ctx, done.id);
        await actor.addItem(ctx, { item: other });

        const [live, none] = await actor.bottlesOf(ctx, [
          wine,
          { type: "BEER", id: wine.id },
        ]);
        expect(live?.map((b) => b.id)).toEqual([opened.id, sealed.id]);
        expect(none).toEqual([]);

        const [all] = await actor.bottlesOf(ctx, [wine], "ALL");
        expect(all?.map((b) => b.id)).toEqual([opened.id, sealed.id, done.id]);
        const [finished] = await actor.bottlesOf(ctx, [wine], "EMPTY");
        expect(finished?.map((b) => b.id)).toEqual([done.id]);

        // Gated like `item`: a PRIVATE cellar is not the stranger's to read
        // (refused as `get` refuses them, whichever error that is).
        const refusal = await actor
          .bottlesOf(userCtx(stranger, "r"), [wine])
          .then(
            () => null,
            (cause: unknown) => cause,
          );
        expect(
          refusal instanceof ForbiddenError || refusal instanceof NotFoundError,
        ).toBe(true);
      });
    });

    it("G14: checkInsOf is per bottle, aligned, and gated on the cellar", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, actor, itemId } = await seedScenario(
          db,
          "FRIENDS",
        );
        const ctx = userCtx(owner, "r");
        const second = await actor.addItem(ctx, {
          item: await seedWine(db, owner),
        });
        const secondWine = second.item.id;
        const earlier = {
          id: await seedCheckIn(db, {
            userId: owner,
            cellarItemId: second.id,
            wineId: secondWine,
          }),
        };
        const later = {
          id: await seedCheckIn(db, {
            userId: owner,
            cellarItemId: second.id,
            wineId: secondWine,
          }),
        };

        const [first, other, nothing] = await actor.checkInsOf(ctx, [
          itemId,
          second.id,
          randomUUID(),
        ]);
        expect(first?.totalCount).toBe(1);
        expect(other?.totalCount).toBe(2);
        // One transaction, so `now()` ties: the order is `checkIns`' own
        // (created_at desc, id desc), pinned by its tests; here, membership.
        expect(other?.nodes.map((n) => n.id).sort()).toEqual(
          [earlier.id, later.id].sort(),
        );
        expect(other?.nodes.every((n) => n.cellarItemId === second.id)).toBe(
          true,
        );
        expect(nothing).toEqual({ nodes: [], totalCount: 0 });

        // The cellar's rule, not friendship with each drinker.
        expect(
          (await actor.checkInsOf(userCtx(friend, "r"), [itemId]))[0]
            ?.totalCount,
        ).toBe(1);
        await expect(
          actor.checkInsOf(userCtx(stranger, "r"), [itemId]),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });
  });

  it("pages items and check-ins rather than returning them unbounded", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "r");
      for (let index = 0; index < 3; index += 1) {
        const wine = await seedWine(db, owner, `Wine ${index}`);
        const item = await actor.addItem(ctx, { item: wine });
        await seedCheckIn(db, {
          userId: owner,
          cellarItemId: item.id,
          wineId: wine.id,
        });
      }

      const first = await actor.items(ctx, { page: pageArgs({ first: 2 }) });
      expect(first.entries).toHaveLength(2);
      expect(first.hasNextPage).toBe(true);
      expect(first.totalCount).toBe(3);

      const second = await actor.items(ctx, {
        page: pageArgs({ first: 2, after: first.entries[1]?.cursor }),
      });
      expect(second.entries).toHaveLength(1);
      expect(second.hasNextPage).toBe(false);

      expect(
        (await actor.checkIns(ctx, pageArgs({ first: 2 }))).hasNextPage,
      ).toBe(true);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concealment: a stranger's private cellar and no cellar answer alike         */
/* -------------------------------------------------------------------------- */

/**
 * Every method a stranger can reach, on a PRIVATE cellar they cannot see and
 * on an id that names nothing: the same `{ code, message }`, id aside. Reads
 * go through `requireVisible`, writes through `requireAllowed`, and both land
 * on the base class's one spelling of absence.
 */
describe.skipIf(skip)("CellarActor.createStarter (N15)", () => {
  afterAll(closeTestDb);

  it('makes one private "My Cellar" for the owner, however often it is delivered', async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const id = starterCellarId(owner);

      await activate(newCellarActor(id, db)).then((actor) =>
        actor.createStarter(systemCtx("r1"), { ownerId: owner }),
      );
      // A redelivery addresses a fresh activation, which must converge too.
      await activate(newCellarActor(id, db)).then((actor) =>
        actor.createStarter(systemCtx("r2"), { ownerId: owner }),
      );

      const rows = await db
        .select()
        .from(cellars)
        .where(eq(cellars.createdById, owner));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        name: STARTER_CELLAR_NAME,
        privacy: "PRIVATE",
      });

      const actor = await activate(newCellarActor(id, db));
      expect((await actor.get(userCtx(owner, "r3"))).name).toBe("My Cellar");
    });
  });

  it("is refused to every caller but the outbox", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const id = starterCellarId(owner);
      for (const ctx of [userCtx(owner, "r"), adminCtx(owner, "r")]) {
        const actor = await activate(newCellarActor(id, db));
        await expect(
          actor.createStarter(ctx, { ownerId: owner }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      const rows = await db
        .select()
        .from(cellars)
        .where(eq(cellars.createdById, owner));
      expect(rows).toEqual([]);
    });
  });

  it("refuses an id that was not derived from the owner it names", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const actor = await activate(newCellarActor(starterCellarId(other), db));
      await expect(
        actor.createStarter(systemCtx("r"), { ownerId: owner }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});

/**
 * A vector at `cos` to axis 0 (in the 0–1 plane): cosine distance to
 * `unitVector(0)` is `1 - cos`, so a test can place an item exactly.
 */
const vectorAt = (cos: number): number[] =>
  Array.from({ length: 768 }, (_, i) =>
    i === 0 ? cos : i === 1 ? Math.sqrt(1 - cos * cos) : 0,
  );

const seedVectorAt = async (
  db: DbOrTx,
  wineId: string,
  cos: number,
): Promise<void> => {
  await db.execute(sql`
    insert into public.item_vectors (wine_id, vector)
    values (${wineId}::uuid, ${toVectorLiteral(vectorAt(cos))}::halfvec)
  `);
};

describe.skipIf(skip)("CellarActor — the cellar home (X04)", () => {
  afterAll(closeTestDb);

  it("groups identical bottles where the best-placed one sits, and counts bottles", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "r");
      const barolo = await seedWine(db, owner, "Barolo");
      const rioja = await seedWine(db, owner, "Rioja");

      const sealed = await actor.addItem(ctx, { item: barolo });
      await actor.addItem(ctx, { item: rioja });
      const open = await actor.addItem(ctx, { item: barolo });
      await actor.openItem(ctx, open.id);

      const result = await actor.itemGroups(ctx, { page, sort: "OPEN_FIRST" });
      expect(result.totalCount).toBe(2);
      expect(result.bottleCount).toBe(3);
      expect(result.meaning).toBe("NOT_ASKED");
      const [first, second] = result.entries.map((entry) => entry.node);
      // The open Barolo leads its group, and the group sits first.
      expect(first?.lead.id).toBe(open.id);
      expect(first?.bottleIds).toEqual([open.id, sealed.id]);
      expect(first?.count).toBe(2);
      expect(first?.openCount).toBe(1);
      expect(first?.match).toBeNull();
      expect(second?.lead.item.id).toBe(rioja.id);

      const flat = await actor.itemGroups(ctx, { page, group: false });
      expect(flat.totalCount).toBe(3);
    });
  });

  it("search narrows: names first, then near meanings, nothing else", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
      const actor = await activate(newCellarActor(cellarId, db, embed));
      const ctx = userCtx(owner, "r");

      const lagavulin = await seedWine(db, owner, "Lagavulin 16");
      const smoky = await seedWine(db, owner, "Ardbeg Ten");
      const unrelated = await seedWine(db, owner, "Whispering Angel");
      await seedVectorAt(db, lagavulin.id, 0.95);
      await seedVectorAt(db, smoky.id, 0.9);
      await seedVectorAt(db, unrelated.id, 0.1);
      await actor.addItem(ctx, { item: unrelated });
      await actor.addItem(ctx, { item: smoky });
      await actor.addItem(ctx, { item: lagavulin });

      const result = await actor.itemGroups(ctx, {
        page,
        search: " lagavulin ",
      });
      expect(embed).toHaveBeenCalledWith(ctx, "lagavulin");
      expect(result.meaning).toBe("USED");
      expect(
        result.entries.map((entry) => [
          entry.node.lead.item.id,
          entry.node.match,
        ]),
      ).toEqual([
        [lagavulin.id, "NAME"],
        [smoky.id, "MEANING"],
      ]);
      expect(result.bottleCount).toBe(2);
    });
  });

  it("search without a model is names only, and says so", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "r");
      const lagavulin = await seedWine(db, owner, "Lagavulin 16");
      await actor.addItem(ctx, { item: lagavulin });
      await actor.addItem(ctx, { item: await seedWine(db, owner, "Rioja") });

      const result = await actor.itemGroups(ctx, {
        page,
        search: "lagavullin",
      });
      expect(result.meaning).toBe("UNAVAILABLE");
      expect(result.entries.map((entry) => entry.node.lead.item.id)).toEqual([
        lagavulin.id,
      ]);
    });
  });

  it("OPEN, OPENED_DESC and FINISHED_DESC: the shelf and the diary", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "r");
      const add = async (name: string) =>
        actor.addItem(ctx, { item: await seedWine(db, owner, name) });

      const sealed = await add("Sealed");
      const earlier = await add("Opened earlier");
      const later = await add("Opened later");
      const poured = await add("Poured, never opened");
      const done = await add("Done");
      await actor.updateItem(ctx, earlier.id, {
        openAt: "2026-01-01T00:00:00.000Z",
      });
      await actor.updateItem(ctx, later.id, {
        openAt: "2026-03-01T00:00:00.000Z",
      });
      await actor.setItemPercentage(ctx, poured.id, 60);
      await actor.updateItem(ctx, done.id, {
        emptyAt: "2026-02-01T00:00:00.000Z",
      });

      const ids = async (
        args: Omit<Parameters<CellarActor["itemGroups"]>[1], "page">,
      ) =>
        (await actor.itemGroups(ctx, { page, ...args })).entries.map(
          (entry) => entry.node.lead.id,
        );
      expect(await ids({ status: "OPEN", sort: "OPENED_DESC" })).toEqual([
        later.id,
        earlier.id,
        poured.id,
      ]);
      expect((await ids({ status: "ALL", sort: "FINISHED_DESC" }))[0]).toBe(
        done.id,
      );
      expect(await ids({ status: "EMPTY" })).toEqual([done.id]);
      expect(await ids({ status: "ACTIVE" })).not.toContain(done.id);
      expect(await ids({ status: "ACTIVE" })).toContain(sealed.id);
      expect((await actor.get(ctx)).finishedCount).toBe(1);
    });
  });

  it("a search of the diary keeps finish order; ALL never folds a finished bottle into a live one", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      // No embedder: names only, so the order below is the name arm's.
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "r");

      const exact = await actor.addItem(ctx, {
        item: await seedWine(db, owner, "Lagavulin"),
      });
      const longer = await actor.addItem(ctx, {
        item: await seedWine(db, owner, "Lagavulin 16 Year Old"),
      });
      await actor.updateItem(ctx, exact.id, {
        emptyAt: "2026-01-10T00:00:00.000Z",
      });
      await actor.updateItem(ctx, longer.id, {
        emptyAt: "2026-03-10T00:00:00.000Z",
      });
      const diary = async (sort?: "FINISHED_DESC") =>
        (
          await actor.itemGroups(ctx, {
            page,
            status: "EMPTY",
            search: "lagavulin",
            group: false,
            ...(sort === undefined ? {} : { sort }),
          })
        ).entries.map((entry) => entry.node.lead.id);
      // By relevance the exact name leads; the diary reads by date instead.
      expect(await diary()).toEqual([exact.id, longer.id]);
      expect(await diary("FINISHED_DESC")).toEqual([longer.id, exact.id]);

      const barolo = await seedWine(db, owner, "Barolo");
      const here = await actor.addItem(ctx, { item: barolo });
      const gone = await actor.addItem(ctx, { item: barolo });
      await actor.emptyItem(ctx, gone.id);
      const all = await actor.itemGroups(ctx, { page, status: "ALL" });
      const barolos = all.entries
        .map((entry) => entry.node)
        .filter((group) => group.lead.item.id === barolo.id);
      expect(barolos.map((group) => [group.bottleIds, group.count])).toEqual(
        expect.arrayContaining([
          [[here.id], 1],
          [[gone.id], 1],
        ]),
      );
      expect(barolos).toHaveLength(2);
      expect(all.bottleCount).toBe(4);
      // In the cellar, the live bottle alone.
      const active = await actor.itemGroups(ctx, { page });
      expect(
        active.entries.find((entry) => entry.node.lead.item.id === barolo.id)
          ?.node.count,
      ).toBe(1);
    });
  });

  it("the dashboard counts bottles, and logs per month in the viewer's zone", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "r");
      const wine = await seedWine(db, owner, "Barolo");
      const a = await actor.addItem(ctx, { item: wine });
      const b = await actor.addItem(ctx, { item: wine });
      const c = await actor.addItem(ctx, {
        item: await seedWine(db, owner, "Rioja"),
      });
      await actor.setItemPercentage(ctx, a.id, 20);
      await actor.openItem(ctx, b.id);
      await actor.emptyItem(ctx, c.id);
      await seedCheckIn(db, {
        userId: owner,
        cellarItemId: a.id,
        wineId: wine.id,
      });
      await seedCheckIn(db, {
        userId: owner,
        cellarItemId: b.id,
        wineId: wine.id,
      });

      const dashboard = await actor.dashboard(ctx, {
        timeZone: "America/Chicago",
      });
      expect(dashboard).toMatchObject({
        bottleCount: 2,
        openCount: 2,
        almostEmptyCount: 1,
        finishedThisMonth: 1,
        finishedCount: 1,
        addedRecently: 2,
        timeZone: "America/Chicago",
      });
      expect(dashboard.logsByMonth).toHaveLength(12);
      expect(dashboard.logsByMonth.at(-1)).toBe(2);
      expect(dashboard.logsByMonth.slice(0, 11).every((n) => n === 0)).toBe(
        true,
      );
      expect(
        (await actor.dashboard(ctx, { timeZone: "Nowhere/Special" })).timeZone,
      ).toBe("UTC");
    });
  });

  it("myLogsOf summarises only the viewer's own logs", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const coOwner = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: owner,
        coOwnerIds: [coOwner],
      });
      const actor = await activate(newCellarActor(cellarId, db));
      const ctx = userCtx(owner, "r");
      const wine = await seedWine(db, owner, "Barolo");
      const bottle = await actor.addItem(ctx, { item: wine });
      const mine = await seedCheckIn(db, {
        userId: owner,
        cellarItemId: bottle.id,
        wineId: wine.id,
      });
      await db.execute(sql`
        update public.check_ins set score = 4.5, note = '  Tar and roses '
        where id = ${mine}::uuid
      `);
      await seedCheckIn(db, {
        userId: coOwner,
        cellarItemId: bottle.id,
        wineId: wine.id,
      });

      const [summary, unknown] = await actor.myLogsOf(ctx, [
        bottle.id,
        randomUUID(),
      ]);
      expect(summary).toMatchObject({
        count: 1,
        lastScore: 4.5,
        lastNote: "Tar and roses",
      });
      expect(unknown).toEqual({
        count: 0,
        firstAt: null,
        lastAt: null,
        lastScore: null,
        lastNote: null,
      });
      const [theirs] = await actor.myLogsOf(userCtx(coOwner, "r2"), [
        bottle.id,
      ]);
      expect(theirs).toMatchObject({ count: 1, lastNote: null });
    });
  });

  it("nameMatches: bottles still here, by name, with no model call", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const cellarId = await seedCellar(db, { createdById: owner });
      const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
      const actor = await activate(newCellarActor(cellarId, db, embed));
      const ctx = userCtx(owner, "r");
      const lagavulin = await seedWine(db, owner, "Lagavulin 16");
      await actor.addItem(ctx, { item: lagavulin });
      const gone = await actor.addItem(ctx, { item: lagavulin });
      await actor.emptyItem(ctx, gone.id);
      await actor.addItem(ctx, { item: await seedWine(db, owner, "Rioja") });

      const groups = await actor.nameMatches(ctx, {
        search: "lagavulin",
        limit: 5,
      });
      expect(groups.map((group) => [group.lead.item.id, group.count])).toEqual([
        [lagavulin.id, 1],
      ]);
      expect(embed).not.toHaveBeenCalled();
      await expect(
        actor.nameMatches(ctx, { search: "x", limit: 0 }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});

describe.skipIf(skip)("CellarActor concealment", () => {
  afterAll(closeTestDb);

  const ITEM = "00000000-0000-4000-8000-00000000abcd";
  const CALLS: readonly [
    string,
    (actor: CellarActor, ctx: Ctx) => Promise<unknown>,
  ][] = [
    ["get", (actor, ctx) => actor.get(ctx)],
    ["items", (actor, ctx) => actor.items(ctx, { page })],
    ["checkIns", (actor, ctx) => actor.checkIns(ctx, page)],
    ["update", (actor, ctx) => actor.update(ctx, { name: "Mine now" })],
    ["delete", (actor, ctx) => actor.delete(ctx)],
    ["addItem", (actor, ctx) => actor.addItem(ctx, {} as never)],
    ["drinkSoon", (actor, ctx) => actor.drinkSoon(ctx, page)],
    ["updateItem", (actor, ctx) => actor.updateItem(ctx, ITEM, {})],
    [
      "setItemPercentage",
      (actor, ctx) => actor.setItemPercentage(ctx, ITEM, 50),
    ],
    ["openItem", (actor, ctx) => actor.openItem(ctx, ITEM)],
    ["emptyItem", (actor, ctx) => actor.emptyItem(ctx, ITEM)],
    ["removeItem", (actor, ctx) => actor.removeItem(ctx, ITEM)],
    ["item", (actor, ctx) => actor.item(ctx, ITEM)],
    [
      "bottleFor",
      (actor, ctx) => actor.bottleFor(ctx, { type: "WINE", id: ITEM }),
    ],
    ["checkInsOf", (actor, ctx) => actor.checkInsOf(ctx, [ITEM])],
    ["itemGroups", (actor, ctx) => actor.itemGroups(ctx, { page })],
    ["dashboard", (actor, ctx) => actor.dashboard(ctx, {})],
    ["myLogsOf", (actor, ctx) => actor.myLogsOf(ctx, [ITEM])],
    [
      "nameMatches",
      (actor, ctx) => actor.nameMatches(ctx, { search: "wine", limit: 5 }),
    ],
  ];

  it.each(CALLS)("%s", async (_method, call) => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = userCtx(await seedUser(db), "r-stranger");
      const real = await seedCellar(db, {
        createdById: owner,
        privacy: "PRIVATE",
      });
      const absent = randomUUID();

      const hidden = await refusalOf(
        async () => call(await activate(newCellarActor(real, db)), stranger),
        real,
      );
      const missing = await refusalOf(
        async () => call(await activate(newCellarActor(absent, db)), stranger),
        absent,
      );
      expect(hidden).toEqual(missing);
      expect(hidden.code).toBe("NOT_FOUND");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* ux-c L02 — a bottle's own dates, price and place; Drink soon                */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("CellarActor freshness (ux-c L02)", () => {
  afterAll(closeTestDb);

  const FRESH = {
    packagedOn: "2025-06-01",
    acquiredOn: "2026-01-15",
    drinkFrom: "2026-02-01",
    drinkUntil: "2030-12-31",
    priceAmount: 58,
    priceCurrency: "EUR",
    location: "Rack B, row 3",
  } as const;

  const freshOf = (dto: Record<string, unknown>) => ({
    packagedOn: dto.packagedOn,
    acquiredOn: dto.acquiredOn,
    drinkFrom: dto.drinkFrom,
    drinkUntil: dto.drinkUntil,
    priceAmount: dto.priceAmount,
    priceCurrency: dto.priceCurrency,
    location: dto.location,
  });

  const NONE = {
    packagedOn: null,
    acquiredOn: null,
    drinkFrom: null,
    drinkUntil: null,
    priceAmount: null,
    priceCurrency: null,
    location: null,
  };

  it("the owner writes each field, reads it back, and clears it with null", async () => {
    await withTestDb(async (db) => {
      const { owner, actor, itemId } = await seedScenario(db, "PRIVATE");
      const ctx = userCtx(owner, "r");
      const written = await actor.updateItem(ctx, itemId, FRESH);
      expect(freshOf(written)).toEqual(FRESH);
      const read = await actor.item(ctx, itemId);
      expect(freshOf(read ?? {})).toEqual(FRESH);

      // Absent leaves a field alone; null clears it.
      const partial = await actor.updateItem(ctx, itemId, {
        location: null,
        priceAmount: null,
      });
      expect(freshOf(partial)).toEqual({
        ...FRESH,
        location: null,
        priceAmount: null,
        priceCurrency: null,
      });
    });
  });

  it("addItem takes them too, all optional", async () => {
    await withTestDb(async (db) => {
      const { owner, actor, wine } = await seedScenario(db, "PRIVATE");
      const ctx = userCtx(owner, "r");
      const bare = await actor.addItem(ctx, { item: wine });
      expect(freshOf(bare)).toEqual(NONE);
      const dated = await actor.addItem(ctx, {
        item: wine,
        acquiredOn: "2026-11-01",
        priceAmount: 12.5,
        priceCurrency: "usd",
        location: "  Fridge door  ",
      });
      expect(freshOf(dated)).toMatchObject({
        acquiredOn: "2026-11-01",
        priceAmount: 12.5,
        priceCurrency: "USD",
        location: "Fridge door",
      });
    });
  });

  it.each([
    ["an impossible date", { packagedOn: "2026-02-30" }],
    ["a timestamp for a date", { drinkFrom: "2026-02-01T10:00:00Z" }],
    ["from after until", { drinkFrom: "2031-01-01", drinkUntil: "2030-01-01" }],
    ["a negative price", { priceAmount: -1, priceCurrency: "EUR" }],
    ["a price past numeric(10,2)", { priceAmount: 1e9, priceCurrency: "EUR" }],
    ["a price with no currency", { priceAmount: 10 }],
    ["a currency with no price", { priceCurrency: "EUR" }],
    [
      "a currency that is not ISO 4217",
      { priceAmount: 10, priceCurrency: "EURO" },
    ],
    ["a location over 80 characters", { location: "x".repeat(81) }],
  ] as const)("refuses %s with a ValidationError", async (_what, input) => {
    await withTestDb(async (db) => {
      const { owner, actor, itemId } = await seedScenario(db, "PRIVATE");
      await expect(
        actor.updateItem(userCtx(owner, "r"), itemId, input),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("checks from-before-until against the stored other end", async () => {
    await withTestDb(async (db) => {
      const { owner, actor, itemId } = await seedScenario(db, "PRIVATE");
      const ctx = userCtx(owner, "r");
      await actor.updateItem(ctx, itemId, { drinkUntil: "2027-01-01" });
      await expect(
        actor.updateItem(ctx, itemId, { drinkFrom: "2028-01-01" }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("another user's bottle: refused, and concealed where the cellar is hidden", async () => {
    await withTestDb(async (db) => {
      // PRIVATE: the stranger cannot see the cellar, so the refusal is the
      // same one a cellar that does not exist gets.
      const hidden = await seedScenario(db, "PRIVATE");
      const stranger = userCtx(hidden.stranger, "r");
      const absent = randomUUID();
      const refused = await refusalOf(
        () => hidden.actor.updateItem(stranger, hidden.itemId, FRESH),
        hidden.cellarId,
      );
      const missing = await refusalOf(
        async () =>
          (await activate(newCellarActor(absent, db))).updateItem(
            stranger,
            hidden.itemId,
            FRESH,
          ),
        absent,
      );
      expect(refused).toEqual(missing);
      expect(refused.code).toBe("NOT_FOUND");

      // FRIENDS: the friend sees the cellar but may not change it.
      const shared = await seedScenario(db, "FRIENDS");
      await expect(
        shared.actor.updateItem(userCtx(shared.friend, "r"), shared.itemId, {
          location: "Mine now",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      const after = await shared.actor.item(
        userCtx(shared.owner, "r"),
        shared.itemId,
      );
      expect(after?.location).toBeNull();
    });
  });

  it("a bottle from a cellar you don't co-own answers exactly like an id that doesn't exist", async () => {
    await withTestDb(async (db) => {
      const theirs = await seedScenario(db, "PUBLIC");
      const me = await seedUser(db);
      const mine = await seedCellar(db, { createdById: me });
      const myActor = await activate(newCellarActor(mine, db));
      const ctx = userCtx(me, "r");

      const foreign = await refusalOf(
        () => myActor.updateItem(ctx, theirs.itemId, FRESH),
        theirs.itemId,
      );
      const ghost = randomUUID();
      const nothing = await refusalOf(
        () => myActor.updateItem(ctx, ghost, FRESH),
        ghost,
      );
      expect(foreign).toEqual(nothing);
      expect(foreign.code).toBe("NOT_FOUND");

      // And the PUBLIC cellar itself: visible, not mine — forbidden.
      await expect(
        theirs.actor.updateItem(ctx, theirs.itemId, FRESH),
      ).rejects.toBeInstanceOf(ForbiddenError);
      const untouched = await theirs.actor.item(
        userCtx(theirs.owner, "r"),
        theirs.itemId,
      );
      expect(freshOf(untouched ?? {})).toEqual(NONE);
    });
  });

  it("a co-owner may write them, per the cellar's own rules", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const coOwner = await seedUser(db);
      const cellarId = await seedCellar(db, {
        createdById: owner,
        coOwnerIds: [coOwner],
      });
      const actor = await activate(newCellarActor(cellarId, db));
      const bottle = await actor.addItem(userCtx(owner, "r"), {
        item: await seedWine(db, owner),
      });
      const written = await actor.updateItem(userCtx(coOwner, "r"), bottle.id, {
        location: "Hall cupboard",
      });
      expect(written.location).toBe("Hall cupboard");
    });
  });

  it("they stay private: a viewer who may only see the cellar reads null", async () => {
    await withTestDb(async (db) => {
      const shared = await seedScenario(db, "FRIENDS");
      await shared.actor.updateItem(
        userCtx(shared.owner, "r"),
        shared.itemId,
        FRESH,
      );
      const asFriend = await shared.actor.items(userCtx(shared.friend, "r"), {
        page,
      });
      expect(asFriend.entries.map((e) => freshOf(e.node))).toEqual([NONE]);
      const one = await shared.actor.item(
        userCtx(shared.friend, "r"),
        shared.itemId,
      );
      expect(freshOf(one ?? {})).toEqual(NONE);
      const asOwner = await shared.actor.items(userCtx(shared.owner, "r"), {
        page,
      });
      expect(asOwner.entries.map((e) => freshOf(e.node))).toEqual([FRESH]);
    });
  });

  it("drinkSoon: opened bottles past their style's span, then sealed ones closing", async () => {
    await withTestDb(async (db) => {
      const { owner, friend, actor, itemId, wine } = await seedScenario(
        db,
        "FRIENDS",
      );
      const ctx = userCtx(owner, "r");
      const day = 86_400_000;
      const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
      // The scenario's red, opened ten days ago: past its 3–5 days.
      await actor.updateItem(ctx, itemId, {
        openAt: new Date(Date.now() - 10 * day).toISOString(),
      });
      // A sealed IPA canned seven weeks ago: typical until three months on.
      await db.execute(
        sql`insert into public.beer_style (value) values ('INDIA_PALE_ALE') on conflict do nothing`,
      );
      const ipaId = await seedBeer(db, owner, "Pliny");
      await db.execute(
        sql`update public.beers set style = 'INDIA_PALE_ALE' where id = ${ipaId}::uuid`,
      );
      const ipa = await actor.addItem(ctx, {
        item: { type: "BEER", id: ipaId },
        packagedOn: iso(Date.now() - 49 * day),
      });
      // A sealed red from the scenario's 2020 vintage: typical until 2030.
      await actor.addItem(ctx, { item: wine });
      // A sealed red with the owner's own date in two months.
      const mine = await actor.addItem(ctx, {
        item: wine,
        drinkUntil: iso(Date.now() + 60 * day),
      });

      const soon = (await actor.drinkSoon(ctx, page)).entries.map(
        (entry) => entry.node,
      );
      expect(soon.map((s) => [s.bottle.id, s.reason, s.urgency])).toEqual([
        [itemId, "OPENED", "PAST"],
        [ipa.id, "SEALED", "SOON"],
        [mine.id, "SEALED", "SOON"],
      ]);
      expect(soon[0]).toMatchObject({
        openDays: 10,
        openLifeDays: [3, 5],
        typicalFor: "red wine",
      });
      expect(soon[1]).toMatchObject({
        typicalFor: "IPA",
        window: { untilSource: "typical" },
      });
      // The owner's own end wins; its start is still the typical one.
      expect(soon[2]).toMatchObject({
        typicalFor: "red wine",
        window: { fromSource: "typical", untilSource: "user" },
      });

      // The friend may see the cellar, not its owner's private dates.
      expect(
        (await actor.drinkSoon(userCtx(friend, "r"), page)).entries,
      ).toEqual([]);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* SV-B · MC-move — `updateItem({ cellarId })` moves a bottle (L13)            */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("CellarActor move (SV-B, MC-move)", () => {
  afterAll(closeTestDb);

  const bottleRow = async (db: DbOrTx, id: string) => {
    const result = await db.execute(sql`
      select cellar_id::text as "cellarId", location
      from public.cellar_items where id = ${id}::uuid
    `);
    return result.rows[0] as { cellarId: string; location: string | null };
  };

  it("moves the owner's bottle to another of their cellars, clears its shelf, keeps its logs", async () => {
    await withTestDb(async (db) => {
      const { owner, actor, itemId, cellarId } = await seedScenario(
        db,
        "PRIVATE",
      );
      const ctx = userCtx(owner, "r");
      await actor.updateItem(ctx, itemId, { location: "Rack A" });
      const destId = await seedCellar(db, { createdById: owner });
      // Activated before the move: its cached list must not stay stale.
      const dest = await activate(newCellarActor(destId, db));
      expect((await dest.items(ctx, { page })).totalCount).toBe(0);

      const moved = await actor.updateItem(ctx, itemId, { cellarId: destId });
      expect(moved).toMatchObject({ id: itemId, cellarId: destId });
      expect(moved.location).toBeNull();
      expect(await bottleRow(db, itemId)).toEqual({
        cellarId: destId,
        location: null,
      });

      expect((await actor.items(ctx, { page })).totalCount).toBe(0);
      await dest.onActorMethodPre();
      const there = await dest.items(ctx, { page });
      expect(there.entries.map((e) => e.node.id)).toEqual([itemId]);
      // The log points at the bottle, not the cellar, so it follows it.
      const logs = await db.execute(
        sql`select count(*)::int as n from public.check_ins where cellar_item_id = ${itemId}::uuid`,
      );
      expect(logs.rows[0]).toEqual({ n: 1 });
      expect(cellarId).not.toBe(destId);
    });
  });

  it("a co-owner of both cellars may move between them", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const coOwner = await seedUser(db);
      const sourceId = await seedCellar(db, {
        createdById: owner,
        coOwnerIds: [coOwner],
      });
      const destId = await seedCellar(db, {
        createdById: owner,
        coOwnerIds: [coOwner],
      });
      const actor = await activate(newCellarActor(sourceId, db));
      const wine = await seedWine(db, owner);
      const { id: itemId } = await actor.addItem(userCtx(owner, "add"), {
        item: wine,
      });
      const moved = await actor.updateItem(userCtx(coOwner, "r"), itemId, {
        cellarId: destId,
      });
      expect(moved.cellarId).toBe(destId);
    });
  });

  it("refuses a destination the viewer cannot write, as absent, and moves nothing", async () => {
    await withTestDb(async (db) => {
      const { owner, actor, itemId, cellarId } = await seedScenario(
        db,
        "PRIVATE",
      );
      const ctx = userCtx(owner, "r");
      const other = await seedUser(db);
      // Visible to the owner (PUBLIC), but not theirs to write.
      const theirs = await seedCellar(db, {
        createdById: other,
        privacy: "PUBLIC",
      });
      await expect(
        actor.updateItem(ctx, itemId, { cellarId: theirs }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        actor.updateItem(ctx, itemId, { cellarId: randomUUID() }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        actor.updateItem(ctx, itemId, { cellarId: "not-a-uuid" }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect((await bottleRow(db, itemId)).cellarId).toBe(cellarId);
    });
  });

  it("refuses the wrong user: a stranger cannot move someone else's bottle into their own cellar", async () => {
    await withTestDb(async (db) => {
      const { stranger, actor, itemId, cellarId } = await seedScenario(
        db,
        "PUBLIC",
      );
      const mine = await seedCellar(db, { createdById: stranger });
      await expect(
        actor.updateItem(userCtx(stranger, "r"), itemId, { cellarId: mine }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect((await bottleRow(db, itemId)).cellarId).toBe(cellarId);
    });
  });

  it("refuses a read-only member: a friend who can see the cellar cannot move its bottle out (F-78)", async () => {
    await withTestDb(async (db) => {
      const { friend, actor, itemId, cellarId } = await seedScenario(
        db,
        "FRIENDS",
      );
      const ctx = userCtx(friend, "r");
      // The friend reads the cellar and the bottle...
      expect(
        (await actor.items(ctx, { page })).entries.map((e) => e.node.id),
      ).toEqual([itemId]);
      // ...but may not take it to a cellar of their own.
      const theirs = await seedCellar(db, { createdById: friend });
      await expect(
        actor.updateItem(ctx, itemId, { cellarId: theirs }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect((await bottleRow(db, itemId)).cellarId).toBe(cellarId);
    });
  });

  it("the same cellar is a no-op for the move: the shelf stays", async () => {
    await withTestDb(async (db) => {
      const { owner, actor, itemId, cellarId } = await seedScenario(
        db,
        "PRIVATE",
      );
      const ctx = userCtx(owner, "r");
      await actor.updateItem(ctx, itemId, { location: "Rack A" });
      const same = await actor.updateItem(ctx, itemId, {
        cellarId: cellarId.toUpperCase(),
        percentageRemaining: 40,
      });
      expect(same).toMatchObject({
        cellarId,
        location: "Rack A",
        percentageRemaining: 40,
      });
    });
  });

  it("applies the rest of the patch with the move", async () => {
    await withTestDb(async (db) => {
      const { owner, actor, itemId } = await seedScenario(db, "PRIVATE");
      const ctx = userCtx(owner, "r");
      const destId = await seedCellar(db, { createdById: owner });
      const moved = await actor.updateItem(ctx, itemId, {
        cellarId: destId,
        percentageRemaining: 25,
        location: "ignored on a move",
      });
      expect(moved).toMatchObject({
        cellarId: destId,
        percentageRemaining: 25,
        location: null,
      });
    });
  });
});
