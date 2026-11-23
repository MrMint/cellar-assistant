/**
 * `TasteActor` (L03): the profile's abstain-first phrasing, agreement
 * through the existing visibility rules, and the refusals that answer like a
 * missing user.
 *
 * Each privacy test first shows the hole — the same rows read with no
 * visibility filter (`ratingsOf` under an `everything` scope) — and then
 * that the actor's answer leaves them out, so a passing test cannot mean the
 * fixture was simply wrong.
 */
import {
  AGREEMENT_MIN_SHARED,
  type Ctx,
  type ItemRef,
  NotFoundError,
  PROFILE_NOT_SHARED,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCheckIn,
  seedFriendship,
  seedItemOfType,
  seedItemReview,
  seedRecipe,
  seedWine,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import {
  noTastePhraser,
  ratingsOf,
  TasteActor,
  type TastePhraser,
} from "./taste-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const newActor = (
  viewerId: string,
  db: DbOrTx,
  phraser: TastePhraser = noTastePhraser,
) =>
  activate(
    new TasteActor(
      new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
      new ActorId(viewerId),
      db,
      phraser,
    ),
  );

const VARIETIES = ["Nebbiolo", "Syrah", "Merlot"] as const;

/** A wine of `variety`, created by `owner`. */
const wineOf = async (
  db: DbOrTx,
  owner: string,
  variety: string,
): Promise<ItemRef> => {
  await db.execute(
    sql`insert into public.wine_variety (value) values (${variety}) on conflict do nothing`,
  );
  const ref = await seedWine(db, owner, `${variety} test`);
  await db.execute(
    sql`update public.wines set variety = ${variety} where id = ${ref.id}::uuid`,
  );
  return ref;
};

const scoreCheckIn = async (
  db: DbOrTx,
  userId: string,
  item: ItemRef,
  score: number,
): Promise<void> => {
  const id = await seedCheckIn(db, { userId, item });
  await db.execute(
    sql`update public.check_ins set score = ${score} where id = ${id}::uuid`,
  );
};

