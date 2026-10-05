/**
 * `CellarActor` against a real Postgres (B1).
 *
 * Three things this file is built to prove, because they are B1's acceptance
 * criteria (§6 B1):
 *
 *   1. the four-branch visibility rule holds for `get`, `items` **and**
 *      `checkIns`, from all three viewpoints §1.6 requires — owner, friend,
 *      stranger — at every privacy;
 *   2. `bulkCheckIn` refuses a non-friend id;
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
  await actor.checkIn(userCtx(owner, "seed-checkin"), item.id);

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

    it("removeItem takes the item's check-ins with it (FK is RESTRICT)", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        await scenario.actor.removeItem(
          userCtx(scenario.owner, "r"),
          scenario.itemId,
        );
        const remaining = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.cellarItemId, scenario.itemId));
        expect(remaining).toEqual([]);
        expect(
          (await scenario.actor.get(userCtx(scenario.owner, "r2"))).itemCount,
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
  /* Check-ins                                                           */
  /* ------------------------------------------------------------------ */

  describe("checkIn / bulkCheckIn", () => {
    it("a viewer who can see the cellar may check in; one who cannot, cannot", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PUBLIC");
        const outsider = await seedUser(db);
        const written = await scenario.actor.checkIn(
          userCtx(outsider, "r"),
          scenario.itemId,
        );
        expect(written.userId).toBe(outsider);

        const hidden = await seedScenario(db, "PRIVATE");
        await expect(
          hidden.actor.checkIn(userCtx(outsider, "r2"), hidden.itemId),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("is idempotent on an explicit id / the outbox row id", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        const ctx = userCtx(scenario.owner, "r");
        const id = randomUUID();
        const once = await scenario.actor.checkIn(ctx, scenario.itemId, id);
        const twice = await scenario.actor.checkIn(ctx, scenario.itemId, id);
        expect(twice).toEqual(once);
        expect((await scenario.actor.checkIns(ctx, page)).totalCount).toBe(2); // the seeded one, plus this one
      });
    });

    /** **B1 acceptance**: `bulkCheckIn` rejects a non-friend id. */
    it("refuses a non-friend id, and writes nothing when it does", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PUBLIC");
        const nonFriend = await seedUser(db);
        const ctx = userCtx(scenario.owner, "r");

        await expect(
          scenario.actor.bulkCheckIn(ctx, scenario.itemId, [
            scenario.owner,
            scenario.friend,
            nonFriend,
          ]),
        ).rejects.toBeInstanceOf(ForbiddenError);

        // The seeded check-in and nothing else: the rejection came before the
        // transaction, so there is no partial write to clean up.
        expect((await scenario.actor.checkIns(ctx, page)).totalCount).toBe(1);
      });
    });

    it("writes one row per friend, on their behalf", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "FRIENDS");
        const ctx = userCtx(scenario.owner, "r");
        const written = await scenario.actor.bulkCheckIn(ctx, scenario.itemId, [
          scenario.owner,
          scenario.friend,
          scenario.friend,
        ]);
        expect(written.map((row) => row.userId).sort()).toEqual(
          [scenario.owner, scenario.friend].sort(),
        );
        expect((await scenario.actor.checkIns(ctx, page)).totalCount).toBe(3);
      });
    });

    /**
     * Review W4 #3, on the check-in side: the dedupe and the friend check both
     * compare strings, so an upper-cased copy of your own id used to count as
     * a second person and then fail as "not a friend".
     */
    it("reads uppercase item and user ids as the ids they name", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "FRIENDS");
        const ctx = userCtx(scenario.owner, "r");
        const written = await scenario.actor.bulkCheckIn(
          ctx,
          scenario.itemId.toUpperCase(),
          [
            scenario.owner,
            scenario.owner.toUpperCase(),
            scenario.friend.toUpperCase(),
          ],
        );
        expect(written.map((row) => row.userId).sort()).toEqual(
          [scenario.owner, scenario.friend].sort(),
        );
        expect(
          written.every((row) => row.cellarItemId === scenario.itemId),
        ).toBe(true);

        // `checkIn`'s explicit id is its idempotency key: two spellings of it
        // are one check-in, not a second insert that then cannot be found.
        const id = randomUUID();
        const once = await scenario.actor.checkIn(ctx, scenario.itemId, id);
        const twice = await scenario.actor.checkIn(
          ctx,
          scenario.itemId.toUpperCase(),
          id.toUpperCase(),
        );
        expect(twice).toEqual(once);

        expect(
          await scenario.actor.removeItem(ctx, scenario.itemId.toUpperCase()),
        ).toEqual({ id: scenario.itemId });
      });
    });

    it("refuses an empty id list rather than writing nothing quietly", async () => {
      await withTestDb(async (db) => {
        const scenario = await seedScenario(db, "PRIVATE");
        await expect(
          scenario.actor.bulkCheckIn(
            userCtx(scenario.owner, "r"),
            scenario.itemId,
            [],
          ),
        ).rejects.toBeInstanceOf(ValidationError);
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
        const earlier = await actor.checkIn(ctx, second.id);
        const later = await actor.checkIn(ctx, second.id);

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
        await actor.checkIn(ctx, item.id);
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
    ["updateItem", (actor, ctx) => actor.updateItem(ctx, ITEM, {})],
    [
      "setItemPercentage",
      (actor, ctx) => actor.setItemPercentage(ctx, ITEM, 50),
    ],
    ["openItem", (actor, ctx) => actor.openItem(ctx, ITEM)],
    ["emptyItem", (actor, ctx) => actor.emptyItem(ctx, ITEM)],
    ["removeItem", (actor, ctx) => actor.removeItem(ctx, ITEM)],
    ["checkIn", (actor, ctx) => actor.checkIn(ctx, ITEM)],
    ["bulkCheckIn", (actor, ctx) => actor.bulkCheckIn(ctx, ITEM, [ITEM])],
    ["item", (actor, ctx) => actor.item(ctx, ITEM)],
    [
      "bottleFor",
      (actor, ctx) => actor.bottleFor(ctx, { type: "WINE", id: ITEM }),
    ],
    ["checkInsOf", (actor, ctx) => actor.checkInsOf(ctx, [ITEM])],
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
