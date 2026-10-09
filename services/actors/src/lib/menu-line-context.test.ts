/**
 * X07 — `MenuScansCollectionActor.lineContext` (`./menu-line-context.ts`).
 *
 * Every reason a menu line draws is a row: these tests build the rows and
 * check that each reason appears exactly when its row does — and, as much,
 * that it does **not** appear from somebody else's rows: a stranger's
 * cellar, a non-friend's review, a friend's merely-good review, an item the
 * viewer rated too low to recommend by, a vector past the threshold.
 */
import {
  ForbiddenError,
  type ItemRef,
  MENU_LINE_LIKE_MAX_DISTANCE,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import { MenuScansCollectionActor } from "../actors/menu-scans-collection-actor.ts";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";
import {
  blendedVector,
  seedCellar,
  seedCellarItem,
  seedFriendship,
  seedItemReview,
  seedItemVector,
  seedPlace,
  seedWine,
  unitVector,
} from "./search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

const { skip } = await resolveTestDatabase();

const seedScan = async (
  db: DbOrTx,
  userId: string,
  placeId: string,
): Promise<string> => {
  const [file] = await db
    .insert(files)
    .values({ key: `menus/${crypto.randomUUID()}.jpg` })
    .returning({ id: files.id });
  if (file === undefined) throw new Error("no file");
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.menu_scans
      (user_id, original_image_id, place_id, processing_status)
    values (${userId}::uuid, ${file.id}::uuid, ${placeId}::uuid, 'completed')
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no scan id");
  return id;
};

const seedLine = async (
  db: DbOrTx,
  options: {
    readonly placeId: string;
    readonly scanId: string;
    readonly name: string;
    readonly match?: ItemRef;
  },
): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(
    options.match === undefined
      ? sql`
        insert into public.place_menu_items
          (place_id, menu_scan_id, menu_item_name, detected_item_type)
        values (${options.placeId}::uuid, ${options.scanId}::uuid,
                ${options.name}, 'wine')
        returning id`
      : sql`
        insert into public.place_menu_items
          (place_id, menu_scan_id, menu_item_name, detected_item_type,
           ${ARCS.placeMenuItems.unqualified(options.match.type)})
        values (${options.placeId}::uuid, ${options.scanId}::uuid,
                ${options.name}, 'wine', ${options.match.id}::uuid)
        returning id`,
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no line id");
  return id;
};

/**
 * A review written `minutesAgo` — `now()` is the transaction's start, so
 * every row a test writes otherwise carries the same timestamp, and "the
 * newest review" would be decided by a random id.
 */
const seedReviewAt = async (
  db: DbOrTx,
  userId: string,
  ref: ItemRef,
  score: number,
  minutesAgo: number,
): Promise<void> => {
  await db.execute(sql`
    insert into public.item_reviews
      (${ARCS.itemReviews.unqualified(ref.type)}, user_id, score, updated_at)
    values (${ref.id}::uuid, ${userId}::uuid, ${score},
            now() - make_interval(mins => ${minutesAgo}))
  `);
};

/** A place, a scan by `scanner`, and the actor keyed by `viewer`. */
const setUp = async (db: DbOrTx, scanner: string, viewer: string) => {
  const placeId = await seedPlace(db, {
    name: "Cork & Barrel",
    lng: -89.4,
    lat: 43.07,
  });
  const scanId = await seedScan(db, scanner, placeId);
  const actor = await activate(
    createActor(MenuScansCollectionActor, viewer, db),
  );
  return { placeId, scanId, actor };
};

describe.skipIf(skip)("MenuScansCollectionActor.lineContext", () => {
  afterAll(closeTestDb);

  it("says nothing about an unmatched line, and lets only its scanner correct it", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const { placeId, scanId, actor } = await setUp(db, viewer, viewer);
      const mine = await seedLine(db, { placeId, scanId, name: "House red" });
      const theirScan = await seedScan(db, other, placeId);
      const theirs = await seedLine(db, {
        placeId,
        scanId: theirScan,
        name: "House white",
      });
      const nowhere = crypto.randomUUID();

      const context = await actor.lineContext(userCtx(viewer, "r"), [
        mine,
        theirs,
        nowhere,
      ]);
      expect(context).toEqual([
        { lineId: mine, canCorrectMatch: true, forYou: null },
        { lineId: theirs, canCorrectMatch: false, forYou: null },
        { lineId: nowhere, canCorrectMatch: false, forYou: null },
      ]);
    });
  });

  it("names the viewer's own cellar and score, not a stranger's", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const stranger = await seedUser(db);
      const { placeId, scanId, actor } = await setUp(db, stranger, viewer);
      const barolo = await seedWine(db, viewer, "Barolo");
      const line = await seedLine(db, {
        placeId,
        scanId,
        name: "BAROLO",
        match: barolo,
      });

      // A stranger's cellar and review: not reasons for the viewer.
      const theirCellar = await seedCellar(db, { createdById: stranger });
      await seedCellarItem(db, theirCellar, stranger, barolo);
      await seedItemReview(db, stranger, barolo, 5);

      // A finished bottle in the viewer's own cellar is not "in" it either.
      const old = await seedCellar(db, { createdById: viewer, name: "Old" });
      const finished = await seedCellarItem(db, old, viewer, barolo);
      await db.execute(sql`
        update public.cellar_items set empty_at = now() where id = ${finished}::uuid
      `);

      const before = await actor.lineContext(userCtx(viewer, "r"), [line]);
      expect(before[0]?.forYou).toEqual({
        cellarId: null,
        yourScore: null,
        lovedByFriendNames: [],
        lovedByFriendCount: 0,
        likeYouRated: null,
      });
      expect(before[0]?.canCorrectMatch).toBe(false);

      // A co-owned cellar counts as the viewer's.
      const shared = await seedCellar(db, {
        createdById: stranger,
        name: "Bar Cart",
        coOwnerIds: [viewer],
      });
      await seedCellarItem(db, shared, viewer, barolo);
      await seedReviewAt(db, viewer, barolo, 4.5, 1);
      await seedReviewAt(db, viewer, barolo, 3.5, 10);

      const after = await actor.lineContext(userCtx(viewer, "r"), [line]);
      expect(after[0]?.forYou).toMatchObject({
        cellarId: shared,
        // The newest review is the score.
        yourScore: 4.5,
      });
    });
  });

  it("counts friends who loved it, in either friendship direction, and no one else", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const sam = await seedUser(db, { displayName: "Sam" });
      const kim = await seedUser(db, { displayName: "Kim" });
      const lukewarm = await seedUser(db);
      const changedMind = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, viewer, sam);
      await seedFriendship(db, kim, viewer);
      await seedFriendship(db, viewer, lukewarm);
      await seedFriendship(db, viewer, changedMind);

      const { placeId, scanId, actor } = await setUp(db, viewer, viewer);
      const lagavulin = await seedWine(db, viewer, "Lagavulin 16");
      const line = await seedLine(db, {
        placeId,
        scanId,
        name: "Lagavulin 16",
        match: lagavulin,
      });

      await seedItemReview(db, sam, lagavulin, 5);
      await seedItemReview(db, kim, lagavulin, 4.5);
      await seedItemReview(db, lukewarm, lagavulin, 4);
      await seedItemReview(db, stranger, lagavulin, 5);
      // Loved it once, then thought better of it: the newest review counts.
      await seedReviewAt(db, changedMind, lagavulin, 5, 60);
      await seedReviewAt(db, changedMind, lagavulin, 2, 1);

      const [context] = await actor.lineContext(userCtx(viewer, "r"), [line]);
      expect(context?.forYou?.lovedByFriendCount).toBe(2);
      expect([...(context?.forYou?.lovedByFriendNames ?? [])].sort()).toEqual([
        "Kim",
        "Sam",
      ]);
    });
  });

  it("names the nearest well-rated item of the same type, inside the threshold only", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const { placeId, scanId, actor } = await setUp(db, viewer, viewer);
      const onMenu = await seedWine(db, viewer, "Laphroaig 10");
      const near = await seedWine(db, viewer, "Lagavulin 16");
      const nearer = await seedWine(db, viewer, "Ardbeg 10");
      const disliked = await seedWine(db, viewer, "Caol Ila 12");
      const far = await seedWine(db, viewer, "Glenlivet 12");

      // Cosine distance 1 - cos(angle): a quarter turn is 1, small blends
      // stay well under the threshold.
      await seedItemVector(db, onMenu, unitVector(0));
      await seedItemVector(db, near, blendedVector(0, 1, 0.2));
      await seedItemVector(db, nearer, blendedVector(0, 2, 0.1));
      await seedItemVector(db, disliked, blendedVector(0, 3, 0.01));
      await seedItemVector(db, far, unitVector(4));
      await seedItemReview(db, viewer, near, 4.5);
      await seedItemReview(db, viewer, nearer, 4);
      await seedItemReview(db, viewer, disliked, 3);
      await seedItemReview(db, viewer, far, 5);

      const line = await seedLine(db, {
        placeId,
        scanId,
        name: "Laphroaig 10",
        match: onMenu,
      });
      const [context] = await actor.lineContext(userCtx(viewer, "r"), [line]);
      expect(context?.forYou?.likeYouRated).toEqual({
        item: nearer,
        score: 4,
      });

      // Only the far one left: past the threshold, so no reason at all.
      await db.execute(sql`
        delete from public.item_reviews
        where user_id = ${viewer}::uuid
          and ${ARCS.itemReviews.unqualified("WINE")} in (${near.id}::uuid, ${nearer.id}::uuid)
      `);
      // Unit vectors on different axes are a cosine distance of 1 apart.
      expect(1).toBeGreaterThan(MENU_LINE_LIKE_MAX_DISTANCE);
      const [without] = await actor.lineContext(userCtx(viewer, "r"), [line]);
      expect(without?.forYou?.likeYouRated).toBeNull();

      // And never once the viewer has rated the line's own item.
      await seedItemReview(db, viewer, near, 4.5);
      await seedItemReview(db, viewer, onMenu, 4);
      const [rated] = await actor.lineContext(userCtx(viewer, "r"), [line]);
      expect(rated?.forYou?.yourScore).toBe(4);
      expect(rated?.forYou?.likeYouRated).toBeNull();
    });
  });

  it("answers its own viewer only, and refuses a malformed id before reading", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const { actor } = await setUp(db, viewer, viewer);
      await expect(
        actor.lineContext(userCtx(other, "r"), [crypto.randomUUID()]),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.lineContext(userCtx(viewer, "r"), ["not-a-uuid"]),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(actor.queryCount).toBe(0);
    });
  });
});
