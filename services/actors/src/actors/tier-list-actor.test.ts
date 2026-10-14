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
 *      stale activations of the same id do not" (since D4 the second one's
 *      write is refused by the history log's unique `seq` rather than
 *      corrupting the board), which is exactly the failure mode the
 *      guarantee rules out in production.
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
  BudgetExceededError,
  ConflictError,
  ForbiddenError,
  NO_AI_CAPABILITIES,
  NotFoundError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  outbox,
  tierListHistory,
  tierListItems,
  tierLists,
} from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { setAiCapabilities } from "../lib/ai/capabilities.ts";
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
        });
        expect(updated.name).toBe("Renamed");
        // X16: the padlock is retired — Arrange replaced it — so the DTO no
        // longer carries it (the column stays until a contract migration).
        expect(updated).not.toHaveProperty("isEditingLocked");
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

  describe("places under review (X27)", () => {
    const makeUnshared = async (db: DbOrTx, creator: string, name: string) => {
      const id = await seedPlace(db, name);
      await db.execute(sql`
        update public.places
        set review_status = 'pending', created_by = ${creator}::uuid
        where id = ${id}::uuid
      `);
      return id;
    };

    it("a creator may rank their own pending place; anybody else naming it gets the NotFound an unknown id gets", async () => {
      await withTestDb(async (db) => {
        const creator = await seedUser(db);
        const stranger = await seedUser(db);
        const pending = await makeUnshared(db, creator, "Pending Bar");

        const mine = await activate(
          newTierListActor(
            await seedTierList(db, { createdById: creator }),
            db,
          ),
        );
        const added = await mine.addItem(userCtx(creator, "r1"), {
          entry: { type: "PLACE", id: pending },
        });
        expect(added.entry).toEqual({ type: "PLACE", id: pending });

        const theirs = await activate(
          newTierListActor(
            await seedTierList(db, { createdById: stranger }),
            db,
          ),
        );
        const hidden = await theirs
          .addItem(userCtx(stranger, "r2"), {
            entry: { type: "PLACE", id: pending },
          })
          .catch((error: unknown) => error);
        const absentId = randomUUID();
        const absent = await theirs
          .addItem(userCtx(stranger, "r3"), {
            entry: { type: "PLACE", id: absentId },
          })
          .catch((error: unknown) => error);
        expect(hidden).toBeInstanceOf(NotFoundError);
        expect(absent).toBeInstanceOf(NotFoundError);
        expect(String((hidden as Error).message).replace(pending, "<id>")).toBe(
          String((absent as Error).message).replace(absentId, "<id>"),
        );
      });
    });

    it("a public list's entry for its creator's pending place is shown to the creator and silently left out for everyone else", async () => {
      await withTestDb(async (db) => {
        const creator = await seedUser(db);
        const stranger = await seedUser(db);
        const pending = await makeUnshared(db, creator, "Pending Bar");
        const shared = await seedPlace(db, "Shared Bar");
        const id = await seedTierList(db, {
          createdById: creator,
          privacy: "PUBLIC",
        });
        const actor = await activate(newTierListActor(id, db));
        for (const placeId of [pending, shared]) {
          await actor.addItem(userCtx(creator, `r-${placeId}`), {
            entry: { type: "PLACE", id: placeId },
          });
        }

        const forCreator = await actor.items(userCtx(creator, "r1"), page);
        expect(forCreator.entries.map((e) => e.node.entry.id).sort()).toEqual(
          [pending, shared].sort(),
        );
        const forStranger = await actor.items(userCtx(stranger, "r2"), page);
        expect(forStranger.entries.map((e) => e.node.entry.id)).toEqual([
          shared,
        ]);

        // …and the count agrees with the rows: "2 entries" over one row would
        // say a hidden place is on the list.
        expect((await actor.get(userCtx(creator, "r3"))).itemCount).toBe(2);
        expect((await actor.get(userCtx(stranger, "r4"))).itemCount).toBe(1);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* getShared — the X17 public share page                               */
  /* ------------------------------------------------------------------ */

  describe("getShared (X17): PUBLIC only, the same answer for every caller", () => {
    it("describes a PUBLIC list's entries for an anonymous caller", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db, { displayName: "Riley" });
        const id = await seedTierList(db, {
          createdById: owner,
          privacy: "PUBLIC",
          name: "Fridge beers",
        });
        const actor = await activate(newTierListActor(id, db));
        const wineId = await seedWine(db, owner, "Ridge Monte Bello");
        const placeId = await seedPlace(db, "The Wine Bar");
        await actor.addItem(userCtx(owner, "r1"), {
          entry: { type: "WINE", id: wineId },
          band: 5,
          notes: "the benchmark",
        });
        await actor.addItem(userCtx(owner, "r2"), {
          entry: { type: "PLACE", id: placeId },
          band: 3,
        });
        // A public photo of the wine, and a newer private one that must lose.
        const publicFile = randomUUID();
        const privateFile = randomUUID();
        for (const [fileId, isPublic] of [
          [publicFile, true],
          [privateFile, false],
        ] as const) {
          await db.execute(sql`
            insert into public.files (id, bucket, key, uploaded_by, verified_at)
            values (${fileId}::uuid, 'cellar-files', ${`item-image/${fileId}`},
                    ${owner}::uuid, now())
          `);
          await db.execute(sql`
            insert into public.item_image (file_id, user_id, wine_id, is_public, created_at)
            values (${fileId}::uuid, ${owner}::uuid, ${wineId}::uuid, ${isPublic},
                    now() + ${isPublic ? "0 seconds" : "1 minute"}::interval)
          `);
        }

        const shared = await actor.getShared(anonymousCtx("r-anon"));
        expect(shared).toMatchObject({
          id,
          name: "Fridge beers",
          privacy: "PUBLIC",
          ownerDisplayName: "Riley",
        });
        expect(shared.entries).toEqual([
          expect.objectContaining({
            band: 5,
            entryType: "WINE",
            entryId: wineId,
            name: "Ridge Monte Bello",
            notes: "the benchmark",
            imageFileId: publicFile,
          }),
          expect.objectContaining({
            band: 3,
            entryType: "PLACE",
            entryId: placeId,
            name: "The Wine Bar",
            imageFileId: null,
          }),
        ]);
        // Nothing viewer-relative or internal crosses.
        const serialised = JSON.stringify(shared);
        expect(serialised).not.toContain(owner);
        expect(serialised).not.toContain(privateFile);
        expect(shared).not.toHaveProperty("aiInsights");
      });
    });

    it("never prints an email-shaped display name", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db, { displayName: "riley@example.com" });
        const id = await seedTierList(db, {
          createdById: owner,
          privacy: "PUBLIC",
        });
        const actor = await activate(newTierListActor(id, db));
        expect(
          (await actor.getShared(anonymousCtx("r"))).ownerDisplayName,
        ).toBeNull();
      });
    });

    it.each(["PRIVATE", "FRIENDS"] as const)(
      "%s: refused to everyone — owner and friend included — exactly as a missing list",
      async (privacy) => {
        await withTestDb(async (db) => {
          const owner = await seedUser(db);
          const friend = await seedUser(db);
          await seedFriendship(db, owner, friend);
          await seedFriendship(db, friend, owner);
          const id = await seedTierList(db, { createdById: owner, privacy });
          const absent = randomUUID();
          const missing = await refusalOf(
            async () =>
              (await activate(newTierListActor(absent, db))).getShared(
                anonymousCtx("r"),
              ),
            absent,
          );
          for (const ctx of [
            anonymousCtx("r"),
            userCtx(owner, "r"),
            userCtx(friend, "r"),
          ]) {
            const refused = await refusalOf(
              async () =>
                (await activate(newTierListActor(id, db))).getShared(ctx),
              id,
            );
            expect(refused).toEqual(missing);
          }
          // The signed-in path is unchanged: the owner still reads it there.
          const actor = await activate(newTierListActor(id, db));
          await expect(actor.get(userCtx(owner, "r"))).resolves.toMatchObject({
            id,
          });
        });
      },
    );
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

    it("shows why the guarantee matters: a second, stale activation's write is refused, not merged", async () => {
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
        // every call into it.
        const stale1 = await activate(newTierListActor(id, db));
        const stale2 = await activate(newTierListActor(id, db));

        // Both computed their reorder from the *same* pre-write snapshot.
        await stale1.reorderBand(userCtx(owner, "r1"), 0, [c.id, b.id, a.id]);

        // Before D4, stale2's write landed: `#writePositions` skips a row
        // its own stale cache already shows in place, so `c` kept stale1's
        // position 0 while `b` was written to 0 too — two rows sharing one
        // position, the invariant `reorderBand` exists to keep. Every
        // recorded edit now also appends `tier_list_history` row
        // `lastSeq + 1`, and `(tier_list_id, seq)` is unique: stale2's
        // snapshot names the same next `seq` stale1 just took, so its whole
        // transaction is refused instead of merged. The log is not a
        // substitute for the guarantee (`update` writes no history), but a
        // stale edit now fails loudly rather than corrupting the board.
        await expect(
          stale2.reorderBand(userCtx(owner, "r2"), 0, [b.id, a.id, c.id]),
        ).rejects.toBeInstanceOf(ConflictError);

        const rows = await db
          .select({ id: tierListItems.id, position: tierListItems.position })
          .from(tierListItems)
          .where(eq(tierListItems.tierListId, id))
          .orderBy(tierListItems.position);
        expect(rows).toEqual([
          { id: c.id, position: 0 },
          { id: b.id, position: 1 },
          { id: a.id, position: 2 },
        ]);

        // The refusal also rebuilt stale2's cache, so it is not wedged: the
        // retry computes from the list as it now is, and lands cleanly.
        await stale2.reorderBand(userCtx(owner, "r3"), 0, [b.id, a.id, c.id]);
        const retried = await db
          .select({ id: tierListItems.id, position: tierListItems.position })
          .from(tierListItems)
          .where(eq(tierListItems.tierListId, id))
          .orderBy(tierListItems.position);
        expect(retried).toEqual([
          { id: b.id, position: 0 },
          { id: a.id, position: 1 },
          { id: c.id, position: 2 },
        ]);
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

  /* ------------------------------------------------------------------ */
  /* N07: insightsStatus                                                  */
  /* ------------------------------------------------------------------ */

  describe("insightsStatus (N07)", () => {
    const withInsightsAvailable = async <T>(
      available: boolean,
      run: () => Promise<T>,
    ): Promise<T> => {
      setAiCapabilities({
        ...NO_AI_CAPABILITIES,
        tierListInsights: available,
      });
      try {
        return await run();
      } finally {
        setAiCapabilities(NO_AI_CAPABILITIES);
      }
    };

    const seedThree = async (
      db: DbOrTx,
      actor: TierListActor,
      owner: string,
    ): Promise<void> => {
      const wines = await Promise.all(
        ["A", "B", "C"].map((n) => seedWine(db, owner, n)),
      );
      for (const wineId of wines) {
        await actor.addItem(userCtx(owner, `add-${wineId}`), {
          entry: { type: "WINE", id: wineId },
        });
      }
    };

    it("goes NOT_ENOUGH_ENTRIES → PENDING → READY, never a guess", async () => {
      await withInsightsAvailable(true, () =>
        withTestDb(async (db) => {
          const owner = await seedUser(db);
          const id = await seedTierList(db, { createdById: owner });
          const actor = await activate(
            newTierListActor(id, db, async () => ({ summary: "ok" })),
          );
          const viewer = userCtx(owner, "read");
          expect((await actor.get(viewer)).insightsStatus).toBe(
            "NOT_ENOUGH_ENTRIES",
          );

          await seedThree(db, actor, owner);
          expect(await actor.get(viewer)).toMatchObject({
            insightsStatus: "PENDING",
            insightsFailureReason: null,
          });

          await actor.generateInsights(systemCtx("deliver"));
          expect((await actor.get(viewer)).insightsStatus).toBe("READY");
        }),
      );
    });

    it("is UNAVAILABLE, not PENDING, when no AI provider is installed", async () => {
      await withInsightsAvailable(false, () =>
        withTestDb(async (db) => {
          const owner = await seedUser(db);
          const id = await seedTierList(db, { createdById: owner });
          const actor = await activate(newTierListActor(id, db));
          await seedThree(db, actor, owner);
          expect((await actor.get(userCtx(owner, "r"))).insightsStatus).toBe(
            "UNAVAILABLE",
          );
        }),
      );
    });

    it("records a failed attempt with its reason and retry time, and still fails the delivery", async () => {
      await withInsightsAvailable(true, () =>
        withTestDb(async (db) => {
          const owner = await seedUser(db);
          const id = await seedTierList(db, { createdById: owner });
          const refusal = new BudgetExceededError(
            "per-user cap reached",
            "USER_CAP",
            new Date(Date.now() + 30 * 60_000).toISOString(),
          );
          const actor = await activate(
            newTierListActor(id, db, async () => {
              throw refusal;
            }),
          );
          await seedThree(db, actor, owner);

          await expect(
            actor.generateInsights(systemCtx("deliver")),
          ).rejects.toBe(refusal);
          expect(await actor.get(userCtx(owner, "r"))).toMatchObject({
            insightsStatus: "FAILED",
            insightsFailureReason: "USER_CAP",
            insightsRetryAt: refusal.retryAt,
          });

          const [row] = await db
            .select({ failure: tierLists.insightsFailure })
            .from(tierLists)
            .where(eq(tierLists.id, id));
          expect(row?.failure).toMatch(/^BUDGET_EXCEEDED\[USER_CAP\]: /);
        }),
      );
    });

    it("tells only the creator that their own allowance ran out", async () => {
      await withInsightsAvailable(true, () =>
        withTestDb(async (db) => {
          const owner = await seedUser(db);
          const stranger = await seedUser(db);
          const id = await seedTierList(db, {
            createdById: owner,
            privacy: "PUBLIC",
          });
          const actor = await activate(
            newTierListActor(id, db, async () => {
              throw new BudgetExceededError(
                "per-user cap reached",
                "USER_CAP",
                new Date(Date.now() + 30 * 60_000).toISOString(),
              );
            }),
          );
          await seedThree(db, actor, owner);
          await expect(
            actor.generateInsights(systemCtx("deliver")),
          ).rejects.toBeInstanceOf(BudgetExceededError);

          // The creator's usage window is theirs: another viewer sees a
          // failure, with no reason and no time read off it.
          expect(await actor.get(userCtx(stranger, "r"))).toMatchObject({
            insightsStatus: "FAILED",
            insightsFailureReason: null,
            insightsRetryAt: null,
          });
          expect(
            (await actor.get(userCtx(owner, "r"))).insightsFailureReason,
          ).toBe("USER_CAP");
        }),
      );
    });

    it("clears the failure when a later attempt succeeds", async () => {
      await withInsightsAvailable(true, () =>
        withTestDb(async (db) => {
          const owner = await seedUser(db);
          const id = await seedTierList(db, { createdById: owner });
          let fail = true;
          const actor = await activate(
            newTierListActor(id, db, async () => {
              if (fail) throw new ConflictError("unreachable");
              return { summary: "ok" };
            }),
          );
          await seedThree(db, actor, owner);
          await expect(
            actor.generateInsights(systemCtx("one")),
          ).rejects.toBeInstanceOf(ConflictError);
          fail = false;
          await actor.generateInsights(systemCtx("two"));
          expect(await actor.get(userCtx(owner, "r"))).toMatchObject({
            insightsStatus: "READY",
            insightsFailureReason: null,
            insightsRetryAt: null,
          });
        }),
      );
    });

    it("a change inside the 24h throttle queues the refresh for when it lifts", async () => {
      await withInsightsAvailable(true, () =>
        withTestDb(async (db) => {
          const owner = await seedUser(db);
          const generatedAt = new Date(Date.now() - 60 * 60_000); // an hour ago
          const id = await seedTierList(db, {
            createdById: owner,
            insightsGeneratedAt: generatedAt,
          });
          const actor = await activate(
            newTierListActor(id, db, async () => ({ summary: "ok" })),
          );
          await seedThree(db, actor, owner);
          // The rows the adds queued have been delivered: this is that
          // delivery, arriving inside the throttle.
          await db
            .update(outbox)
            .set({ status: "delivered" })
            .where(eq(outbox.targetId, id));

          const result = await actor.generateInsights(systemCtx("deliver"));
          expect(result.reason).toBe("throttled");

          const [deferred] = await db
            .select({ runAfter: outbox.runAfter })
            .from(outbox)
            .where(and(eq(outbox.targetId, id), eq(outbox.status, "pending")));
          const lifts = generatedAt.getTime() + 24 * 60 * 60_000;
          expect(
            Math.abs((deferred?.runAfter.getTime() ?? 0) - lifts),
          ).toBeLessThan(60_000);

          const dto = await actor.get(userCtx(owner, "r"));
          expect(dto.insightsStatus).toBe("PENDING");
          expect(Date.parse(dto.insightsRetryAt ?? "")).toBe(lifts);
        }),
      );
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
    ["getShared", "NOT_FOUND", (actor, ctx) => actor.getShared(ctx)],
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
    ["editHistory", "NOT_FOUND", (actor, ctx) => actor.editHistory(ctx)],
    ["undo", "NOT_FOUND", (actor, ctx) => actor.undo(ctx, 1)],
    ["redo", "NOT_FOUND", (actor, ctx) => actor.redo(ctx, 1)],
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

/* -------------------------------------------------------------------------- */
/* D4 — the edit history: every edit recorded, Undo and Redo replayed         */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("TierListActor edit history (D4)", () => {
  afterAll(closeTestDb);

  /** Where every entry stands, as `band:name` per band in order. */
  const board = async (actor: TierListActor, ctx: Ctx) => {
    const rows = (await actor.items(ctx, page)).entries.map((e) => e.node);
    return rows
      .slice()
      .sort((a, b) => b.band - a.band || a.position - b.position)
      .map((row) => `${row.band}:${row.position}:${row.entry.id}`);
  };

  const setup = async (db: DbOrTx, names = ["A", "B", "C"]) => {
    const owner = await seedUser(db);
    const id = await seedTierList(db, { createdById: owner });
    const actor = await activate(newTierListActor(id, db));
    const wines = [];
    for (const name of names) wines.push(await seedWine(db, owner, name));
    return { owner, id, actor, wines, ctx: userCtx(owner, "r-owner") };
  };

  /** Undo / Redo the way the page does: naming the step its history shows. */
  const undoTop = async (actor: TierListActor, ctx: Ctx) =>
    actor.undo(ctx, (await actor.editHistory(ctx))?.undo?.seq ?? -1);
  const redoTop = async (actor: TierListActor, ctx: Ctx) =>
    actor.redo(ctx, (await actor.editHistory(ctx))?.redo?.seq ?? -1);

  it("a stale tab cannot undo or redo an edit it never saw (expectedSeq)", async () => {
    await withTestDb(async (db) => {
      const { id, actor, wines, ctx } = await setup(db);
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[0] ?? "" } });
      // Tab A reads the history: its Undo button names edit 1.
      const tabA = await actor.editHistory(ctx);
      expect(tabA?.undo?.seq).toBe(1);

      // Tab B (another device) adds a second wine — edit 2.
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[1] ?? "" } });
      const logBefore = await db
        .select({ seq: tierListHistory.seq })
        .from(tierListHistory)
        .where(eq(tierListHistory.tierListId, id));

      // Tab A's Undo still names edit 1. It used to take back edit 2.
      const refused = await actor.undo(ctx, tabA?.undo?.seq ?? 0).then(
        () => null,
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(ConflictError);
      expect(refused).toMatchObject({ reason: "TIER_LIST_HISTORY_MOVED" });
      // Nothing written: both wines still ranked, no UNDO row.
      expect(await board(actor, ctx)).toHaveLength(2);
      expect(
        await db
          .select({ seq: tierListHistory.seq })
          .from(tierListHistory)
          .where(eq(tierListHistory.tierListId, id)),
      ).toHaveLength(logBefore.length);

      // Naming the edit on top works, and Redo is held to the same rule.
      const step = await actor.undo(ctx, 2);
      expect(step.applied).toMatchObject({ seq: 2, kind: "ADD" });
      expect(step.history.redo?.seq).toBe(2);
      await expect(actor.redo(ctx, 1)).rejects.toMatchObject({
        code: "CONFLICT",
        reason: "TIER_LIST_HISTORY_MOVED",
      });
      await expect(actor.redo(ctx, 2)).resolves.toMatchObject({
        applied: { seq: 2 },
      });
      // An undo naming no step at all is malformed, not a conflict.
      for (const bad of [0, -1, 1.5, Number.NaN, "2" as never]) {
        await expect(actor.undo(ctx, bad)).rejects.toBeInstanceOf(
          ValidationError,
        );
      }
    });
  });

  it("records every edit, and nothing for a no-op reorder", async () => {
    await withTestDb(async (db) => {
      const { id, actor, wines, ctx } = await setup(db);
      const added = [];
      for (const wineId of wines) {
        added.push(
          await actor.addItem(ctx, { entry: { type: "WINE", id: wineId } }),
        );
      }
      const ids = added.map((row) => row.id);
      await actor.reorderBand(ctx, 0, ids); // already in this order
      await actor.reorderBand(ctx, 5, [ids[2] ?? ""]);
      await actor.removeItem(ctx, ids[0] ?? "");

      const log = await db
        .select({ seq: tierListHistory.seq, kind: tierListHistory.kind })
        .from(tierListHistory)
        .where(eq(tierListHistory.tierListId, id))
        .orderBy(tierListHistory.seq);
      expect(log).toEqual([
        { seq: 1, kind: "ADD" },
        { seq: 2, kind: "ADD" },
        { seq: 3, kind: "ADD" },
        { seq: 4, kind: "MOVE" },
        { seq: 5, kind: "REMOVE" },
      ]);
      const history = await actor.editHistory(ctx);
      expect(history).toMatchObject({
        editCount: 5,
        undo: {
          seq: 5,
          kind: "REMOVE",
          entry: { type: "WINE", id: wines[0] },
          entryName: "A",
          fromBand: 0,
          toBand: null,
        },
        redo: null,
      });
    });
  });

  it("undoes and redoes a removal, back at its own place and id", async () => {
    await withTestDb(async (db) => {
      const { actor, wines, ctx } = await setup(db);
      const rows = [];
      for (const wineId of wines) {
        rows.push(
          await actor.addItem(ctx, {
            entry: { type: "WINE", id: wineId },
            band: 3,
            notes: wineId === wines[1] ? "the middle one" : null,
          }),
        );
      }
      const middle = rows[1];
      if (middle === undefined) throw new Error("fixture");
      const before = await board(actor, ctx);
      await actor.removeItem(ctx, middle.id);
      expect(await board(actor, ctx)).toHaveLength(2);

      const step = await undoTop(actor, ctx);
      expect(step.applied).toMatchObject({ kind: "REMOVE", entryName: "B" });
      expect(step.history.redo).toMatchObject({ kind: "REMOVE" });
      expect(await board(actor, ctx)).toEqual(before);
      const restored = (await actor.items(ctx, page)).entries.find(
        (e) => e.node.id === middle.id,
      );
      expect(restored?.node.notes).toBe("the middle one");

      await redoTop(actor, ctx);
      expect(await board(actor, ctx)).toEqual(
        before
          .filter((cell) => !cell.endsWith(String(wines[1])))
          .map((cell, index) => cell.replace(/^3:\d+:/, `3:${index}:`)),
      );
    });
  });

  it("undoes an add, and a cross-band move back into both bands", async () => {
    await withTestDb(async (db) => {
      const { actor, wines, ctx } = await setup(db);
      const rows = [];
      for (const wineId of wines) {
        rows.push(
          await actor.addItem(ctx, { entry: { type: "WINE", id: wineId } }),
        );
      }
      const start = await board(actor, ctx);
      const first = rows[0];
      if (first === undefined) throw new Error("fixture");
      await actor.reorderBand(ctx, 5, [first.id]);
      expect((await actor.editHistory(ctx))?.undo).toMatchObject({
        kind: "MOVE",
        entry: { id: wines[0] },
        fromBand: 0,
        toBand: 5,
      });

      await undoTop(actor, ctx);
      expect(await board(actor, ctx)).toEqual(start);

      // Undo the third ADD too: the newest add leaves, the rest stay put.
      await undoTop(actor, ctx);
      expect(await board(actor, ctx)).toEqual(start.slice(0, 2));
      expect(await actor.editHistory(ctx)).toMatchObject({
        undo: { kind: "ADD", entry: { id: wines[1] } },
        redo: { kind: "ADD", entry: { id: wines[2] } },
      });

      // Redo both, in order.
      await redoTop(actor, ctx);
      expect(await board(actor, ctx)).toEqual(start);
      await redoTop(actor, ctx);
      expect((await board(actor, ctx))[0]).toBe(`5:0:${wines[0]}`);
      expect((await actor.editHistory(ctx))?.redo).toBeNull();
    });
  });

  it("a new edit after an undo clears redo; nothing to undo is a conflict", async () => {
    await withTestDb(async (db) => {
      const { actor, wines, ctx } = await setup(db);
      await expect(actor.undo(ctx, 1)).rejects.toBeInstanceOf(ConflictError);
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[0] ?? "" } });
      await undoTop(actor, ctx);
      expect((await actor.editHistory(ctx))?.redo).not.toBeNull();
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[1] ?? "" } });
      expect(await actor.editHistory(ctx)).toMatchObject({
        editCount: 2,
        redo: null,
      });
      await expect(actor.redo(ctx, 2)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("survives a new activation — the stacks are a replay of the log", async () => {
    await withTestDb(async (db) => {
      const { id, actor, wines, ctx } = await setup(db);
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[0] ?? "" } });
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[1] ?? "" } });
      await undoTop(actor, ctx);

      const fresh = await activate(newTierListActor(id, db));
      expect(await fresh.editHistory(ctx)).toMatchObject({
        editCount: 2,
        undo: { kind: "ADD", entry: { id: wines[0] } },
        redo: { kind: "ADD", entry: { id: wines[1] } },
      });
      await redoTop(fresh, ctx);
      expect(await board(fresh, ctx)).toHaveLength(2);
    });
  });

  it("is the owner's alone: a friend sees null and may not undo", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      await seedFriendship(db, owner, friend);
      const id = await seedTierList(db, {
        createdById: owner,
        privacy: "FRIENDS",
      });
      const actor = await activate(newTierListActor(id, db));
      const wineId = await seedWine(db, owner);
      await actor.addItem(userCtx(owner, "r"), {
        entry: { type: "WINE", id: wineId },
      });
      const friendCtx = userCtx(friend, "r-friend");
      expect(await actor.editHistory(friendCtx)).toBeNull();
      await expect(actor.undo(friendCtx, 1)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  it("an edit whose snapshot no longer parses is stepped past, not thrown on after commit", async () => {
    await withTestDb(async (db) => {
      const { id, owner, wines, ctx } = await setup(db);
      const first = await activate(newTierListActor(id, db));
      await first.addItem(ctx, { entry: { type: "WINE", id: wines[0] ?? "" } });
      // A row the actor never writes (a hand edit): an ADD with no snapshot.
      await db.insert(tierListHistory).values({
        tierListId: id,
        seq: 2,
        kind: "ADD",
        targetSeq: null,
        change: {},
        userId: owner,
      });
      const fresh = await activate(newTierListActor(id, db));
      const before = await board(fresh, ctx);
      // The history names it (by seq and kind), so the page can offer the
      // step — Undo takes the seq it names.
      expect((await fresh.editHistory(ctx))?.undo).toMatchObject({
        seq: 2,
        kind: "ADD",
        entryName: null,
      });

      const step = await undoTop(fresh, ctx);
      expect(step.applied).toMatchObject({
        seq: 2,
        kind: "ADD",
        entry: null,
        entryName: null,
      });
      // Nothing to apply, so the board is as it was — and the stacks moved:
      // the next Undo is the real add beneath it.
      expect(await board(fresh, ctx)).toEqual(before);
      expect(step.history.undo).toMatchObject({ seq: 1, kind: "ADD" });
      const log = await db
        .select({ seq: tierListHistory.seq, kind: tierListHistory.kind })
        .from(tierListHistory)
        .where(eq(tierListHistory.tierListId, id))
        .orderBy(tierListHistory.seq);
      expect(log.at(-1)).toEqual({ seq: 3, kind: "UNDO" });
    });
  });

  it("the log is append-only: an UPDATE is refused by the database", async () => {
    await withTestDb(async (db) => {
      const { id, actor, wines, ctx } = await setup(db);
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[0] ?? "" } });
      const refused = await db
        .execute(sql`
          update public.tier_list_history set kind = 'MOVE'
          where tier_list_id = ${id}::uuid
        `)
        .then(
          () => null,
          (error: unknown) => error,
        );
      // Drizzle wraps the driver's error; the trigger's words are its cause.
      expect(String((refused as { cause?: unknown })?.cause)).toMatch(
        /append-only/,
      );
    });
  });

  it("an undo bumps content and asks for insights, like any edit", async () => {
    await withTestDb(async (db) => {
      const { id, actor, wines, ctx } = await setup(db);
      await actor.addItem(ctx, { entry: { type: "WINE", id: wines[0] ?? "" } });
      const before = await contentUpdatedAt(db, id);
      await db.execute(
        sql`update public.outbox set status = 'delivered' where target_id = ${id}`,
      );
      await undoTop(actor, ctx);
      const after = await contentUpdatedAt(db, id);
      expect(after?.getTime()).toBeGreaterThanOrEqual(before?.getTime() ?? 0);
      expect(await liveOutboxRowsFor(db, id)).toHaveLength(1);
    });
  });
});
