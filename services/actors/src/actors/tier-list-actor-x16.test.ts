/**
 * X16 — tier lists without typing, against Postgres: Add entry's sections,
 * the multi-add (one history edit), a list started from your ratings, the
 * template counts, and a grounded "Try this next".
 *
 * Each privacy claim the module doc makes is a test here: a friend's PRIVATE
 * list ranks nothing for you, a stranger's PUBLIC one is not "friends
 * ranked", and a place still under review never surfaces.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, PermissionType } from "@cellar-assistant/contracts";
import { userCtx, ValidationError } from "@cellar-assistant/contracts";
import { tierListHistory } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { TierListActor } from "./tier-list-actor.ts";
import { TierListsCollectionActor } from "./tier-lists-collection-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const newActor = (id: string, db: DbOrTx): TierListActor =>
  new TierListActor(daprClient(), new ActorId(id), db, async () => ({}));

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const seedList = async (
  db: DbOrTx,
  createdById: string,
  options: { listType?: string; privacy?: PermissionType } = {},
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.tier_lists (id, name, created_by_id, privacy, list_type)
    values (${id}::uuid, 'List', ${createdById}::uuid,
            ${options.privacy ?? "PRIVATE"}::permission_type,
            ${options.listType ?? "wine"})
  `);
  return id;
};

const seedEntry = async (
  db: DbOrTx,
  tierListId: string,
  entry: { wineId?: string; placeId?: string },
  band: number,
  position = 0,
): Promise<void> => {
  await db.execute(sql`
    insert into public.tier_list_items (id, tier_list_id, band, position, wine_id, place_id)
    values (gen_random_uuid(), ${tierListId}::uuid, ${band}, ${position},
            ${entry.wineId ?? null}::uuid, ${entry.placeId ?? null}::uuid)
  `);
};

const befriend = async (db: DbOrTx, a: string, b: string): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${a}::uuid, ${b}::uuid), (${b}::uuid, ${a}::uuid)
    on conflict do nothing
  `);
};

const seedWine = async (
  db: DbOrTx,
  createdById: string,
  name: string,
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

const seedPlace = async (
  db: DbOrTx,
  name: string,
  options: { createdBy?: string; pending?: boolean } = {},
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.places (id, name, categories, location, source)
    values (
      ${id}::uuid, ${name}, ARRAY['bar']::text[],
      ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
      'overture'
    )
  `);
  if (options.pending === true) {
    await db.execute(sql`
      update public.places
      set review_status = 'pending', created_by = ${options.createdBy ?? null}::uuid
      where id = ${id}::uuid
    `);
  }
  return id;
};

const review = async (
  db: DbOrTx,
  userId: string,
  wineId: string,
  score: number,
  at = new Date(),
): Promise<void> => {
  await db.execute(sql`
    insert into public.item_reviews (user_id, wine_id, score, created_at, updated_at)
    values (${userId}::uuid, ${wineId}::uuid, ${score}, ${at.toISOString()}, ${at.toISOString()})
  `);
};

const logDrink = async (
  db: DbOrTx,
  userId: string,
  wineId: string,
  score: number | null,
): Promise<void> => {
  await db.execute(sql`
    insert into public.check_ins (user_id, wine_id, created_by_id, group_id, score)
    values (${userId}::uuid, ${wineId}::uuid, ${userId}::uuid, gen_random_uuid(), ${score})
  `);
};

const cellarWith = async (
  db: DbOrTx,
  owner: string,
  name: string,
  wineIds: readonly string[],
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.cellars (id, name, created_by_id)
    values (${id}::uuid, ${name}, ${owner}::uuid)
  `);
  for (const wineId of wineIds) {
    await db.execute(sql`
      insert into public.cellar_items (cellar_id, created_by, wine_id)
      values (${id}::uuid, ${owner}::uuid, ${wineId}::uuid)
    `);
  }
  return id;
};

const love = async (db: DbOrTx, userId: string, wineId: string) => {
  await db.execute(sql`
    insert into public.item_favorites (user_id, wine_id)
    values (${userId}::uuid, ${wineId}::uuid)
  `);
};

/** A 768-d unit-ish vector leaning on `axis`, nudged toward `toward`. */
const vector = (axis: number, toward?: number, lean = 0.1): string => {
  const v = new Array<number>(768).fill(0);
  v[axis] = 1;
  if (toward !== undefined) v[toward] = lean;
  return `[${v.join(",")}]`;
};

