/**
 * `CheckInActor` against a real Postgres — X02's drink log.
 *
 * What this file is for, in the order the package guidance lists it:
 *
 *   1. a log needs an item and only optionally a bottle; a bottle is checked
 *      the way `CellarActor.checkIn` checked it (an invisible cellar is
 *      `NotFound`), and the item is read off it;
 *   2. score / note / tags / place / photo / companions, each validated;
 *      companions are the old `bulkCheckIn` rule (friends only, all or
 *      nothing) and never carry the logger's opinion;
 *   3. removing the bottle keeps the log;
 *   4. `canSeeCheckIn` for a bottle-less log — drinker, companion, friend;
 *      everyone else `NotFound` with the same message as a missing id;
 *   5. a log's score never touches the review (D5);
 *   6. the flavour seam is asked through the installed suggester, and its
 *      answer writes nothing.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, ItemRef } from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { checkIns, itemReviews } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  setFlavourTagSuggester,
  unconfiguredFlavourTagSuggester,
} from "../lib/flavour-tags.ts";
import {
  seedCellar,
  seedCellarItem,
  seedFriendship,
  seedPlace,
  seedRecipe,
  seedWine,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { CellarActor } from "./cellar-actor.ts";
import { CheckInActor, requireOneTarget } from "./check-in-actor.ts";

const { skip } = await resolveTestDatabase();

const actorFor = (db: DbOrTx, id: string = randomUUID()) =>
  activate(createActor(CheckInActor, id, db));

const seedVerifiedFile = async (
  db: DbOrTx,
  uploadedBy: string,
  verified = true,
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.files (id, key, uploaded_by, verified_at, mime_type)
    values (${id}::uuid, ${`check-in-photo/${id}`}, ${uploadedBy}::uuid,
            ${verified ? new Date().toISOString() : null}::timestamptz,
            'image/jpeg')
  `);
  return id;
};

const scenario = async (db: DbOrTx) => {
  const drinker = await seedUser(db);
  const friend = await seedUser(db);
  const friendOfDrinker = await seedUser(db);
  const stranger = await seedUser(db);
  await seedFriendship(db, drinker, friend);
  await seedFriendship(db, drinker, friendOfDrinker);
  const wine: ItemRef = await seedWine(db, drinker, "Drink Log Red");
  return { drinker, friend, friendOfDrinker, stranger, wine };
};

describe.skipIf(skip)("CheckInActor (X02)", () => {
  afterAll(closeTestDb);
  afterEach(() => setFlavourTagSuggester(unconfiguredFlavourTagSuggester));

  it("is an entity actor", () => {
    expect(CheckInActor.category).toBe("entity");
  });

  describe("log", () => {
    it("logs a drink with no bottle, with every optional detail", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const placeId = await seedPlace(db, {
          name: "The Corner Bar",
          lat: 30.27,
          lng: -97.74,
        });
        const photoFileId = await seedVerifiedFile(db, drinker);
        const id = randomUUID();
        const actor = await actorFor(db, id);
        const logged = await actor.log(userCtx(drinker, "r"), {
          item: wine,
          score: 4.5,
          note: "  Dark cherry, a little smoke.  ",
          tags: ["Cherry", " smoky  ", "cherry", ""],
          placeId,
          photoFileId,
        });
        expect(logged.cellarItemId).toBeNull();
        expect(logged.rows).toEqual([{ id, userId: drinker }]);
        expect(logged.entry).toMatchObject({
          id,
          userId: drinker,
          createdById: drinker,
          item: wine,
          score: 4.5,
          note: "Dark cherry, a little smoke.",
          tags: ["cherry", "smoky"],
          placeId,
          photoFileId,
          companionIds: [],
          fromCellar: false,
        });
      });
    });

    it("is idempotent on its id: a retry answers the same rows", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        const ctx = userCtx(drinker, "r");
        const actor = await actorFor(db, id);
        const once = await actor.log(ctx, {
          item: wine,
          companionIds: [friend],
        });
        const twice = await actor.log(ctx, {
          item: wine,
          companionIds: [friend],
        });
        expect(twice).toEqual(once);
        const rows = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.groupId, id));
        expect(rows).toHaveLength(2);
      });
    });

    it("a stranger naming someone's id learns nothing; a friend is told it is not theirs", async () => {
      await withTestDb(async (db) => {
        const { drinker, friendOfDrinker, stranger, wine } = await scenario(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
        });
        const missing = randomUUID();
        const hidden = await refusalOf(
          async () =>
            (await actorFor(db, id)).log(userCtx(stranger, "r"), {
              item: wine,
            }),
          id,
        );
        const absent = await refusalOf(
          async () => (await actorFor(db, missing)).get(userCtx(stranger, "r")),
          missing,
        );
        expect(hidden).toEqual(absent);
        await expect(
          (await actorFor(db, id)).log(userCtx(friendOfDrinker, "r"), {
            item: wine,
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });

    it("reads the item off a bottle in a cellar the viewer can see", async () => {
      await withTestDb(async (db) => {
        const { drinker, stranger, wine } = await scenario(db);
        const cellarId = await seedCellar(db, {
          createdById: drinker,
          privacy: "PRIVATE",
        });
        const cellarItemId = await seedCellarItem(db, cellarId, drinker, wine);
        const logged = await (await actorFor(db)).log(userCtx(drinker, "r"), {
          bottle: { cellarId, cellarItemId },
        });
        expect(logged.entry.item).toEqual(wine);
        expect(logged.cellarItemId).toBe(cellarItemId);
        expect(logged.entry.fromCellar).toBe(true);

        // A private cellar is absent to a stranger, not forbidden.
        await expect(
          (await actorFor(db)).log(userCtx(stranger, "r"), {
            bottle: { cellarId, cellarItemId },
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
        // A bottle that is not in the named cellar is absent too.
        const otherCellar = await seedCellar(db, { createdById: drinker });
        await expect(
          (await actorFor(db)).log(userCtx(drinker, "r"), {
            bottle: { cellarId: otherCellar, cellarItemId },
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("refuses an item that disagrees with its bottle", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const other = await seedWine(db, drinker, "Another");
        const cellarId = await seedCellar(db, { createdById: drinker });
        const cellarItemId = await seedCellarItem(db, cellarId, drinker, wine);
        await expect(
          (await actorFor(db)).log(userCtx(drinker, "r"), {
            item: other,
            bottle: { cellarId, cellarItemId },
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });

    it("validates what it stores", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const ctx = userCtx(drinker, "r");
        const refused = [
          { item: wine, score: 4.2 },
          { item: wine, score: 0 },
          { item: wine, note: "x".repeat(2001) },
          { item: wine, tags: Array.from({ length: 13 }, (_, i) => `t${i}`) },
          { item: wine, tags: ["a".repeat(33)] },
          {},
        ];
        for (const input of refused) {
          await expect(
            (await actorFor(db)).log(ctx, input),
          ).rejects.toBeInstanceOf(ValidationError);
        }
        await expect(
          (await actorFor(db)).log(ctx, {
            item: { type: "WINE", id: randomUUID() },
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
        await expect(
          (await actorFor(db)).log(ctx, { item: wine, placeId: randomUUID() }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("takes only the viewer's own verified upload as the photo", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const ctx = userCtx(drinker, "r");
        const theirs = await seedVerifiedFile(db, friend);
        await expect(
          (await actorFor(db)).log(ctx, { item: wine, photoFileId: theirs }),
        ).rejects.toBeInstanceOf(NotFoundError);
        const pending = await seedVerifiedFile(db, drinker, false);
        await expect(
          (await actorFor(db)).log(ctx, { item: wine, photoFileId: pending }),
        ).rejects.toThrow(/not verified/);
      });
    });
  });

  describe("places under review (X27 / D28)", () => {
    it("refuses somebody else's unshared place exactly like a missing one", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const theirs = await seedPlace(db, {
          name: "Friend's pending bar",
          lat: 0,
          lng: 0,
          reviewStatus: "pending",
          createdBy: friend,
        });
        await expect(
          (await actorFor(db)).log(userCtx(drinker, "r"), {
            item: wine,
            placeId: theirs,
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
        const logged = await (await actorFor(db)).log(userCtx(drinker, "r"), {
          item: wine,
        });
        await expect(
          (await actorFor(db, logged.entry.id)).update(userCtx(drinker, "r"), {
            placeId: theirs,
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("takes the writer's own pending place, and names it to nobody else", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const mine = await seedPlace(db, {
          name: "My pending bar",
          lat: 0,
          lng: 0,
          reviewStatus: "pending",
          createdBy: drinker,
        });
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, note: "here", placeId: mine, companionIds: [friend] },
        );
        expect(logged.entry.placeId).toBe(mine);
        expect(
          (await (await actorFor(db, id)).get(userCtx(drinker, "r"))).placeId,
        ).toBe(mine);

        // The friend sees the log's details — but not a place they may not see,
        // on the logger's row or on their own companion row.
        const asFriend = await (await actorFor(db, id)).get(
          userCtx(friend, "r"),
        );
        expect(asFriend.note).toBe("here");
        expect(asFriend.placeId).toBeNull();
        const companionRow = logged.rows[1]?.id ?? "";
        expect(
          (await (await actorFor(db, companionRow)).get(userCtx(friend, "r")))
            .placeId,
        ).toBeNull();
      });
    });
  });

  describe("companions — the bulkCheckIn rule, kept", () => {
    it("writes one row per drinker in one occasion; only the logger's carries the opinion", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          {
            item: wine,
            score: 3,
            note: "corked",
            tags: ["musty"],
            companionIds: [friend, friend.toUpperCase(), drinker],
          },
        );
        expect(logged.rows.map((row) => row.userId)).toEqual([drinker, friend]);
        expect(logged.entry.companionIds).toEqual([friend]);

        const companionRow = logged.rows[1];
        const theirs = await (await actorFor(db, companionRow?.id ?? "")).get(
          userCtx(friend, "r"),
        );
        expect(theirs).toMatchObject({
          userId: friend,
          createdById: drinker,
          score: null,
          note: null,
          tags: [],
          companionIds: [drinker],
        });
      });
    });

    it("refuses a non-friend and writes nothing", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, stranger, wine } = await scenario(db);
        const id = randomUUID();
        await expect(
          (await actorFor(db, id)).log(userCtx(drinker, "r"), {
            item: wine,
            companionIds: [friend, stranger],
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        const rows = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.groupId, id));
        expect(rows).toEqual([]);
      });
    });

    it("logs a round for friends only, and refuses an opinion on it", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const ctx = userCtx(drinker, "r");
        const logged = await (await actorFor(db)).log(ctx, {
          item: wine,
          includeSelf: false,
          companionIds: [friend],
        });
        expect(logged.rows.map((row) => row.userId)).toEqual([friend]);
        await expect(
          (await actorFor(db)).log(ctx, {
            item: wine,
            includeSelf: false,
            companionIds: [friend],
            score: 4,
          }),
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
          (await actorFor(db)).log(ctx, { item: wine, includeSelf: false }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });
  });

  describe("visibility — canSeeCheckIn for a bottle-less log", () => {
    it("drinker, companion and the drinker's friends see it; a stranger is told it does not exist", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, friendOfDrinker, wine } = await scenario(db);
        // A companion who is not the viewer's friend: a friend of the drinker
        // only, so the companion branch is the one that admits them below.
        const companionOnly = await seedUser(db);
        await seedFriendship(db, drinker, companionOnly);
        const stranger = await seedUser(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
          companionIds: [friend, companionOnly],
        });

        for (const viewer of [
          drinker,
          friend,
          friendOfDrinker,
          companionOnly,
        ]) {
          const seen = await (await actorFor(db, id)).get(userCtx(viewer, "r"));
          expect(seen.id).toBe(id);
        }
        const missing = randomUUID();
        expect(
          await refusalOf(
            async () => (await actorFor(db, id)).get(userCtx(stranger, "r")),
            id,
          ),
        ).toEqual(
          await refusalOf(
            async () =>
              (await actorFor(db, missing)).get(userCtx(stranger, "r")),
            missing,
          ),
        );
      });
    });

    it("a removed bottle keeps the log, visible to the drinker, and drops the cellar's public way in", async () => {
      await withTestDb(async (db) => {
        const { drinker, stranger, wine } = await scenario(db);
        const cellarId = await seedCellar(db, {
          createdById: drinker,
          privacy: "PUBLIC",
        });
        const cellar = await activate(createActor(CellarActor, cellarId, db));
        const bottle = await cellar.addItem(userCtx(drinker, "r"), {
          item: wine,
        });
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          bottle: { cellarId, cellarItemId: bottle.id },
          note: "first glass",
        });
        // Public cellar: a stranger sees it through the cellar — that it was
        // drunk, not what the drinker wrote about it.
        expect(
          await (await actorFor(db, id)).get(userCtx(stranger, "r")),
        ).toMatchObject({ id, userId: drinker, note: null });

        await cellar.removeItem(userCtx(drinker, "r"), bottle.id);

        const kept = await (await actorFor(db, id)).get(userCtx(drinker, "r"));
        expect(kept).toMatchObject({ note: "first glass", fromCellar: false });
        await expect(
          (await actorFor(db, id)).get(userCtx(stranger, "r")),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });
  });

  describe("update and remove", () => {
    it("only the drinker edits; the writer of a companion row may not", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, stranger, wine } = await scenario(db);
        const logged = await (await actorFor(db)).log(userCtx(drinker, "r"), {
          item: wine,
          companionIds: [friend],
        });
        const friendRow = logged.rows[1]?.id ?? "";
        const updated = await (await actorFor(db, friendRow)).update(
          userCtx(friend, "r"),
          { score: 5, note: "lovely", tags: ["Plum"] },
        );
        expect(updated).toMatchObject({
          score: 5,
          note: "lovely",
          tags: ["plum"],
        });
        await expect(
          (await actorFor(db, friendRow)).update(userCtx(drinker, "r"), {
            score: 1,
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          (await actorFor(db, friendRow)).update(userCtx(stranger, "r"), {
            score: 1,
          }),
        ).rejects.toBeInstanceOf(NotFoundError);

        const cleared = await (await actorFor(db, friendRow)).update(
          userCtx(friend, "r"),
          { score: null, note: null, tags: [] },
        );
        expect(cleared).toMatchObject({ score: null, note: null, tags: [] });
      });
    });

    it("Undo: the writer removing the occasion takes the companion rows they wrote", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend] },
        );
        const removed = await (await actorFor(db, id)).remove(
          userCtx(drinker, "r"),
        );
        expect(removed.ids).toEqual(logged.rows.map((row) => row.id));
        const left = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.groupId, id));
        expect(left).toEqual([]);
      });
    });

    it("Undo leaves a companion row its drinker has made their own", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, friendOfDrinker, wine } = await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend, friendOfDrinker] },
        );
        const rowOf = (userId: string) =>
          logged.rows.find((row) => row.userId === userId)?.id ?? "";
        const friendRow = rowOf(friend);
        const otherRow = rowOf(friendOfDrinker);
        await (await actorFor(db, friendRow)).update(userCtx(friend, "r"), {
          note: "mine now",
        });

        // The writer may not remove the row its drinker has added to…
        await expect(
          (await actorFor(db, friendRow)).remove(userCtx(drinker, "r")),
        ).rejects.toBeInstanceOf(ForbiddenError);
        // …and removing the occasion leaves it, taking only the untouched one.
        const removed = await (await actorFor(db, id)).remove(
          userCtx(drinker, "r"),
        );
        expect(removed.ids).toEqual([id, otherRow]);
        const left = await db
          .select({ id: checkIns.id, note: checkIns.note })
          .from(checkIns)
          .where(eq(checkIns.groupId, id));
        expect(left).toEqual([{ id: friendRow, note: "mine now" }]);
      });
    });

    it("a companion removing their row takes only theirs", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, stranger, wine } = await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend] },
        );
        const friendRow = logged.rows[1]?.id ?? "";
        await expect(
          (await actorFor(db, friendRow)).remove(userCtx(stranger, "r")),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(
          (await (await actorFor(db, friendRow)).remove(userCtx(friend, "r")))
            .ids,
        ).toEqual([friendRow]);
        const left = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.groupId, id));
        expect(left.map((row) => row.id)).toEqual([id]);
      });
    });
  });

  it("D5: a log's score never touches the review", async () => {
    await withTestDb(async (db) => {
      const { drinker, wine } = await scenario(db);
      await db.execute(sql`
        insert into public.item_reviews (user_id, wine_id, score)
        values (${drinker}::uuid, ${wine.id}::uuid, 4.5)
      `);
      const id = randomUUID();
      await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
        item: wine,
        score: 2,
      });
      await (await actorFor(db, id)).update(userCtx(drinker, "r"), {
        score: 1,
      });
      const reviews = await db
        .select({ score: itemReviews.score })
        .from(itemReviews)
        .where(eq(itemReviews.wineId, wine.id));
      expect(reviews).toEqual([{ score: 4.5 }]);
    });
  });

  describe("suggestFlavourTags", () => {
    it("asks the installed suggester with the note, type and existing tags, and writes nothing", async () => {
      await withTestDb(async (db) => {
        const { drinker } = await scenario(db);
        const asked: unknown[] = [];
        setFlavourTagSuggester(async (_ctx: Ctx, request) => {
          asked.push(request);
          return {
            abstained: false,
            tags: [{ tag: "cherry", evidence: "cherry" }],
          };
        });
        const id = randomUUID();
        const answer = await (await actorFor(db, id)).suggestFlavourTags(
          userCtx(drinker, "r"),
          { note: " dark cherry ", itemType: "WINE", existing: ["smoky"] },
        );
        expect(answer.tags.map((tag) => tag.tag)).toEqual(["cherry"]);
        expect(asked).toEqual([
          { note: "dark cherry", itemType: "WINE", existing: ["smoky"] },
        ]);
        const rows = await db
          .select()
          .from(checkIns)
          .where(eq(checkIns.id, id));
        expect(rows).toEqual([]);
      });
    });

    it("says AI is unconfigured rather than inventing an answer", async () => {
      await withTestDb(async (db) => {
        const { drinker } = await scenario(db);
        await expect(
          (await actorFor(db)).suggestFlavourTags(userCtx(drinker, "r"), {
            note: "cherry",
            itemType: "WINE",
          }),
        ).rejects.toThrow(/no AI provider/);
      });
    });

    it("refuses an unknown item type", async () => {
      await withTestDb(async (db) => {
        const { drinker } = await scenario(db);
        await expect(
          (await actorFor(db)).suggestFlavourTags(userCtx(drinker, "r"), {
            note: "cherry",
            itemType: "MEAD" as never,
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });
  });

  /*
   * L44: logs outlive their recipe. The table allows a check-in whose recipe
   * was deleted (`recipe_id` set null, `check_ins_one_item` is `<= 1`), so
   * "exactly one drink" is the actor's rule on every write instead.
   */
  describe("ux-c L08 · Made it — a recipe-only log", () => {
    it("logs a recipe with no item, and Undo removes it", async () => {
      await withTestDb(async (db) => {
        const { drinker } = await scenario(db);
        const author = await seedUser(db);
        const recipeId = await seedRecipe(db, {
          name: "Made-it Negroni",
          createdById: author,
        });
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { recipeId },
        );
        expect(logged.entry.item).toBeNull();
        expect(logged.entry.recipe).toEqual({ id: recipeId });
        expect(logged.cellarItemId).toBeNull();
        const [row] = await db
          .select({ recipeId: checkIns.recipeId, wineId: checkIns.wineId })
          .from(checkIns)
          .where(eq(checkIns.id, id));
        expect(row).toEqual({ recipeId, wineId: null });

        expect(
          await (await actorFor(db, id)).remove(userCtx(drinker, "r")),
        ).toEqual({ ids: [id] });
        const restored = await (await actorFor(db, id)).restore(
          userCtx(drinker, "r"),
        );
        expect(restored.ids).toEqual([id]);
      });
    });

    it("refuses a recipe log that also names an item or a bottle", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const recipeId = await seedRecipe(db, {
          name: "Two-target sour",
          createdById: drinker,
        });
        await expect(
          (await actorFor(db)).log(userCtx(drinker, "r"), {
            recipeId,
            item: wine,
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });

    it("answers a hidden recipe exactly like a missing one", async () => {
      await withTestDb(async (db) => {
        const { drinker } = await scenario(db);
        const author = await seedUser(db);
        const hidden = await seedRecipe(db, {
          name: "Someone's private bitters",
          createdById: author,
          privacy: "PRIVATE",
        });
        const missing = randomUUID();
        const refused = async (recipeId: string) =>
          refusalOf(
            async () =>
              (await actorFor(db)).log(userCtx(drinker, "r"), { recipeId }),
            recipeId,
          );
        const forHidden = await refused(hidden);
        expect(forHidden).toEqual(await refused(missing));
        expect(forHidden.code).toBe("NOT_FOUND");
      });
    });

    it("a friend sees a log on a PUBLIC recipe, not on a PRIVATE one — told it does not exist", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, stranger } = await scenario(db);
        const open = await seedRecipe(db, {
          name: "Shared spritz",
          createdById: drinker,
        });
        const secret = await seedRecipe(db, {
          name: "Drinker's private tonic",
          createdById: drinker,
          privacy: "PRIVATE",
        });
        const openLog = randomUUID();
        const secretLog = randomUUID();
        await (await actorFor(db, openLog)).log(userCtx(drinker, "r"), {
          recipeId: open,
        });
        await (await actorFor(db, secretLog)).log(userCtx(drinker, "r"), {
          recipeId: secret,
        });

        const seen = await (await actorFor(db, openLog)).get(
          userCtx(friend, "r"),
        );
        expect(seen.recipe).toEqual({ id: open });
        // The drinker sees their own log on their own private recipe.
        expect(
          (await (await actorFor(db, secretLog)).get(userCtx(drinker, "r")))
            .recipe,
        ).toEqual({ id: secret });

        const missing = randomUUID();
        const absent = await refusalOf(
          async () => (await actorFor(db, missing)).get(userCtx(friend, "r")),
          missing,
        );
        expect(
          await refusalOf(
            async () =>
              (await actorFor(db, secretLog)).get(userCtx(friend, "r")),
            secretLog,
          ),
        ).toEqual(absent);
        // A stranger may see the PUBLIC recipe, but the log is friends-only.
        expect(
          await refusalOf(
            async () =>
              (await actorFor(db, openLog)).get(userCtx(stranger, "r")),
            openLog,
          ),
        ).toEqual(absent);
      });
    });

    it("names a companion on a recipe log only if they may see the recipe (FR-8)", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend } = await scenario(db);
        const open = await seedRecipe(db, {
          name: "Round of spritz",
          createdById: drinker,
        });
        const secret = await seedRecipe(db, {
          name: "Drinker's private amaro",
          createdById: drinker,
          privacy: "PRIVATE",
        });

        // On a recipe the friend may see: both rows, and the friend sees theirs.
        const openLog = randomUUID();
        const logged = await (await actorFor(db, openLog)).log(
          userCtx(drinker, "r"),
          { recipeId: open, companionIds: [friend] },
        );
        expect(logged.entry.recipe).toEqual({ id: open });

        // On a private one: refused, and nothing is written.
        const secretLog = randomUUID();
        await expect(
          (await actorFor(db, secretLog)).log(userCtx(drinker, "r"), {
            recipeId: secret,
            companionIds: [friend],
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        const written = await db
          .select({ id: checkIns.id })
          .from(checkIns)
          .where(eq(checkIns.recipeId, secret));
        expect(written).toEqual([]);

        // Nor can they be added after the fact.
        const alone = randomUUID();
        await (await actorFor(db, alone)).log(userCtx(drinker, "r"), {
          recipeId: secret,
        });
        await expect(
          (await actorFor(db, alone)).setCompanions(userCtx(drinker, "r"), {
            companionIds: [friend],
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        const rows = await db
          .select({ userId: checkIns.userId })
          .from(checkIns)
          .where(eq(checkIns.recipeId, secret));
        expect(rows).toEqual([{ userId: drinker }]);
      });
    });

    it("a log whose recipe was deleted stays, naming nothing", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend } = await scenario(db);
        const recipeId = await seedRecipe(db, {
          name: "Soon-gone flip",
          createdById: drinker,
        });
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          recipeId,
        });
        await db.execute(
          sql`delete from public.recipes where id = ${recipeId}::uuid`,
        );
        const seen = await (await actorFor(db, id)).get(userCtx(friend, "r"));
        expect(seen).toMatchObject({ item: null, recipe: null });
      });
    });
  });

  describe("L44 · exactly one target on every write", () => {
    it("requireOneTarget admits one item or one recipe, and nothing else", () => {
      const none = {
        wineId: null,
        beerId: null,
        spiritId: null,
        coffeeId: null,
        sakeId: null,
        teaId: null,
        recipeId: null,
      };
      expect(() => requireOneTarget({ ...none, wineId: "w" })).not.toThrow();
      expect(() => requireOneTarget({ ...none, recipeId: "r" })).not.toThrow();
      expect(() => requireOneTarget(none)).toThrow(ValidationError);
      expect(() =>
        requireOneTarget({ ...none, teaId: "t", recipeId: "r" }),
      ).toThrow(ValidationError);
    });

    it("the table keeps a log whose drink has gone, and update refuses to write to it", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
          score: 3,
        });
        // What `ON DELETE SET NULL` leaves behind once a recipe goes; the
        // widened check allows it.
        await db.execute(
          sql`update public.check_ins set wine_id = null where id = ${id}::uuid`,
        );
        await expect(
          (await actorFor(db, id)).update(userCtx(drinker, "r"), { score: 5 }),
        ).rejects.toBeInstanceOf(ValidationError);
        const [row] = await db
          .select({ score: checkIns.score })
          .from(checkIns)
          .where(eq(checkIns.id, id));
        expect(row?.score).toBe(3);
      });
    });

    it("the table refuses two targets: an item and a recipe", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const recipeId = await seedRecipe(db, {
          name: "L44 sour",
          createdById: drinker,
        });
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
        });
        await expect(
          db.transaction((sp) =>
            sp.execute(
              sql`update public.check_ins set recipe_id = ${recipeId}::uuid where id = ${id}::uuid`,
            ),
          ),
        ).rejects.toThrow();
      });
    });

    it("restore refuses to bring back a log with nothing to log against", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
        });
        await (await actorFor(db, id)).remove(userCtx(drinker, "r"));
        await db.execute(sql`
          update public.check_in_trash
          set row = jsonb_set(row, '{wineId}', 'null'::jsonb)
          where removal_id = ${id}::uuid
        `);
        await expect(
          (await actorFor(db, id)).restore(userCtx(drinker, "r")),
        ).rejects.toBeInstanceOf(ConflictError);
        const rows = await db
          .select({ id: checkIns.id })
          .from(checkIns)
          .where(eq(checkIns.id, id));
        expect(rows).toEqual([]);
      });
    });
  });
});
