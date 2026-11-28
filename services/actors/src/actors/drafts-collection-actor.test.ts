/**
 * `DraftsCollectionActor` — SV-B (L6, L30): the viewer's "Needs details"
 * drafts, per cellar and across all of them, and `Item.unconfirmedFields`.
 */
import { randomUUID } from "node:crypto";
import { ForbiddenError, userCtx } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import {
  DraftsCollectionActor,
  guessedFieldsOf,
} from "./drafts-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const seedCellar = async (db: DbOrTx, createdById: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.cellars (id, name, created_by_id, privacy)
    values (${id}::uuid, 'Cellar', ${createdById}::uuid, 'PRIVATE'::permission_type)
  `);
  return id;
};

const seedOnboarding = async (
  db: DbOrTx,
  options: {
    userId: string;
    status: string;
    cellarId?: string | null;
    defaults?: unknown;
    confirmedFields?: readonly string[];
  },
): Promise<string> => {
  const id = randomUUID();
  const confirmed = `{${(options.confirmedFields ?? []).join(",")}}`;
  await db.execute(sql`
    insert into public.item_onboardings
      (id, user_id, item_type, status, cellar_id, defaults, confirmed_fields, display_name)
    values (${id}::uuid, ${options.userId}::uuid, 'WINE', ${options.status},
            ${options.cellarId ?? null}::uuid,
            ${options.defaults === undefined ? null : JSON.stringify(options.defaults)}::jsonb,
            ${confirmed}::text[], 'Demo draft')
  `);
  return id;
};

const seedWine = async (
  db: DbOrTx,
  createdById: string,
  onboardingId: string,
): Promise<string> => {
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
  const id = randomUUID();
  await db.execute(sql`
    insert into public.wines (id, name, created_by_id, vintage, style, item_onboarding_id)
    values (${id}::uuid, 'Demo Wine', ${createdById}::uuid, null, 'RED', ${onboardingId}::uuid)
  `);
  return id;
};

describe("guessedFieldsOf", () => {
  it("reads the fields the label read gave a confidence for", () => {
    expect(
      guessedFieldsOf({
        name: "x",
        fieldConfidence: { name: "sure", vintage: "check", bad: "92%" },
      }),
    ).toEqual(["name", "vintage"]);
    expect(guessedFieldsOf(null)).toEqual([]);
    expect(guessedFieldsOf({ name: "x" })).toEqual([]);
  });
});

describe.skipIf(skip)("DraftsCollectionActor (SV-B)", () => {
  afterAll(closeTestDb);

  it("lists and counts the viewer's NEEDS_DETAILS drafts, per cellar and in all", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const reds = await seedCellar(db, viewer);
      const whites = await seedCellar(db, viewer);
      const a = await seedOnboarding(db, {
        userId: viewer,
        status: "NEEDS_DETAILS",
        cellarId: reds,
      });
      const b = await seedOnboarding(db, {
        userId: viewer,
        status: "NEEDS_DETAILS",
        cellarId: whites,
      });
      const c = await seedOnboarding(db, {
        userId: viewer,
        status: "NEEDS_DETAILS",
      });
      // Not drafts: another status, and another person's draft at my cellar.
      await seedOnboarding(db, {
        userId: viewer,
        status: "START",
        cellarId: reds,
      });
      await seedOnboarding(db, {
        userId: other,
        status: "NEEDS_DETAILS",
        cellarId: reds,
      });

      const actor = await activate(
        createActor(DraftsCollectionActor, viewer, db),
      );
      const ctx = userCtx(viewer, "r");
      const all = await actor.needsDetails(ctx, {});
      expect(new Set(all.map((d) => d.id))).toEqual(new Set([a, b, c]));
      expect(all.every((d) => d.status === "NEEDS_DETAILS")).toBe(true);
      expect(await actor.needsDetailsCount(ctx, {})).toBe(3);
      expect(
        (await actor.needsDetails(ctx, { cellarId: reds })).map((d) => d.id),
      ).toEqual([a]);
      expect(await actor.needsDetailsCount(ctx, { cellarId: reds })).toBe(1);
      expect(
        await actor.needsDetailsCount(ctx, { cellarId: whites.toUpperCase() }),
      ).toBe(1);
    });
  });

  it("lists every draft it counts, past 200 (F-73)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await db.execute(sql`
        insert into public.item_onboardings
          (id, user_id, item_type, status, display_name)
        select gen_random_uuid(), ${viewer}::uuid, 'WINE', 'NEEDS_DETAILS',
               'Demo draft ' || n
        from generate_series(1, 205) as n
      `);
      const actor = await activate(
        createActor(DraftsCollectionActor, viewer, db),
      );
      const ctx = userCtx(viewer, "r");
      const count = await actor.needsDetailsCount(ctx, {});
      expect(count).toBe(205);
      expect((await actor.needsDetails(ctx, {})).length).toBe(count);
    });
  });

  it("refuses a caller who is not the viewer it is keyed by, before reading", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      await seedOnboarding(db, { userId: viewer, status: "NEEDS_DETAILS" });
      const actor = await activate(
        createActor(DraftsCollectionActor, viewer, db),
      );
      for (const call of [
        () => actor.needsDetails(userCtx(other, "r"), {}),
        () => actor.needsDetailsCount(userCtx(other, "r"), {}),
        () => actor.unconfirmedFields(userCtx(other, "r"), []),
      ]) {
        await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect(actor.queryCount).toBe(0);
    });
  });

  it("unconfirmedFields: guesses the creator never touched, and nothing for anyone else", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const onboarding = await seedOnboarding(db, {
        userId: viewer,
        status: "CONFIRMED",
        defaults: {
          name: "Demo Wine",
          fieldConfidence: { name: "sure", vintage: "check", style: "likely" },
        },
        confirmedFields: ["name"],
      });
      const wine = await seedWine(db, viewer, onboarding);
      const plain = await seedWine(
        db,
        viewer,
        await seedOnboarding(db, { userId: viewer, status: "CONFIRMED" }),
      );

      const mine = await activate(
        createActor(DraftsCollectionActor, viewer, db),
      );
      expect(
        await mine.unconfirmedFields(userCtx(viewer, "r"), [
          { type: "WINE", id: wine },
          { type: "WINE", id: plain },
          { type: "BEER", id: randomUUID() },
        ]),
      ).toEqual([["style", "vintage"], [], []]);

      // Someone else asking about my wine learns nothing.
      const theirs = await activate(
        createActor(DraftsCollectionActor, other, db),
      );
      expect(
        await theirs.unconfirmedFields(userCtx(other, "r"), [
          { type: "WINE", id: wine },
        ]),
      ).toEqual([[]]);
    });
  });

  it("unconfirmedBottleCount: the viewer's bottles, open or sealed, with a guess never checked (F-76)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const mine = await seedCellar(db, viewer);
      const theirs = await seedCellar(db, other);
      const guessed = { fieldConfidence: { name: "sure", country: "check" } };
      const bottle = async (
        cellarId: string,
        wineId: string,
        extra: { open?: boolean; empty?: boolean } = {},
      ) => {
        await db.execute(sql`
          insert into public.cellar_items (cellar_id, created_by, wine_id, open_at, empty_at)
          values (${cellarId}::uuid, ${viewer}::uuid, ${wineId}::uuid,
                  ${extra.open === true ? new Date().toISOString() : null}::timestamptz,
                  ${extra.empty === true ? new Date().toISOString() : null}::timestamptz)
        `);
      };
      // A wine with a guess left: a sealed bottle, an open one, an empty one.
      const open = await seedOnboarding(db, {
        userId: viewer,
        status: "CONFIRMED",
        defaults: guessed,
        confirmedFields: ["name"],
      });
      const unchecked = await seedWine(db, viewer, open);
      await bottle(mine, unchecked);
      await bottle(mine, unchecked, { open: true });
      await bottle(mine, unchecked, { empty: true });
      // Every guess confirmed: nothing to check.
      const done = await seedOnboarding(db, {
        userId: viewer,
        status: "CONFIRMED",
        defaults: guessed,
        confirmedFields: ["name", "country"],
      });
      await bottle(mine, await seedWine(db, viewer, done));
      // Another person's wine in my cellar, and my wine in their cellar.
      const theirsRead = await seedOnboarding(db, {
        userId: other,
        status: "CONFIRMED",
        defaults: guessed,
      });
      await bottle(mine, await seedWine(db, other, theirsRead));
      await bottle(theirs, unchecked);

      const actor = await activate(
        createActor(DraftsCollectionActor, viewer, db),
      );
      expect(await actor.unconfirmedBottleCount(userCtx(viewer, "r"))).toBe(2);
      await expect(
        actor.unconfirmedBottleCount(userCtx(other, "r")),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
