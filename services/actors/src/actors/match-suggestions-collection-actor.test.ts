/**
 * `MatchSuggestionsCollectionActor` — C3 (§2.2, §2.1).
 *
 * The criterion this file exists for: **a suggestion derived from another
 * user's scan is unreachable.** §2.2's original scope — "pending suggestions for
 * places the viewer has interacted with" — is withdrawn (see the actor's module
 * doc), and the test below builds exactly the situation that scope would have
 * leaked: two users scan menus at the *same place*, the viewer has interacted
 * with that place, and the other user's suggestions still do not appear.
 */
import {
  anonymousCtx,
  ForbiddenError,
  pageArgs,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedPlace, seedVisit, seedWine } from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { MatchSuggestionsCollectionActor } from "./match-suggestions-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const seedScan = async (db: DbOrTx, userId: string, placeId: string) => {
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

const seedSuggestion = async (
  db: DbOrTx,
  options: {
    readonly placeId: string;
    readonly scanId: string;
    readonly wineId: string;
    readonly name: string;
    readonly confidence: number;
    readonly acted?: boolean;
  },
): Promise<string> => {
  const item = await db.execute<{ id: string }>(sql`
    insert into public.place_menu_items
      (place_id, menu_scan_id, menu_item_name, detected_item_type)
    values (${options.placeId}::uuid, ${options.scanId}::uuid,
            ${options.name}, 'wine')
    returning id
  `);
  const menuItemId = item.rows[0]?.id;
  if (menuItemId === undefined) throw new Error("no menu item id");
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.item_match_suggestions
      (place_menu_item_id, suggested_wine_id, confidence_score, accepted)
    values (${menuItemId}::uuid, ${options.wineId}::uuid,
            ${options.confidence}, ${options.acted ?? null}::boolean)
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no suggestion id");
  return id;
};

describe.skipIf(skip)("MatchSuggestionsCollectionActor", () => {
  afterAll(closeTestDb);

  it("returns only the viewer's own pending suggestions, by confidence", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const placeId = await seedPlace(db, {
        name: "Shared Bar",
        lng: -0.1,
        lat: 51.5,
      });
      // The viewer has interacted with the place — §2.2's withdrawn scope
      // would have used exactly this join to surface the other user's rows.
      await seedVisit(db, viewer, placeId, true);

      const wine = await seedWine(db, viewer, "Suggested wine");
      const myScan = await seedScan(db, viewer, placeId);
      const theirScan = await seedScan(db, other, placeId);

      const lowConfidence = await seedSuggestion(db, {
        placeId,
        scanId: myScan,
        wineId: wine.id,
        name: "Mine, low",
        confidence: 0.55,
      });
      const highConfidence = await seedSuggestion(db, {
        placeId,
        scanId: myScan,
        wineId: wine.id,
        name: "Mine, high",
        confidence: 0.91,
      });
      const alreadyActed = await seedSuggestion(db, {
        placeId,
        scanId: myScan,
        wineId: wine.id,
        name: "Mine, accepted",
        confidence: 0.99,
        acted: true,
      });
      const theirs = await seedSuggestion(db, {
        placeId,
        scanId: theirScan,
        wineId: wine.id,
        name: "Theirs",
        confidence: 0.98,
      });

      const actor = await activate(
        createActor(MatchSuggestionsCollectionActor, viewer, db),
      );
      const page = await actor.list(
        userCtx(viewer, "r"),
        pageArgs({ first: 50 }),
      );
      const ids = page.entries.map((entry) => entry.node.id);

      // The whole criterion: another user's scan is unreachable from here.
      expect(ids).not.toContain(theirs);
      // …and "pending" means pending.
      expect(ids).not.toContain(alreadyActed);
      // Mine, most confident first (§2.2 "by confidence").
      expect(ids).toEqual([highConfidence, lowConfidence]);
      expect(page.entries[0]?.node).toMatchObject({
        menuScanId: myScan,
        placeId,
        menuItemName: "Mine, high",
        confidenceScore: 0.91,
        target: { kind: "ITEM", item: { type: "WINE", id: wine.id } },
        accepted: null,
        rejected: null,
      });
    });
  });

  it("refuses a caller who is not the viewer it is keyed by", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const actor = await activate(
        createActor(MatchSuggestionsCollectionActor, viewer, db),
      );
      await actor.list(userCtx(viewer, "r"), pageArgs({ first: 5 }));
      await expect(
        actor.list(userCtx(other, "r"), pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(1);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* UI parity G20 — the menu line behind each suggestion                    */
  /* ---------------------------------------------------------------------- */

  const lineOf = async (db: DbOrTx, suggestionId: string): Promise<string> => {
    const { rows } = await db.execute<{ id: string }>(sql`
      select place_menu_item_id as id from public.item_match_suggestions
      where id = ${suggestionId}::uuid
    `);
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("no line");
    return id;
  };

  it("menuItemsOf answers a page of lines in one turn, and never another user's line", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const placeId = await seedPlace(db, {
        name: "Line Bar",
        lng: -0.12,
        lat: 51.51,
      });
      const wine = await seedWine(db, viewer, "Line wine");
      const myScan = await seedScan(db, viewer, placeId);
      const theirScan = await seedScan(db, other, placeId);
      const mineA = await lineOf(
        db,
        await seedSuggestion(db, {
          placeId,
          scanId: myScan,
          wineId: wine.id,
          name: "House red",
          confidence: 0.8,
        }),
      );
      const mineB = await lineOf(
        db,
        await seedSuggestion(db, {
          placeId,
          scanId: myScan,
          wineId: wine.id,
          name: "House white",
          confidence: 0.7,
        }),
      );
      const theirs = await lineOf(
        db,
        await seedSuggestion(db, {
          placeId,
          scanId: theirScan,
          wineId: wine.id,
          name: "Their red",
          confidence: 0.9,
        }),
      );

      const actor = await activate(
        createActor(MatchSuggestionsCollectionActor, viewer, db),
      );
      const lines = await actor.menuItemsOf(userCtx(viewer, "r"), [
        mineB,
        theirs,
        mineA,
        mineB.toUpperCase(),
      ]);
      // Aligned to the input; the other user's line is null, not read.
      expect(lines.map((line) => line?.name ?? null)).toEqual([
        "House white",
        null,
        "House red",
        "House white",
      ]);
      expect(lines[0]).toMatchObject({
        id: mineB,
        placeId,
        menuScanId: myScan,
        detectedItemType: "wine",
      });
      expect(JSON.stringify(lines)).not.toContain("Their red");
      expect(actor.queryCount).toBe(1);
    });
  });

  it("menuItemsOf refuses another viewer and an anonymous caller before reading", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const actor = await activate(
        createActor(MatchSuggestionsCollectionActor, viewer, db),
      );
      await expect(
        actor.menuItemsOf(userCtx(other, "r"), [crypto.randomUUID()]),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.menuItemsOf(anonymousCtx("r"), [crypto.randomUUID()]),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(actor.queryCount).toBe(0);
      await expect(
        actor.menuItemsOf(
          userCtx(viewer, "r"),
          Array.from({ length: 101 }, () => crypto.randomUUID()),
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
