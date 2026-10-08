/**
 * N15: a new account's starter cellar is *queued* by better-auth's
 * `user.create` hook (`enqueueStarterCellar`) and *made* by
 * `CellarActor.createStarter` (`cellar-actor.test.ts`). This file holds the
 * queuing half: the row names the declared pair, the derived id and the
 * owner, and nothing a caller chose.
 */
import { outbox } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import { starterCellarId } from "../lib/starter-cellar.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { enqueueStarterCellar } from "./auth.ts";

const { skip } = await resolveTestDatabase();

describe("starterCellarId", () => {
  it("is stable for a user and distinct between users", () => {
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    expect(starterCellarId(a)).toBe(starterCellarId(a));
    expect(starterCellarId(a)).not.toBe(starterCellarId(b));
    expect(starterCellarId(a)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe.skipIf(skip)("enqueueStarterCellar", () => {
  afterAll(closeTestDb);

  it("queues CellarActor.createStarter at the user's derived id", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      await enqueueStarterCellar(db, user);
      const rows = await db
        .select()
        .from(outbox)
        .where(eq(outbox.targetId, starterCellarId(user)));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        targetActor: "CellarActor",
        method: "createStarter",
        payload: { ownerId: user },
        status: "pending",
      });
    });
  });
});
