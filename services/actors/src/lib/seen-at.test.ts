/**
 * L10 (wave C seenat) · "Seen at" privacy. The rule (`selectSeenAt`) is
 * tested without a database, and the read (`ItemActor.seenAt` over
 * `loadSeenAt`) against one. Every refusal here is an omission, and the
 * point of the database half is that a missing item, an item seen only at a
 * private place and an item logged only where the viewer may not look all
 * give the *same* answer.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, ItemRef } from "@cellar-assistant/contracts";
import { anonymousCtx, userCtx } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { ItemActor } from "../actors/item-actor.ts";
import type { DbOrTx } from "./db.ts";
import { seedPlace, seedWine } from "./search-testing.ts";
import type { SeenAtFacts, SeenAtPlaceFacts } from "./seen-at.ts";
import { selectSeenAt } from "./seen-at.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

const VIEWER = "00000000-0000-4000-8000-00000000000a";
const FRIEND = "00000000-0000-4000-8000-00000000000b";
const STRANGER = "00000000-0000-4000-8000-00000000000c";
const viewer: Ctx = userCtx(VIEWER, "r-1");

const place = (
  id: string,
  over: Partial<SeenAtPlaceFacts> = {},
): SeenAtPlaceFacts => ({
  id,
  name: `Place ${id}`,
  createdById: null,
  reviewStatus: "approved",
  distanceMeters: null,
  ...over,
});

const facts = (over: Partial<SeenAtFacts> = {}): SeenAtFacts => ({
  sightings: [],
  places: new Map(),
  friendships: [
    { userId: VIEWER, friendId: FRIEND },
    { userId: FRIEND, friendId: VIEWER },
  ],
  viewerGroupIds: new Set(),
  userNames: new Map([[FRIEND, "Maya Lind"]]),
  ...over,
});

const at = (iso: string): Date => new Date(iso);

describe("L10 · selectSeenAt — the rule", () => {
  it("lists a menu on a shared place, the viewer's own log and a friend's, nearest first", () => {
    const rows = selectSeenAt(
      viewer,
      facts({
        places: new Map([
          ["m", place("m", { distanceMeters: 600 })],
          ["o", place("o", { distanceMeters: 1800 })],
          ["f", place("f", { distanceMeters: 6200 })],
        ]),
        sightings: [
          {
            kind: "log",
            placeId: "f",
            userId: FRIEND,
            groupId: "g1",
            at: at("2026-10-01"),
          },
          { kind: "menu", placeId: "m", at: at("2026-11-18") },
          {
            kind: "log",
            placeId: "o",
            userId: VIEWER,
            groupId: "g2",
            at: at("2026-08-01"),
          },
        ],
      }),
    );
    expect(rows.map((row) => [row.placeId, row.kind, row.friendName])).toEqual([
      ["m", "MENU", null],
      ["o", "OWN_LOG", null],
      ["f", "FRIEND_LOG", "Maya Lind"],
    ]);
  });

  it("a private place answers like no sighting at all — even a menu, even the viewer's friend's", () => {
    const pending = place("p", {
      reviewStatus: "pending",
      createdById: FRIEND,
    });
    const rows = selectSeenAt(
      viewer,
      facts({
        places: new Map([["p", pending]]),
        sightings: [
          { kind: "menu", placeId: "p", at: null },
          { kind: "log", placeId: "p", userId: FRIEND, groupId: "g", at: null },
        ],
      }),
    );
    expect(rows).toEqual([]);
    // Its creator sees their own place, Under review.
    expect(
      selectSeenAt(
        userCtx(FRIEND, "r"),
        facts({
          places: new Map([["p", pending]]),
          sightings: [{ kind: "menu", placeId: "p", at: null }],
        }),
      ),
    ).toHaveLength(1);
  });

  it("a log the viewer may not see the details of is omitted: a stranger's, on a shared place", () => {
    const rows = selectSeenAt(
      viewer,
      facts({
        places: new Map([["s", place("s")]]),
        sightings: [
          {
            kind: "log",
            placeId: "s",
            userId: STRANGER,
            groupId: "g",
            at: null,
          },
        ],
      }),
    );
    expect(rows).toEqual([]);
  });

  it("a companion on the same outing sees the stranger's log (canSeeCheckInDetails)", () => {
    const rows = selectSeenAt(
      viewer,
      facts({
        places: new Map([["s", place("s")]]),
        viewerGroupIds: new Set(["g"]),
        sightings: [
          {
            kind: "log",
            placeId: "s",
            userId: STRANGER,
            groupId: "g",
            at: null,
          },
        ],
      }),
    );
    expect(rows.map((row) => row.kind)).toEqual(["FRIEND_LOG"]);
  });

  it("one row per place: the viewer's own log beats a menu, a menu beats a friend's log", () => {
    const rows = selectSeenAt(
      viewer,
      facts({
        places: new Map([
          ["a", place("a")],
          ["b", place("b")],
        ]),
        sightings: [
          {
            kind: "log",
            placeId: "a",
            userId: FRIEND,
            groupId: "g1",
            at: at("2026-11-20"),
          },
          { kind: "menu", placeId: "a", at: at("2026-11-01") },
          {
            kind: "log",
            placeId: "a",
            userId: VIEWER,
            groupId: "g2",
            at: at("2026-01-01"),
          },
          {
            kind: "log",
            placeId: "b",
            userId: FRIEND,
            groupId: "g3",
            at: at("2026-11-20"),
          },
          { kind: "menu", placeId: "b", at: at("2026-02-01") },
        ],
      }),
    );
    expect(rows.map((row) => [row.placeId, row.kind])).toEqual([
      ["b", "MENU"],
      ["a", "OWN_LOG"],
    ]);
  });

  it("anonymous sees nothing; `first` is clamped", () => {
    const many = new Map(
      Array.from({ length: 30 }, (_, i) => [String(i), place(String(i))]),
    );
    const sightings = [...many.keys()].map((id) => ({
      kind: "menu" as const,
      placeId: id,
      at: null,
    }));
    expect(
      selectSeenAt(anonymousCtx("r"), facts({ places: many, sightings })),
    ).toEqual([]);
    expect(
      selectSeenAt(viewer, facts({ places: many, sightings }), 500),
    ).toHaveLength(20);
    expect(
      selectSeenAt(viewer, facts({ places: many, sightings }), 3),
    ).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/* The read, against a database                                                */