describe.skipIf(skip)("TasteActor", () => {
  afterAll(closeTestDb);

  describe("profile", () => {
    it("thin data: no model call, and a plain fallback line", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        for (let i = 0; i < 3; i += 1) {
          const wine = await wineOf(db, viewer, "Nebbiolo");
          await seedItemReview(db, viewer, wine, 4);
        }
        const phraser = vi.fn<TastePhraser>(async () => "never used");
        const actor = await newActor(viewer, db, phraser);
        const profile = await actor.profile(userCtx(viewer));
        expect(phraser).not.toHaveBeenCalled();
        expect(profile.archetype).toBeNull();
        expect(profile.ratingCount).toBe(3);
        expect(profile.line).toBe("Rate 7 more items to see your archetype.");
        expect(profile.linePhrasedByAi).toBe(false);
      });
    });

    const seedTen = async (db: DbOrTx, viewer: string) => {
      // 4 Nebbiolo at 5, 3 Syrah at 4, 3 Merlot at 2: mean 3.8.
      const scores = {
        Nebbiolo: [5, 5, 5, 5],
        Syrah: [4, 4, 4],
        Merlot: [2, 2, 2],
      };
      for (const variety of VARIETIES) {
        for (const score of scores[variety]) {
          await seedItemReview(
            db,
            viewer,
            await wineOf(db, viewer, variety),
            score,
          );
        }
      }
    };

    it("a deterministic archetype; the phraser's grounded line is used and labelled", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedTen(db, viewer);
        const phraser = vi.fn<TastePhraser>(
          async () => "You lean towards Nebbiolo and away from Merlot.",
        );
        const actor = await newActor(viewer, db, phraser);
        const profile = await actor.profile(userCtx(viewer));
        expect(profile.archetype?.key).toBe("DEVOTED");
        expect(profile.archetype?.title).toBe("Devoted to Nebbiolo");
        expect(profile.archetype?.loves.map((s) => s.label)).toEqual([
          "Nebbiolo",
          "Syrah",
        ]);
        expect(phraser).toHaveBeenCalledTimes(1);
        expect(profile.line).toBe(
          "You lean towards Nebbiolo and away from Merlot.",
        );
        expect(profile.linePhrasedByAi).toBe(true);
      });
    });

    it("an abstaining or failing phraser leaves the deterministic line", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedTen(db, viewer);
        const plain =
          "You rate Nebbiolo and Syrah highest and Merlot lowest, across 1 type.";
        for (const phraser of [
          noTastePhraser,
          async () => {
            // What an uninstalled `taste_phrase` budget seam answers (L47).
            throw new Error("unknown model seam taste_phrase");
          },
        ] satisfies TastePhraser[]) {
          const profile = await (await newActor(viewer, db, phraser)).profile(
            userCtx(viewer),
          );
          expect(profile.line).toBe(plain);
          expect(profile.linePhrasedByAi).toBe(false);
        }
      });
    });
  });

  describe("agreement", () => {
    it("counts only ratings the viewer may see: a stranger's drink-log scores never count", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const stranger = await seedUser(db);
        const wines: ItemRef[] = [];
        for (let i = 0; i < 8; i += 1) {
          wines.push(await seedItemOfType(db, "WINE", viewer));
        }
        for (const wine of wines) await seedItemReview(db, viewer, wine, 4);
        // Five public reviews, three private drink-log scores.
        for (const wine of wines.slice(0, 5)) {
          await seedItemReview(db, stranger, wine, 4);
        }
        for (const wine of wines.slice(5)) {
          await scoreCheckIn(db, stranger, wine, 4);
        }

        // The hole: unfiltered, all eight would count.
        const unfiltered = await ratingsOf(
          db,
          { kind: "everything" },
          stranger,
        );
        expect(unfiltered).toHaveLength(8);

        const actor = await newActor(viewer, db);
        const answer = await actor.agreement(userCtx(viewer), stranger);
        expect(answer.shared).toBe(5);
        expect(answer.agreed).toBe(5);
      });
    });

    it("a friend's drink-log scores count (canSeeCheckInDetails)", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db, { displayName: "Maya" });
        await seedFriendship(db, viewer, friend);
        await seedFriendship(db, friend, viewer);
        const wines: ItemRef[] = [];
        for (let i = 0; i < 6; i += 1) {
          wines.push(await seedItemOfType(db, "WINE", viewer));
        }
        for (const wine of wines) await seedItemReview(db, viewer, wine, 4);
        for (const [i, wine] of wines.entries()) {
          await scoreCheckIn(db, friend, wine, i < 4 ? 4.5 : 2);
        }
        const actor = await newActor(viewer, db);
        const [row] = await actor.friendAgreements(userCtx(viewer));
        expect(row).toMatchObject({
          userId: friend,
          name: "Maya",
          shared: 6,
          agreed: 4,
          byType: [{ type: "WINE", shared: 6, agreed: 4 }],
        });
      });
    });

    it("a recipe-only drink log is not an item rating", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const wine = await seedItemOfType(db, "WINE", user);
        await scoreCheckIn(db, user, wine, 4);
        const recipeId = await seedRecipe(db, {
          name: "Negroni test",
          type: "cocktail",
          createdById: user,
        });
        // A logged pour of the recipe: a seeded log moved off its wine.
        const logId = await seedCheckIn(db, {
          userId: user,
          item: await seedItemOfType(db, "WINE", user),
        });
        await db.execute(sql`
          update public.check_ins
          set wine_id = null, recipe_id = ${recipeId}::uuid, score = 5
          where id = ${logId}::uuid
        `);
        const rows = await ratingsOf(db, { kind: "everything" }, user);
        expect(rows).toEqual([
          expect.objectContaining({ type: "WINE", itemId: wine.id, score: 4 }),
        ]);
      });
    });

    it("gates at N: N-1 shared withholds the agreed count", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const wines: ItemRef[] = [];
        for (let i = 0; i < AGREEMENT_MIN_SHARED; i += 1) {
          wines.push(await seedItemOfType(db, "WINE", viewer));
        }
        for (const wine of wines) {
          await seedItemReview(db, viewer, wine, 4);
          await seedItemReview(db, friend, wine, 4);
        }
        // Remove one shared item's friend review: N-1.
        const actor = await newActor(viewer, db);
        expect((await actor.agreement(userCtx(viewer), friend)).agreed).toBe(
          AGREEMENT_MIN_SHARED,
        );
        await db.execute(sql`
          delete from public.item_reviews
          where user_id = ${friend}::uuid and wine_id = ${wines[0]?.id ?? ""}::uuid`);
        const below = await actor.agreement(userCtx(viewer), friend);
        expect(below).toMatchObject({
          shared: AGREEMENT_MIN_SHARED - 1,
          agreed: null,
          byType: [],
        });
      });
    });

    it("a user you may not see answers exactly like a missing one", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const disabled = await seedUser(db);
        await db.execute(
          sql`update public."user" set disabled = true where id = ${disabled}::uuid`,
        );
        const actor = await newActor(viewer, db);
        const refusal = async (id: string) => {
          try {
            await actor.agreement(userCtx(viewer), id);
          } catch (error) {
            return error;
          }
          return null;
        };
        const missing = await refusal("00000000-0000-4000-8000-000000000000");
        expect(missing).toBeInstanceOf(NotFoundError);
        expect((missing as Error).message).toBe(PROFILE_NOT_SHARED);
        for (const id of [disabled, "not-a-uuid", viewer]) {
          const other = await refusal(id);
          expect(other).toBeInstanceOf(NotFoundError);
          expect((other as Error).message).toBe((missing as Error).message);
        }
      });
    });

    it("refuses a caller who is not the actor's viewer", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const other = await seedUser(db);
        const actor = await newActor(viewer, db);
        await expect(actor.profile(userCtx(other))).rejects.toThrow(
          /may only be called by that viewer/,
        );
      });
    });
  });
});
