/**
 * `TierListActor` against a real Postgres (B7).
 *
 * What this file is built to prove, per §6 B7's acceptance list and the B7
 * workstream brief:
 *
 *   1. the three-branch visibility rule (no co-owner branch — §1.6/policy's
 *      module doc) holds for `get` and `items`, from all three viewpoints —
 *      owner, friend, stranger — at every privacy;
 *   2. `reorderBand` batch-renumbers the affected band(s) into clean
 *      sequential positions, including a cross-band move;
 *   3. a tier list holding both an item and a place round-trips correctly;
 *   4. reordering is safe under a concurrent second reorder of the same list,
 *      because Dapr guarantees one turn at a time per actor id — demonstrated
 *      both as "sequential turns compose correctly" and, in contrast, "two
 *      stale activations of the same id do not", which is exactly the failure
 *      mode the guarantee rules out in production.
 *
 * Also covered: `addItem`'s idempotency and natural-uniqueness conflict,
 * `removeItem`'s renumbering, and `generateInsights`'s throttle/min-item gate
 * plus the "insights enqueue on content change only" acceptance from §6 B7.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, PermissionType } from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { outbox, tierListItems, tierLists } from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import type { InsightsGenerator } from "./tier-list-actor.ts";
import { TierListActor } from "./tier-list-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/** The fourth constructor argument (the insights seam) supplied per test, like `cellar-actor.test.ts` does for its embedder. */
const newTierListActor = (
  id: string,
  db: DbOrTx,
  generateInsights?: InsightsGenerator,
): TierListActor =>
  new TierListActor(daprClient(), new ActorId(id), db, generateInsights);

