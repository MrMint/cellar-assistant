/**
 * `DuplicatePlaceSearchActor` — C1 (§2.3).
 */
import type {
  Ctx,
  DuplicatePlaceSearchInput,
} from "@cellar-assistant/contracts";
import {
  duplicatePlaceSearchActorId,
  ForbiddenError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedPlace } from "../lib/search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { DuplicatePlaceSearchActor } from "./duplicate-place-search-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const HERE = { lng: -83.0, lat: 40.0 };

const newActor = (
  input: DuplicatePlaceSearchInput,
  db: DbOrTx,
  viewerId: string | null,
): DuplicatePlaceSearchActor =>
  new DuplicatePlaceSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(duplicatePlaceSearchActorId(input, viewerId)),
    db,
  );

/**
 * `hits[0]!.score` reads better but trips biome's `noNonNullAssertion`,
 * and the repo's style forbids `!`. This fails the test with a useful
 * message instead of a `TypeError` when the row is not there.
 */
const at = <T>(rows: readonly T[], index: number): T => {
  const row = rows[index];
  if (row === undefined) {
    throw new Error(
      `expected a result at index ${index}, got ${rows.length} rows`,
    );
  }
  return row;
};

describe.skipIf(skip)("DuplicatePlaceSearchActor (§2.3)", () => {
  afterAll(closeTestDb);

  it("orders by name similarity, then by distance", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      // Same name, different distances: distance is the tie-break.
      await seedPlace(db, { name: "The Wine Cellar", ...HERE });
      await seedPlace(db, {
        name: "The Wine Cellar",
        lng: -82.9995,
        lat: 40.0,
      });
      // A weaker name match, closer than both: similarity still wins.
      await seedPlace(db, { name: "Wine Cellar Annex Bar", ...HERE });

      const input: DuplicatePlaceSearchInput = {
        name: "The Wine Cellar",
        location: HERE,
      };
      const hits = await newActor(input, db, viewer).all(
        userCtx(viewer),
        input,
      );

      expect(hits.map((hit) => hit.name)).toEqual([
        "The Wine Cellar",
        "The Wine Cellar",
        "Wine Cellar Annex Bar",
      ]);
      expect(at(hits, 0).similarity).toBe(1);
      expect(at(hits, 0).distanceMeters).toBeLessThan(
        at(hits, 1).distanceMeters,
      );
      expect(at(hits, 2).similarity).toBeLessThan(at(hits, 1).similarity);
      expect(hits[0]?.location?.lng).toBeCloseTo(-83, 6);
    });
  });

  it("respects the radius and the similarity floor", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedPlace(db, { name: "The Wine Cellar", ...HERE });
      await seedPlace(db, { name: "The Wine Cellar", lng: -82.0, lat: 40.0 });
      await seedPlace(db, { name: "Completely Unrelated", ...HERE });

      const input: DuplicatePlaceSearchInput = {
        name: "The Wine Cellar",
        location: HERE,
      };
      const hits = await newActor(input, db, viewer).all(
        userCtx(viewer),
        input,
      );
      expect(hits.map((h) => h.name)).toEqual(["The Wine Cellar"]);
    });
  });

  it("ignores inactive places", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedPlace(db, {
        name: "The Wine Cellar",
        ...HERE,
        isActive: false,
      });
      const input: DuplicatePlaceSearchInput = {
        name: "The Wine Cellar",
        location: HERE,
      };
      expect(
        await newActor(input, db, viewer).all(userCtx(viewer), input),
      ).toEqual([]);
    });
  });

  it("agrees with PlaceCreationActor's own check (§2.1's un-taken delegation)", async () => {
    const { PlaceCreationActor } = await import("./place-creation-actor.ts");
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedPlace(db, { name: "The Wine Cellar", ...HERE });
      await seedPlace(db, { name: "Wine Cellar Annex Bar", ...HERE });

      const input: DuplicatePlaceSearchInput = {
        name: "The Wine Cellar",
        location: HERE,
      };
      const viaSearch = await newActor(input, db, viewer).all(
        userCtx(viewer),
        input,
      );

      const creation = new PlaceCreationActor(
        new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
        new ActorId("singleton"),
        db,
      );
      await creation.onActivate();
      const viaCreation = await creation.findDuplicates(userCtx(viewer), {
        name: "The Wine Cellar",
        location: HERE,
      });

      expect(viaSearch.map((hit) => hit.placeId)).toEqual(
        viaCreation.map((candidate) => candidate.placeId),
      );
      expect(viaSearch.map((hit) => hit.similarity)).toEqual(
        viaCreation.map((candidate) => candidate.similarity),
      );
    });
  });

  it("pages one result set without re-querying (§1.5)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      for (let i = 0; i < 4; i += 1) {
        await seedPlace(db, {
          name: "The Wine Cellar",
          lng: -83 + i * 0.0002,
          lat: 40,
        });
      }
      const input: DuplicatePlaceSearchInput = {
        name: "The Wine Cellar",
        location: HERE,
      };
      const actor = newActor(input, db, viewer);
      const ctx = userCtx(viewer);
      const first = await actor.results(ctx, input, { first: 2, after: null });
      const second = await actor.results(ctx, input, {
        first: 2,
        after: first.entries.at(-1)?.cursor ?? null,
      });
      expect(first.entries).toHaveLength(2);
      expect(second.entries).toHaveLength(2);
      expect(actor.searchRuns).toBe(1);
    });
  });

  it("refuses anonymous callers and out-of-range arguments", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const input: DuplicatePlaceSearchInput = {
        name: "X",
        location: HERE,
      };
      await expect(
        newActor(input, db, null).all(userCtx(null), input),
      ).rejects.toThrow(ForbiddenError);

      const tooWide: DuplicatePlaceSearchInput = {
        name: "X",
        location: HERE,
        radiusMeters: 50_000,
      };
      await expect(
        newActor(tooWide, db, viewer).all(userCtx(viewer), tooWide),
      ).rejects.toThrow(ValidationError);
    });
  });
});