const embed = async (db: DbOrTx, wineId: string, literal: string) => {
  await db.execute(sql`
    insert into public.item_vectors (wine_id, vector, embedding_model)
    values (${wineId}::uuid, ${literal}::halfvec(768), 'test-model')
  `);
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("TierListActor — X16", () => {
  afterAll(closeTestDb);

  /* ------------------------------------------------------------------ */
  /* Add entry's sections                                                */
  /* ------------------------------------------------------------------ */

  describe("addSuggestions", () => {
    it("sections: in your cellars, tasted (reviews and logs), friends ranked — none twice, none on the list", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await befriend(db, me, friend);
        const listId = await seedList(db, me);

        const owned = await seedWine(db, me, "Owned");
        const ownedAndRated = await seedWine(db, me, "Owned and rated");
        const rated = await seedWine(db, me, "Rated");
        const logged = await seedWine(db, me, "Logged");
        const friendsPick = await seedWine(db, me, "Friend's pick");
        const privatePick = await seedWine(db, me, "Friend's private pick");
        const strangersPick = await seedWine(db, me, "Stranger's pick");
        const ranked = await seedWine(db, me, "Already ranked");

        await cellarWith(db, me, "Garage", [owned, ownedAndRated]);
        await review(db, me, ownedAndRated, 4);
        await review(db, me, rated, 4.5);
        await logDrink(db, me, logged, 3);
        await logDrink(db, me, logged, null);
        await review(db, me, ranked, 5);
        await seedEntry(db, listId, { wineId: ranked }, 5);

        const friendList = await seedList(db, friend, { privacy: "FRIENDS" });
        await seedEntry(db, friendList, { wineId: friendsPick }, 5);
        await seedEntry(db, friendList, { wineId: rated }, 4, 0);
        const friendPrivate = await seedList(db, friend, {
          privacy: "PRIVATE",
        });
        await seedEntry(db, friendPrivate, { wineId: privatePick }, 5);
        const strangerList = await seedList(db, stranger, {
          privacy: "PUBLIC",
        });
        await seedEntry(db, strangerList, { wineId: strangersPick }, 5);

        const actor = await activate(newActor(listId, db));
        const rows = await actor.addSuggestions(userCtx(me, "r"));
        const bySection = (section: string) =>
          rows
            .filter((row) => row.section === section)
            .map((row) => row.entry.id);

        expect(new Set(bySection("IN_CELLARS"))).toEqual(
          new Set([owned, ownedAndRated]),
        );
        expect(new Set(bySection("TASTED"))).toEqual(new Set([rated, logged]));
        // `rated` is a friend's pick too, but Tasted claimed it first.
        expect(bySection("FRIENDS_RANKED")).toEqual([friendsPick]);

        const all = rows.map((row) => row.entry.id);
        expect(all).not.toContain(ranked);
        expect(all).not.toContain(privatePick);
        expect(all).not.toContain(strangersPick);

        const find = (id: string) => rows.find((row) => row.entry.id === id);
        expect(find(owned)).toMatchObject({
          cellarName: "Garage",
          bottleCount: 1,
          myScore: null,
        });
        expect(find(ownedAndRated)?.myScore).toBe(4);
        expect(find(rated)).toMatchObject({ myScore: 4.5, logCount: 0 });
        // No review: the newest log that carries a score.
        expect(find(logged)).toMatchObject({ myScore: 3, logCount: 2 });
        expect(find(friendsPick)).toMatchObject({
          friendId: friend,
          friendBand: 5,
          friendCount: 1,
        });
      });
    });

    it("is the owner's alone: anyone else who may see the list gets nothing", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const friend = await seedUser(db);
        await befriend(db, me, friend);
        const listId = await seedList(db, me, { privacy: "FRIENDS" });
        const wine = await seedWine(db, friend, "Theirs");
        await review(db, friend, wine, 5);
        const actor = await activate(newActor(listId, db));
        expect(await actor.addSuggestions(userCtx(friend, "r"))).toEqual([]);
      });
    });

    it("a place list: places you rated or visited, never one still under review", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const other = await seedUser(db);
        const listId = await seedList(db, me, { listType: "place" });
        const visited = await seedPlace(db, "Visited");
        const ratedPlace = await seedPlace(db, "Rated");
        const pending = await seedPlace(db, "Pending", {
          createdBy: other,
          pending: true,
        });
        await db.execute(sql`
          insert into public.user_place_interactions (user_id, place_id, is_visited, rating)
          values (${me}::uuid, ${visited}::uuid, true, null),
                 (${me}::uuid, ${ratedPlace}::uuid, false, 4),
                 (${me}::uuid, ${pending}::uuid, true, 5)
        `);
        const actor = await activate(newActor(listId, db));
        const rows = await actor.addSuggestions(userCtx(me, "r"));
        expect(rows.every((row) => row.section === "TASTED")).toBe(true);
        expect(new Set(rows.map((row) => row.entry.id))).toEqual(
          new Set([visited, ratedPlace]),
        );
        expect(rows.find((row) => row.entry.id === ratedPlace)?.myScore).toBe(
          4,
        );
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Multi-add                                                           */
  /* ------------------------------------------------------------------ */

  describe("addItems", () => {
    it("adds several in one edit, skipping what is on the list or named twice; one Undo takes them all back", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const ctx = userCtx(me, "r");
        const listId = await seedList(db, me);
        const [a, b, c] = [
          await seedWine(db, me, "A"),
          await seedWine(db, me, "B"),
          await seedWine(db, me, "C"),
        ];
        const actor = await activate(newActor(listId, db));
        await actor.addItem(ctx, { entry: { type: "WINE", id: a ?? "" } });

        const result = await actor.addItems(ctx, [
          { entry: { type: "WINE", id: a ?? "" }, band: 5 },
          { entry: { type: "WINE", id: b ?? "" }, band: 5 },
          { entry: { type: "WINE", id: c ?? "" }, band: 4 },
          { entry: { type: "WINE", id: c ?? "" }, band: 3 },
          { entry: { type: "WINE", id: randomUUID() }, band: 3 },
        ]);
        expect(result.added.map((row) => [row.entry.id, row.band])).toEqual([
          [b, 5],
          [c, 4],
        ]);
        expect(result.skipped).toBe(3);

        const log = await db
          .select({ kind: tierListHistory.kind })
          .from(tierListHistory)
          .where(eq(tierListHistory.tierListId, listId))
          .orderBy(tierListHistory.seq);
        expect(log.map((row) => row.kind)).toEqual(["ADD", "ADD"]);

        const history = await actor.editHistory(ctx);
        expect(history?.undo).toMatchObject({
          kind: "ADD",
          entry: null,
          entryCount: 2,
          toBand: null,
        });

        const step = await actor.undo(ctx);
        expect(step.applied.entryCount).toBe(2);
        const left = await actor.items(ctx, { first: 50, after: null });
        expect(left.entries.map((e) => e.node.entry.id)).toEqual([a]);

        await actor.redo(ctx);
        const back = await actor.items(ctx, { first: 50, after: null });
        expect(
          back.entries.map((e) => `${e.node.band}:${e.node.position}`),
        ).toEqual(["5:0", "4:0", "0:0"]);
      });
    });

    it("is idempotent on the ids it was given", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const ctx = userCtx(me, "r");
        const listId = await seedList(db, me);
        const wine = await seedWine(db, me, "A");
        const actor = await activate(newActor(listId, db));
        const ask = [
          {
            entry: { type: "WINE" as const, id: wine },
            band: 3,
            tierListItemId: randomUUID(),
          },
        ];
        const first = await actor.addItems(ctx, ask);
        const again = await actor.addItems(ctx, ask);
        expect(again).toEqual(first);
        expect((await actor.editHistory(ctx))?.editCount).toBe(1);
      });
    });

    it("refuses none, and more than 100", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const listId = await seedList(db, me);
        const actor = await activate(newActor(listId, db));
        await expect(
          actor.addItems(userCtx(me, "r"), []),
        ).rejects.toBeInstanceOf(ValidationError);
        const many = Array.from({ length: 101 }, () => ({
          entry: { type: "WINE" as const, id: randomUUID() },
        }));
        await expect(
          actor.addItems(userCtx(me, "r"), many),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Templates                                                           */
  /* ------------------------------------------------------------------ */

  describe("a list started from your ratings", () => {
    it("lands pre-banded, best first, as one edit that one Undo empties", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const ctx: Ctx = userCtx(me, "r");
        const top = await seedWine(db, me, "Top");
        const good = await seedWine(db, me, "Good");
        const meh = await seedWine(db, me, "Meh");
        const rerated = await seedWine(db, me, "Rerated");
        await review(db, me, good, 3);
        await review(db, me, top, 5);
        await review(db, me, meh, 2);
        await review(db, me, rerated, 2, new Date(Date.now() - 60_000));
        await review(db, me, rerated, 4.5); // the newest review counts
        await logDrink(db, me, await seedWine(db, me, "Only logged"), 5);

        const id = randomUUID();
        const actor = newActor(id, db);
        const created = await actor.create(ctx, {
          name: "My wines",
          listType: "wine",
          startFrom: "RATINGS",
        });
        expect(created.itemCount).toBe(4);
        const rows = (
          await actor.items(ctx, { first: 50, after: null })
        ).entries
          .map((e) => e.node)
          .map((row) => [row.entry.id, row.band, row.position]);
        expect(rows).toEqual([
          [top, 5, 0],
          [rerated, 5, 1],
          [good, 3, 0],
          [meh, 2, 0],
        ]);
        expect((await actor.editHistory(ctx))?.undo).toMatchObject({
          seq: 1,
          kind: "ADD",
          entryCount: 4,
        });
        await actor.undo(ctx);
        expect((await actor.get(ctx)).itemCount).toBe(0);
      });
    });

    it("starts empty when there is nothing rated, and refuses a type it cannot read", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const ctx = userCtx(me, "r");
        const actor = newActor(randomUUID(), db);
        const created = await actor.create(ctx, {
          name: "Teas",
          listType: "tea",
          startFrom: "RATINGS",
        });
        expect(created.itemCount).toBe(0);
        expect(await actor.editHistory(ctx)).toMatchObject({ editCount: 0 });

        await expect(
          newActor(randomUUID(), db).create(ctx, {
            name: "Odd",
            listType: "cars",
            startFrom: "RATINGS",
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });

    it("templates count what each type would start with", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const a = await seedWine(db, me, "A");
        const b = await seedWine(db, me, "B");
        await review(db, me, a, 4);
        await review(db, me, a, 5);
        await review(db, me, b, 3);
        const place = await seedPlace(db, "Bar");
        await db.execute(sql`
          insert into public.user_place_interactions (user_id, place_id, rating)
          values (${me}::uuid, ${place}::uuid, 4)
        `);
        const collection = await activate(
          new TierListsCollectionActor(daprClient(), new ActorId(me), db),
        );
        const counts = await collection.templates(userCtx(me, "r"));
        const of = (type: string) =>
          counts.find((row) => row.entryType === type)?.ratedCount;
        expect(of("WINE")).toBe(2);
        expect(of("PLACE")).toBe(1);
        expect(of("BEER")).toBe(0);
        expect(counts.find((row) => row.entryType === "WINE")?.listType).toBe(
          "wine",
        );
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Try this next                                                       */
  /* ------------------------------------------------------------------ */

  describe("tryNext", () => {
    it("a friend's top-band pick you have not had, and neighbours of the list's top entries — each with its reason", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const friend = await seedUser(db);
        await befriend(db, me, friend);
        const listId = await seedList(db, me);

        const anchor = await seedWine(db, me, "Barolo Cannubi");
        const near = await seedWine(db, me, "Nebbiolo Langhe");
        const far = await seedWine(db, me, "Prosecco");
        const nearButTasted = await seedWine(db, me, "Barbaresco");
        const friendTop = await seedWine(db, me, "Friend top");
        const friendMid = await seedWine(db, me, "Friend mid");
        const friendTopButOwned = await seedWine(db, me, "Friend top owned");

        await seedEntry(db, listId, { wineId: anchor }, 5);
        await embed(db, anchor, vector(0));
        await embed(db, near, vector(0, 1, 0.1));
        await embed(db, nearButTasted, vector(0, 2, 0.1));
        await embed(db, far, vector(5));
        await review(db, me, nearButTasted, 4);

        const friendList = await seedList(db, friend, { privacy: "FRIENDS" });
        await seedEntry(db, friendList, { wineId: friendTop }, 5, 0);
        await seedEntry(db, friendList, { wineId: friendMid }, 3, 0);
        await seedEntry(db, friendList, { wineId: friendTopButOwned }, 4, 0);
        await cellarWith(db, me, "Rack", [friendTopButOwned]);

        const actor = await activate(newActor(listId, db));
        const cards = await actor.tryNext(userCtx(me, "r"));
        expect(cards.map((card) => [card.reason, card.entry.id])).toEqual([
          ["FRIEND_RANKED", friendTop],
          ["LIKE_TOP", near],
        ]);
        expect(cards[0]).toMatchObject({ friendId: friend, friendBand: 5 });
        expect(cards[1]).toMatchObject({
          likeName: "Barolo Cannubi",
          likeBand: 5,
        });
      });
    });

    it("your loves seed it too, and nothing far enough away is offered", async () => {
      await withTestDb(async (db) => {
        const me = await seedUser(db);
        const listId = await seedList(db, me);
        const loved = await seedWine(db, me, "Loved one");
        const near = await seedWine(db, me, "Sibling");
        const unrelated = await seedWine(db, me, "Unrelated");
        await love(db, me, loved);
        await embed(db, loved, vector(10));
        await embed(db, near, vector(10, 11, 0.1));
        await embed(db, unrelated, vector(20));
        const actor = await activate(newActor(listId, db));
        const cards = await actor.tryNext(userCtx(me, "r"));
        expect(cards).toEqual([
          expect.objectContaining({
            reason: "LIKE_LOVED",
            entry: { type: "WINE", id: near },
            likeName: "Loved one",
            likeBand: null,
          }),
        ]);
      });
    });
  });
});