const page = pageArgs({ first: 50 });

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const seedTierList = async (
  db: DbOrTx,
  options: {
    createdById: string;
    privacy?: PermissionType;
    name?: string;
    insightsGeneratedAt?: Date | null;
  },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.tier_lists (id, name, created_by_id, privacy, insights_generated_at)
    values (${id}::uuid, ${options.name ?? "Tier List"}, ${options.createdById}::uuid,
            ${options.privacy ?? "PRIVATE"}::permission_type,
            ${options.insightsGeneratedAt?.toISOString() ?? null})
  `);
  return id;
};

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

/** Cheapest real `ItemRef`-shaped seed: a `wines` row (mirrors `cellar-actor.test.ts`). */
const seedWine = async (
  db: DbOrTx,
  createdById: string,
  name = "Test Wine",
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

/** A minimal `places` row — `name`, `categories`, `location` are `NOT NULL`. */
const seedPlace = async (db: DbOrTx, name = "Test Place"): Promise<string> => {
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

/** Rows this tier list has *ever* enqueued, whatever their status. */
const outboxRowsFor = async (
  db: DbOrTx,
  tierListId: string,
): Promise<readonly { method: string }[]> =>
  db
    .select({ method: outbox.method })
    .from(outbox)
    .where(eq(outbox.targetId, tierListId));

/** Rows still queued — what the coalescing guard in `enqueueOutboxOnce` sees. */
const liveOutboxRowsFor = async (
  db: DbOrTx,
  tierListId: string,
): Promise<readonly { method: string }[]> =>
  db
    .select({ method: outbox.method })
    .from(outbox)
    .where(and(eq(outbox.targetId, tierListId), eq(outbox.status, "pending")));

const contentUpdatedAt = async (
  db: DbOrTx,
  tierListId: string,
): Promise<Date | null> => {
  const [row] = await db
    .select({ at: tierLists.contentUpdatedAt })
    .from(tierLists)
    .where(eq(tierLists.id, tierListId));
  return row?.at ?? null;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("TierListActor (B7)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §8.3", () => {
    expect(TierListActor.category).toBe("entity");
  });

  /* ------------------------------------------------------------------ */
  /* Visibility: owner / friend / stranger, no co-owner branch           */
  /* ------------------------------------------------------------------ */

  describe("visibility (§1.6, minus the co-owner branch): get / items", () => {
    const matrix = [
      { privacy: "PUBLIC", owner: true, friend: true, stranger: true },
      { privacy: "FRIENDS", owner: true, friend: true, stranger: false },
      { privacy: "PRIVATE", owner: true, friend: false, stranger: false },
    ] as const;

    for (const row of matrix) {
      it(`${row.privacy}: owner=${row.owner} friend=${row.friend} stranger=${row.stranger}`, async () => {
        await withTestDb(async (db) => {
          const owner = await seedUser(db);
          const friend = await seedUser(db);
          const stranger = await seedUser(db);
          await seedFriendship(db, owner, friend);
          const tierListId = await seedTierList(db, {
            createdById: owner,
            privacy: row.privacy,
          });
          const actor = await activate(newTierListActor(tierListId, db));
          const wineId = await seedWine(db, owner);
          await actor.addItem(userCtx(owner, "seed-add"), {
            entry: { type: "WINE", id: wineId },
          });

          const viewers = [
            ["owner", owner, row.owner],
            ["friend", friend, row.friend],
            ["stranger", stranger, row.stranger],
          ] as const;

          for (const [label, viewerId, visible] of viewers) {
            const ctx = userCtx(viewerId, `r-${label}`);
            if (visible) {
              expect((await actor.get(ctx)).id, label).toBe(tierListId);
              expect(
                (await actor.items(ctx, page)).entries,
                label,
              ).toHaveLength(1);
            } else {
              await expect(actor.get(ctx)).rejects.toBeInstanceOf(
                NotFoundError,
              );
              await expect(actor.items(ctx, page)).rejects.toBeInstanceOf(
                NotFoundError,
              );
            }
          }
        });
      });
    }

    it("system and admin bypass the rule", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const admin = await seedUser(db);
        const tierListId = await seedTierList(db, {
          createdById: owner,
          privacy: "PRIVATE",
        });
        const actor = await activate(newTierListActor(tierListId, db));
        expect((await actor.get(systemCtx("r"))).id).toBe(tierListId);
        expect((await actor.get(adminCtx(admin, "r"))).id).toBe(tierListId);
      });
    });

    it("an anonymous viewer sees PUBLIC and nothing else", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const publicId = await seedTierList(db, {
          createdById: owner,
          privacy: "PUBLIC",
        });
        const privateId = await seedTierList(db, {
          createdById: owner,
          privacy: "PRIVATE",
        });
        const publicActor = await activate(newTierListActor(publicId, db));
        const privateActor = await activate(newTierListActor(privateId, db));
        const ctx = anonymousCtx("r");
        expect((await publicActor.get(ctx)).id).toBe(publicId);
        await expect(privateActor.get(ctx)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    it("a friend may not write, even though they can see it", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const tierListId = await seedTierList(db, {
          createdById: owner,
          privacy: "FRIENDS",
        });
        const actor = await activate(newTierListActor(tierListId, db));
        await expect(
          actor.update(userCtx(friend, "r"), { name: "Nope" }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });

    it("a stranger cannot even learn a PRIVATE list exists when writing to it", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const stranger = await seedUser(db);
        const tierListId = await seedTierList(db, {
          createdById: owner,
          privacy: "PRIVATE",
        });
        const actor = await activate(newTierListActor(tierListId, db));
        await expect(
          actor.update(userCtx(stranger, "r"), { name: "Nope" }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* create / update / delete                                            */
  /* ------------------------------------------------------------------ */

  describe("create / update / delete", () => {
    it("creates with defaults and refuses a second create", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = randomUUID();
        const actor = await activate(newTierListActor(id, db));
        const created = await actor.create(userCtx(owner, "r"), {
          name: "  Bars I Love  ",
        });
        expect(created).toMatchObject({
          id,
          name: "Bars I Love",
          privacy: "PRIVATE",
          listType: "place",
          createdById: owner,
          itemCount: 0,
        });
        await expect(
          actor.create(userCtx(owner, "r2"), { name: "Again" }),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });

    it("update is creator-only and never touches content_updated_at or the outbox", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const before = await actor.get(userCtx(owner, "r0"));

        const updated = await actor.update(userCtx(owner, "r"), {
          name: "Renamed",
          isEditingLocked: true,
        });
        expect(updated.name).toBe("Renamed");
        expect(updated.isEditingLocked).toBe(true);
        expect(updated.contentUpdatedAt).toBe(before.contentUpdatedAt);
        expect(await outboxRowsFor(db, id)).toHaveLength(0);
      });
    });

    it("delete is creator-only and cascades its items in one statement", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const outsider = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wineId = await seedWine(db, owner);
        await actor.addItem(userCtx(owner, "r"), {
          entry: { type: "WINE", id: wineId },
        });

        await expect(
          actor.delete(userCtx(outsider, "r2")),
        ).rejects.toBeInstanceOf(NotFoundError);

        await actor.delete(userCtx(owner, "r3"));
        const rows = await db
          .select({ id: tierListItems.id })
          .from(tierListItems)
          .where(eq(tierListItems.tierListId, id));
        expect(rows).toHaveLength(0);
        const header = await db
          .select({ id: tierLists.id })
          .from(tierLists)
          .where(eq(tierLists.id, id));
        expect(header).toHaveLength(0);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* addItem                                                              */
  /* ------------------------------------------------------------------ */

  describe("addItem", () => {
    it("computes position from the cached band length, appending in order", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wineA = await seedWine(db, owner, "A");
        const wineB = await seedWine(db, owner, "B");

        const first = await actor.addItem(userCtx(owner, "r1"), {
          entry: { type: "WINE", id: wineA },
          band: 3,
        });
        const second = await actor.addItem(userCtx(owner, "r2"), {
          entry: { type: "WINE", id: wineB },
          band: 3,
        });
        expect(first).toMatchObject({ band: 3, position: 0 });
        expect(second).toMatchObject({ band: 3, position: 1 });
      });
    });

    it("is idempotent on tierListItemId and refuses a duplicate entry", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wineId = await seedWine(db, owner);
        const itemId = randomUUID();

        const first = await actor.addItem(userCtx(owner, "r1"), {
          entry: { type: "WINE", id: wineId },
          tierListItemId: itemId,
        });
        const redelivered = await actor.addItem(userCtx(owner, "r1b"), {
          entry: { type: "WINE", id: wineId },
          tierListItemId: itemId,
        });
        expect(redelivered).toEqual(first);

        // Same wine, a *different* row id: the table's own unique constraint
        // (`unique_wine_in_tier_list`), surfaced as ConflictError.
        await expect(
          actor.addItem(userCtx(owner, "r2"), {
            entry: { type: "WINE", id: wineId },
          }),
        ).rejects.toBeInstanceOf(ConflictError);

        const rows = await db
          .select({ id: tierListItems.id })
          .from(tierListItems)
          .where(eq(tierListItems.tierListId, id));
        expect(rows).toHaveLength(1);
      });
    });

    it("rejects a band outside 0-5", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wineId = await seedWine(db, owner);
        await expect(
          actor.addItem(userCtx(owner, "r"), {
            entry: { type: "WINE", id: wineId },
            band: 6,
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Acceptance #3 — an item and a place round-trip correctly            */
  /* ------------------------------------------------------------------ */

  describe("items and places, both rankable", () => {
    it("holds one of each, resolved to the right TierListEntryRef", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wineId = await seedWine(db, owner, "Ridge Monte Bello");
        const placeId = await seedPlace(db, "The Wine Bar");

        const wineItem = await actor.addItem(userCtx(owner, "r1"), {
          entry: { type: "WINE", id: wineId },
          band: 5,
        });
        const placeItem = await actor.addItem(userCtx(owner, "r2"), {
          entry: { type: "PLACE", id: placeId },
          band: 5,
          notes: "great patio",
        });

        expect(wineItem.entry).toEqual({ type: "WINE", id: wineId });
        expect(placeItem.entry).toEqual({ type: "PLACE", id: placeId });
        expect(placeItem.notes).toBe("great patio");

        // Round-trips through a fresh activation too, not just the cache
        // the writes left behind.
        const reactivated = await activate(newTierListActor(id, db));
        const fetched = await reactivated.items(userCtx(owner, "r3"), page);
        const entries = fetched.entries.map((e) => e.node.entry);
        expect(entries).toEqual(
          expect.arrayContaining([
            { type: "WINE", id: wineId },
            { type: "PLACE", id: placeId },
          ]),
        );
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* removeItem — renumbers what remains                                 */
  /* ------------------------------------------------------------------ */

  describe("removeItem", () => {
    it("closes the gap it leaves in its band", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wines = await Promise.all(
          ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
        );
        const items = [];
        for (const wineId of wines) {
          items.push(
            await actor.addItem(userCtx(owner, `add-${wineId}`), {
              entry: { type: "WINE", id: wineId },
              band: 2,
            }),
          );
        }
        // positions 0, 1, 2 — remove the middle one.
        const middle = items[1];
        if (middle === undefined) throw new Error("fixture");
        await actor.removeItem(userCtx(owner, "r"), middle.id);

        const remaining = await actor.items(userCtx(owner, "r2"), page);
        const positions = remaining.entries
          .map((e) => e.node)
          .sort((a, b) => a.position - b.position)
          .map((n) => ({ id: n.id, position: n.position }));
        expect(positions).toEqual([
          { id: items[0]?.id, position: 0 },
          { id: items[2]?.id, position: 1 },
        ]);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Acceptance #2 — reorderBand batch-renumbers the affected band(s)    */
  /* ------------------------------------------------------------------ */

  describe("reorderBand", () => {
    it("renumbers a within-band reorder to clean sequential positions", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wines = await Promise.all(
          ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
        );
        const items = [];
        for (const wineId of wines) {
          items.push(
            await actor.addItem(userCtx(owner, `add-${wineId}`), {
              entry: { type: "WINE", id: wineId },
              band: 4,
            }),
          );
        }
        const [a, b, c] = items;
        if (a === undefined || b === undefined || c === undefined) {
          throw new Error("fixture");
        }
        // Reverse the order: C, A, B.
        const result = await actor.reorderBand(userCtx(owner, "r"), 4, [
          c.id,
          a.id,
          b.id,
        ]);

        const positions = result
          .slice()
          .sort((x, y) => x.position - y.position)
          .map((n) => ({ id: n.id, band: n.band, position: n.position }));
        // PASTED PROOF (acceptance #2): resulting positions after reorder.
        console.log(
          "reorderBand (within-band) resulting positions:",
          JSON.stringify(positions, null, 2),
        );
        expect(positions).toEqual([
          { id: c.id, band: 4, position: 0 },
          { id: a.id, band: 4, position: 1 },
          { id: b.id, band: 4, position: 2 },
        ]);
      });
    });

    it("moves an item across bands and renumbers both the source and destination band", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wines = await Promise.all(
          ["S0", "S1", "S2", "D0"].map((n) => seedWine(db, owner, n)),
        );
        const [s0, s1, s2, d0] = wines;
        if (
          s0 === undefined ||
          s1 === undefined ||
          s2 === undefined ||
          d0 === undefined
        ) {
          throw new Error("fixture");
        }
        // Band 1 ("source"): three items, positions 0,1,2.
        const source = [];
        for (const wineId of [s0, s1, s2]) {
          source.push(
            await actor.addItem(userCtx(owner, `add-${wineId}`), {
              entry: { type: "WINE", id: wineId },
              band: 1,
            }),
          );
        }
        // Band 3 ("destination"): one item, position 0.
        const dest0 = await actor.addItem(userCtx(owner, "add-d0"), {
          entry: { type: "WINE", id: d0 },
          band: 3,
        });

        const middle = source[1];
        if (middle === undefined) throw new Error("fixture");
        // Move band-1's middle item into band 3, at the front.
        const destResult = await actor.reorderBand(userCtx(owner, "r"), 3, [
          middle.id,
          dest0.id,
        ]);

        const destPositions = destResult
          .slice()
          .sort((x, y) => x.position - y.position)
          .map((n) => ({ id: n.id, band: n.band, position: n.position }));
        const sourcePage = await actor.items(userCtx(owner, "r2"), page);
        const sourcePositions = sourcePage.entries
          .map((e) => e.node)
          .filter((n) => n.band === 1)
          .sort((x, y) => x.position - y.position)
          .map((n) => ({ id: n.id, band: n.band, position: n.position }));

        // PASTED PROOF (acceptance #2): both affected bands after a cross-band move.
        console.log(
          "reorderBand (cross-band move) destination band:",
          JSON.stringify(destPositions, null, 2),
        );
        console.log(
          "reorderBand (cross-band move) source band (renumbered):",
          JSON.stringify(sourcePositions, null, 2),
        );

        expect(destPositions).toEqual([
          { id: middle.id, band: 3, position: 0 },
          { id: dest0.id, band: 3, position: 1 },
        ]);
        // s0 and s2 remain in band 1, renumbered 0,1 with their relative order kept.
        expect(sourcePositions).toEqual([
          { id: source[0]?.id, band: 1, position: 0 },
          { id: source[2]?.id, band: 1, position: 1 },
        ]);
      });
    });

    /**
     * W4 mutant T4. `#writePositions` skips a row already at its target
     * `(band, position)`; weakening that to "already at its target position"
     * survived the whole suite, because every cross-band move above lands at
     * an index different from the one it left. Here it does not: X leaves
     * position 0 of band 2 for position 0 of band 5, so only the band differs
     * — and a skip that ignored the band left X where it was, reported
     * nothing moved, and bumped nothing.
     */
    it("moves an item to another band at the same index", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wineId = await seedWine(db, owner, "X");
        const x = await actor.addItem(userCtx(owner, "add-x"), {
          entry: { type: "WINE", id: wineId },
          band: 2,
        });
        expect({ band: x.band, position: x.position }).toEqual({
          band: 2,
          position: 0,
        });
        const epoch = new Date(0);
        await db
          .update(tierLists)
          .set({ contentUpdatedAt: epoch })
          .where(eq(tierLists.id, id));

        const result = await actor.reorderBand(userCtx(owner, "r"), 5, [x.id]);

        expect(result.map((n) => [n.id, n.band, n.position])).toEqual([
          [x.id, 5, 0],
        ]);
        const [row] = await db
          .select({
            band: tierListItems.band,
            position: tierListItems.position,
          })
          .from(tierListItems)
          .where(eq(tierListItems.id, x.id));
        expect(row).toEqual({ band: 5, position: 0 });
        expect((await contentUpdatedAt(db, id))?.getTime()).toBeGreaterThan(0);
      });
    });

    /** Review W4 #3: the cached ids are lowercase; an uppercase copy is the same row. */
    it("reads uppercase item ids as the rows they name", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const items = [];
        for (const name of ["A", "B", "C"]) {
          const wineId = await seedWine(db, owner, name);
          items.push(
            await actor.addItem(userCtx(owner, `add-${name}`), {
              entry: { type: "WINE", id: wineId.toUpperCase() },
              band: 0,
            }),
          );
        }
        const [a, b, c] = items;
        if (a === undefined || b === undefined || c === undefined) {
          throw new Error("fixture");
        }

        const reordered = await actor.reorderBand(userCtx(owner, "r"), 0, [
          c.id.toUpperCase(),
          a.id.toUpperCase(),
          b.id.toUpperCase(),
        ]);
        expect(
          reordered
            .slice()
            .sort((x, y) => x.position - y.position)
            .map((n) => [n.id, n.position]),
        ).toEqual([
          [c.id, 0],
          [a.id, 1],
          [b.id, 2],
        ]);

        expect(
          await actor.removeItem(userCtx(owner, "r2"), a.id.toUpperCase()),
        ).toEqual({ id: a.id });
        const left = (await actor.items(userCtx(owner, "r3"), page)).entries
          .map((e) => e.node)
          .sort((x, y) => x.position - y.position)
          .map((n) => [n.id, n.position]);
        expect(left).toEqual([
          [c.id, 0],
          [b.id, 1],
        ]);
      });
    });

    it("rejects orderedIds that drop a current band member by omission", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wines = await Promise.all(
          ["A", "B"].map((n) => seedWine(db, owner, n)),
        );
        const items = [];
        for (const wineId of wines) {
          items.push(
            await actor.addItem(userCtx(owner, `add-${wineId}`), {
              entry: { type: "WINE", id: wineId },
              band: 0,
            }),
          );
        }
        const [a] = items;
        if (a === undefined) throw new Error("fixture");
        await expect(
          actor.reorderBand(userCtx(owner, "r"), 0, [a.id]),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });

    it("rejects duplicates, unknown ids, and an empty list", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        const wineId = await seedWine(db, owner);
        const item = await actor.addItem(userCtx(owner, "r"), {
          entry: { type: "WINE", id: wineId },
          band: 0,
        });

        await expect(
          actor.reorderBand(userCtx(owner, "r2"), 0, [item.id, item.id]),
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
          actor.reorderBand(userCtx(owner, "r3"), 0, []),
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
          actor.reorderBand(userCtx(owner, "r4"), 0, [randomUUID()]),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Acceptance #4 — concurrent reorder safety                           */
  /* ------------------------------------------------------------------ */

  describe("concurrent reorder safety — Dapr's one-turn-per-actor-id guarantee", () => {
    it("two reorders of the same list, run as sequential turns on one activation, compose correctly", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        // ONE actor instance — exactly what Dapr guarantees exists for a
        // given actor id at any moment: never two live activations racing.
        const actor = await activate(newTierListActor(id, db));
        const wines = await Promise.all(
          ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
        );
        const items = [];
        for (const wineId of wines) {
          items.push(
            await actor.addItem(userCtx(owner, `add-${wineId}`), {
              entry: { type: "WINE", id: wineId },
              band: 2,
            }),
          );
        }
        const [a, b, c] = items;
        if (a === undefined || b === undefined || c === undefined) {
          throw new Error("fixture");
        }

        // "Concurrent" from the caller's point of view — two reorder requests
        // arrive close together — but Dapr serialises them into two turns on
        // this one activation. `reorderBand` has no lock of its own; it reads
        // `this.requireAggregate()` (the in-memory cache) each time, and the
        // second call only sees a consistent picture because `reload()` ran
        // at the end of the first turn before the second could start. Two
        // `await`s in sequence is precisely what that serialisation looks
        // like from the caller's side.
        await actor.reorderBand(userCtx(owner, "r1"), 2, [c.id, b.id, a.id]);
        const second = await actor.reorderBand(userCtx(owner, "r2"), 2, [
          a.id,
          c.id,
          b.id,
        ]);

        const positions = second
          .slice()
          .sort((x, y) => x.position - y.position)
          .map((n) => ({ id: n.id, position: n.position }));
        console.log(
          "two sequential turns, final positions:",
          JSON.stringify(positions, null, 2),
        );
        expect(positions).toEqual([
          { id: a.id, position: 0 },
          { id: c.id, position: 1 },
          { id: b.id, position: 2 },
        ]);

        // And the database agrees — no lost update, no duplicate position.
        const rows = await db
          .select({ id: tierListItems.id, position: tierListItems.position })
          .from(tierListItems)
          .where(eq(tierListItems.tierListId, id));
        expect(rows.map((r) => r.position).sort()).toEqual([0, 1, 2]);
      });
    });

    it("shows why the guarantee matters: two stale activations of the same id corrupt state", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const wines = await Promise.all(
          ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
        );

        // Seed through one activation, as usual.
        const seeder = await activate(newTierListActor(id, db));
        const items = [];
        for (const wineId of wines) {
          items.push(
            await seeder.addItem(userCtx(owner, `add-${wineId}`), {
              entry: { type: "WINE", id: wineId },
              band: 0,
            }),
          );
        }
        const [a, b, c] = items;
        if (a === undefined || b === undefined || c === undefined) {
          throw new Error("fixture");
        }

        // This is the scenario Dapr's placement guarantee exists to prevent:
        // TWO live activations of `TierListActor(id)` at once, each holding
        // its own stale in-memory copy of the aggregate loaded *before*
        // either has written anything. In production this cannot happen —
        // Dapr places exactly one activation per actor id and serialises
        // every call into it. Simulating the violation here is what proves
        // the guarantee is load-bearing: without it, `reorderBand`'s
        // "compute from the cache, no lock" design is unsafe.
        const stale1 = await activate(newTierListActor(id, db));
        const stale2 = await activate(newTierListActor(id, db));

        // Both computed their reorder from the *same* pre-write snapshot.
        await stale1.reorderBand(userCtx(owner, "r1"), 0, [c.id, b.id, a.id]);
        // stale2 never reloaded after stale1's write — exactly what a second
        // concurrent activation would do, and exactly what Dapr never allows.
        await stale2.reorderBand(userCtx(owner, "r2"), 0, [b.id, a.id, c.id]);

        // `#writePositions` skips writing a row whose *own stale cache*
        // already shows it at the target `(band, position)` — a real
        // optimisation (it keeps a reorder's write set to what actually
        // moved) that becomes a correctness bug the instant two activations
        // are alive at once: `stale2` thinks `c` is still at position 2 (its
        // own snapshot), so it never re-writes `c`, leaving `c` at whatever
        // `stale1` last wrote it to (position 0) while `stale2` also writes
        // `b` to position 0. The result is two rows sharing one position —
        // the exact invariant `reorderBand` exists to guarantee never
        // happens. This is *not* a bug to fix in `TierListActor`: it is the
        // failure the single-activation guarantee prevents, and why
        // `reorderBand` may trust its in-memory cache without a version
        // column or a `SELECT ... FOR UPDATE` — because in production there
        // is never a `stale2`.
        const rows = await db
          .select({ id: tierListItems.id, position: tierListItems.position })
          .from(tierListItems)
          .where(eq(tierListItems.tierListId, id))
          .orderBy(tierListItems.position);
        console.log(
          "two stale activations (guarantee violated), final rows:",
          JSON.stringify(rows, null, 2),
        );
        const positions = rows.map((r) => r.position);
        // The corruption, precisely: a duplicate position where "clean
        // sequential, never duplicated" is the whole point of this method.
        expect(new Set(positions).size).toBeLessThan(positions.length);
        expect(positions.sort((x, y) => x - y)).not.toEqual([0, 1, 2]);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* generateInsights + "enqueue on content change only"                 */
  /* ------------------------------------------------------------------ */

  describe("generateInsights", () => {
    it("is delivered by the outbox only — a request may not call it directly", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));
        await expect(
          actor.generateInsights(userCtx(owner, "r")),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });

    it("skips under the minimum-item gate without calling the generator", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        let called = false;
        const actor = await activate(
          newTierListActor(id, db, async () => {
            called = true;
            return {};
          }),
        );
        const wineId = await seedWine(db, owner);
        await actor.addItem(userCtx(owner, "r"), {
          entry: { type: "WINE", id: wineId },
        });

        const result = await actor.generateInsights(systemCtx("r2"));
        expect(result).toMatchObject({ tierListId: id, skipped: true });
        expect(result.reason).toMatch(/fewer than/);
        expect(called).toBe(false);
      });
    });

    it("skips under the 24h throttle without calling the generator", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recentlyGenerated = new Date(Date.now() - 60_000); // 1 minute ago
        const id = await seedTierList(db, {
          createdById: owner,
          insightsGeneratedAt: recentlyGenerated,
        });
        let called = false;
        const actor = await activate(
          newTierListActor(id, db, async () => {
            called = true;
            return {};
          }),
        );
        const wines = await Promise.all(
          ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
        );
        for (const wineId of wines) {
          await actor.addItem(userCtx(owner, `add-${wineId}`), {
            entry: { type: "WINE", id: wineId },
          });
        }

        const result = await actor.generateInsights(systemCtx("r"));
        expect(result).toMatchObject({
          tierListId: id,
          skipped: true,
          reason: "throttled",
        });
        expect(called).toBe(false);
      });
    });

    it("calls the injected generator and writes ai_insights when eligible", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(
          newTierListActor(id, db, async (_ctx, input) => ({
            summary: `${input.entries.length} items ranked`,
          })),
        );
        const wines = await Promise.all(
          ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
        );
        for (const wineId of wines) {
          await actor.addItem(userCtx(owner, `add-${wineId}`), {
            entry: { type: "WINE", id: wineId },
          });
        }

        const result = await actor.generateInsights(systemCtx("r"));
        expect(result).toEqual({
          tierListId: id,
          skipped: false,
          reason: "generated",
        });
        const dto = await actor.get(userCtx(owner, "r2"));
        expect(dto.aiInsights).toEqual({ summary: "3 items ranked" });
        expect(dto.insightsGeneratedAt).not.toBeNull();
      });
    });

    it("has no AI provider wired by default (documents the B7 scope boundary)", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db)); // default generator
        const wines = await Promise.all(
          ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
        );
        for (const wineId of wines) {
          await actor.addItem(userCtx(owner, `add-${wineId}`), {
            entry: { type: "WINE", id: wineId },
          });
        }
        await expect(
          actor.generateInsights(systemCtx("r")),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });
  });

  describe("insights enqueue on content change only (§6 B7)", () => {
    it("addItem and removeItem enqueue generateInsights; update does not", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));

        expect(await outboxRowsFor(db, id)).toHaveLength(0);

        await actor.update(userCtx(owner, "r0"), { name: "Renamed" });
        expect(await outboxRowsFor(db, id)).toHaveLength(0);

        const wineA = await seedWine(db, owner, "A");
        const added = await actor.addItem(userCtx(owner, "r1"), {
          entry: { type: "WINE", id: wineA },
        });
        expect(await outboxRowsFor(db, id)).toHaveLength(1);

        await actor.removeItem(userCtx(owner, "r2"), added.id);

        const rows = await outboxRowsFor(db, id);
        expect(rows.every((r) => r.method === "generateInsights")).toBe(true);
      });
    });

    /**
     * The queue is one global FIFO drained serially, so rows one request
     * enqueues sit ahead of every other user's work. These two tests are the
     * bound on how many of them one request can produce.
     */
    it("a no-op reorderBand enqueues nothing and does not bump content_updated_at", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));

        const ids: string[] = [];
        for (const name of ["A", "B", "C"]) {
          const wine = await seedWine(db, owner, name);
          const item = await actor.addItem(userCtx(owner, `add-${name}`), {
            entry: { type: "WINE", id: wine },
          });
          ids.push(item.id);
        }
        // Drain what the three `addItem` calls queued, so the coalescing guard
        // below is not what is being measured.
        await db.execute(
          sql`update public.outbox set status = 'delivered' where target_id = ${id}`,
        );
        const before = await contentUpdatedAt(db, id);
        expect(await liveOutboxRowsFor(db, id)).toHaveLength(0);

        // `orderedIds` is the order the band is already in. Nothing moves.
        for (let i = 0; i < 30; i += 1) {
          await actor.reorderBand(userCtx(owner, `noop-${i}`), 0, ids);
        }

        // Thirty calls, no row moved, so: no outbox row and no content bump.
        // Before this fix each call enqueued one — thirty rows out of no state
        // change at all, and `MAX_ROOT_FIELDS` (30) is what one POST holds.
        expect(await liveOutboxRowsFor(db, id)).toHaveLength(0);
        expect(await contentUpdatedAt(db, id)).toEqual(before);
      });
    });

    it("thirty real reorders leave one live generateInsights row, not thirty", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));

        const ids: string[] = [];
        for (const name of ["A", "B", "C"]) {
          const wine = await seedWine(db, owner, name);
          const item = await actor.addItem(userCtx(owner, `add-${name}`), {
            entry: { type: "WINE", id: wine },
          });
          ids.push(item.id);
        }
        await db.execute(
          sql`update public.outbox set status = 'delivered' where target_id = ${id}`,
        );

        const order = [...ids];
        for (let i = 0; i < 30; i += 1) {
          order.push(order.shift() ?? "");
          await actor.reorderBand(userCtx(owner, `real-${i}`), 0, order);
        }

        // Every one of the thirty really did move rows, and every one bumped
        // `content_updated_at`. They still share one queued delivery, because
        // `generateInsights` recomputes from the aggregate at delivery time:
        // thirty rows would do the work of one and occupy thirty slots.
        const live = await liveOutboxRowsFor(db, id);
        expect(live).toHaveLength(1);
        expect(live[0]?.method).toBe("generateInsights");
      });
    });

    it("enqueues again once the queued delivery is no longer pending", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));

        const wineA = await seedWine(db, owner, "A");
        await actor.addItem(userCtx(owner, "r1"), {
          entry: { type: "WINE", id: wineA },
        });
        expect(await liveOutboxRowsFor(db, id)).toHaveLength(1);

        await db.execute(
          sql`update public.outbox set status = 'delivered' where target_id = ${id}`,
        );

        const wineB = await seedWine(db, owner, "B");
        await actor.addItem(userCtx(owner, "r2"), {
          entry: { type: "WINE", id: wineB },
        });
        // Coalescing bounds the *queue*, it does not drop work: once the
        // delivery is out of `pending`, the next change queues its own row.
        expect(await liveOutboxRowsFor(db, id)).toHaveLength(1);
        expect(await outboxRowsFor(db, id)).toHaveLength(2);
      });
    });

    it("does not let a row already `delivering` swallow a later change", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const id = await seedTierList(db, { createdById: owner });
        const actor = await activate(newTierListActor(id, db));

        const wineA = await seedWine(db, owner, "A");
        await actor.addItem(userCtx(owner, "r1"), {
          entry: { type: "WINE", id: wineA },
        });
        // The drainer has claimed it and is running `generateInsights` right
        // now — so it read the aggregate *before* the change below.
        await db.execute(
          sql`update public.outbox set status = 'delivering' where target_id = ${id}`,
        );

        const wineB = await seedWine(db, owner, "B");
        await actor.addItem(userCtx(owner, "r2"), {
          entry: { type: "WINE", id: wineB },
        });

        expect(await liveOutboxRowsFor(db, id)).toHaveLength(1);
        expect(await outboxRowsFor(db, id)).toHaveLength(2);
      });
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concealment: a stranger's private tier list and none answer alike           */
/* -------------------------------------------------------------------------- */