/* -------------------------------------------------------------------------- */

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });
const itemActor = (ref: ItemRef, db: DbOrTx): ItemActor =>
  new ItemActor(
    daprClient(),
    new ActorId(`${ref.type.toLowerCase()}:${ref.id}`),
    db,
  );

const befriend = async (db: DbOrTx, a: string, b: string): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${a}::uuid, ${b}::uuid), (${b}::uuid, ${a}::uuid) on conflict do nothing
  `);
};

const logAt = async (
  db: DbOrTx,
  userId: string,
  wine: ItemRef,
  placeId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.check_ins (user_id, created_by_id, group_id, wine_id, place_id)
    values (${userId}::uuid, ${userId}::uuid, ${randomUUID()}::uuid, ${wine.id}::uuid, ${placeId}::uuid)
  `);
};

const onMenuAt = async (
  db: DbOrTx,
  wine: ItemRef,
  placeId: string,
): Promise<void> => {
  const menuId = randomUUID();
  await db.execute(sql`
    insert into public.place_menus (id, place_id, menu_data, source)
    values (${menuId}::uuid, ${placeId}::uuid, '{}'::jsonb, 'user_upload')
  `);
  await db.execute(sql`
    insert into public.place_menu_items (place_menu_id, place_id, menu_item_name, wine_id)
    values (${menuId}::uuid, ${placeId}::uuid, 'House red', ${wine.id}::uuid)
  `);
};

const SF = { lat: 37.7749, lng: -122.4194 };

describe("L10 · ItemActor.seenAt — the read", () => {
  afterAll(closeTestDb);

  it("resolves a test database", async () => {
    expect(await resolveTestDatabase()).toBeTruthy();
  });

  it("a private place, a stranger's log and a missing item all answer like a forbidden one: []", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const friend = await seedUser(db, { displayName: "Maya Lind" });
      const stranger = await seedUser(db);
      await befriend(db, me, friend);

      // Seen only where the viewer may not look.
      const hidden = await seedWine(db, me, "Hidden");
      const friendsPending = await seedPlace(db, {
        name: "Friend's pending bar",
        ...SF,
        reviewStatus: "pending",
        createdBy: friend,
      });
      const shared = await seedPlace(db, { name: "Shared bar", ...SF });
      await onMenuAt(db, hidden, friendsPending);
      await logAt(db, friend, hidden, friendsPending);
      await logAt(db, stranger, hidden, shared);

      const ctx = userCtx(me, "r");
      const forbidden = await activate(itemActor(hidden, db));
      const missing = await activate(
        itemActor({ type: "WINE", id: randomUUID() }, db),
      );
      const forbiddenAnswer = await forbidden.seenAt(ctx, { near: SF });
      const missingAnswer = await missing.seenAt(ctx, { near: SF });
      expect(forbiddenAnswer).toEqual([]);
      expect(missingAnswer).toEqual(forbiddenAnswer);
    });
  });

  it("lists the menu on a shared place, the viewer's log and a friend's, with distance", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const friend = await seedUser(db, { displayName: "Maya Lind" });
      await befriend(db, me, friend);
      const wine = await seedWine(db, me, "Seen");
      const near = await seedPlace(db, { name: "Near bar", ...SF });
      const mine = await seedPlace(db, {
        name: "My pending bar",
        lat: SF.lat + 0.01,
        lng: SF.lng,
        reviewStatus: "pending",
        createdBy: me,
      });
      const far = await seedPlace(db, {
        name: "Far bar",
        lat: SF.lat + 0.05,
        lng: SF.lng,
      });
      await onMenuAt(db, wine, near);
      await logAt(db, me, wine, mine);
      await logAt(db, friend, wine, far);

      const actor = await activate(itemActor(wine, db));
      const rows = await actor.seenAt(userCtx(me, "r"), { near: SF });
      expect(rows.map((row) => [row.placeName, row.kind])).toEqual([
        ["Near bar", "MENU"],
        ["My pending bar", "OWN_LOG"],
        ["Far bar", "FRIEND_LOG"],
      ]);
      expect(rows[2]?.friendName).toBe("Maya Lind");
      expect(rows[0]?.distanceMeters).toBeLessThan(5);
      expect(rows[1]?.distanceMeters).toBeGreaterThan(1000);
    });
  });
});