/**
 * Every method a stranger can reach, on a PRIVATE tier list and on an id that
 * names nothing: the same `{ code, message }`, id aside. `generateInsights`
 * used to read the row before checking the caller — `Forbidden` for a real
 * id, `NotFound` for a made-up one — and answers `Forbidden` for both now.
 */
describe.skipIf(skip)("TierListActor concealment", () => {
  afterAll(closeTestDb);

  const ENTRY = "00000000-0000-4000-8000-00000000abcd";
  const CALLS: readonly [
    string,
    string,
    (actor: TierListActor, ctx: Ctx) => Promise<unknown>,
  ][] = [
    ["get", "NOT_FOUND", (actor, ctx) => actor.get(ctx)],
    ["items", "NOT_FOUND", (actor, ctx) => actor.items(ctx, page)],
    ["update", "NOT_FOUND", (actor, ctx) => actor.update(ctx, { name: "x" })],
    ["delete", "NOT_FOUND", (actor, ctx) => actor.delete(ctx)],
    ["addItem", "NOT_FOUND", (actor, ctx) => actor.addItem(ctx, {} as never)],
    ["removeItem", "NOT_FOUND", (actor, ctx) => actor.removeItem(ctx, ENTRY)],
    [
      "reorderBand",
      "NOT_FOUND",
      (actor, ctx) => actor.reorderBand(ctx, 3, [ENTRY]),
    ],
    [
      "generateInsights",
      "FORBIDDEN",
      (actor, ctx) => actor.generateInsights(ctx),
    ],
  ];

  it.each(CALLS)("%s", async (_method, code, call) => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = userCtx(await seedUser(db), "r-stranger");
      const real = await seedTierList(db, {
        createdById: owner,
        privacy: "PRIVATE",
      });
      const absent = randomUUID();

      const hidden = await refusalOf(
        async () => call(await activate(newTierListActor(real, db)), stranger),
        real,
      );
      const missing = await refusalOf(
        async () =>
          call(await activate(newTierListActor(absent, db)), stranger),
        absent,
      );
      expect(hidden).toEqual(missing);
      expect(hidden.code).toBe(code);
    });
  });
});
