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
import { randomUUID } from "node:crypto";
import {
  AGREEMENT_MIN_SHARED,
  BudgetExceededError,
  type Ctx,
  ForbiddenError,
  type ItemRef,
  NotFoundError,
  PROFILE_NOT_SHARED,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import { type ModelBudget, meteredProviderFor } from "../lib/ai/budget.ts";
import type { AIProvider, ProviderFor } from "../lib/ai/types.ts";
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
  providerTastePhraser,
  ratingsOf,
  setTastePhraser,
  TasteActor,
  type TastePhraseInput,
  type TastePhraser,
  tastePhraser,
  unconfiguredTastePhraser,
} from "./taste-actor.ts";

/* -------------------------------------------------------------------------- */
/* The installed `taste_phrase` seam (H-10), without a database                */
/* -------------------------------------------------------------------------- */

const PHRASE_INPUT: TastePhraseInput = {
  ratingCount: 10,
  types: [{ type: "WINE", count: 10 }],
  archetype: {
    key: "DEVOTED",
    title: "Devoted to Nebbiolo",
    loves: [{ type: "WINE", label: "Nebbiolo", count: 4, average: 5 }],
    lessKeen: [{ type: "WINE", label: "Merlot", count: 3, average: 2 }],
  },
};

/** A provider that answers `answer` and counts its calls. */
const modelAnswering = (answer: unknown) => {
  const calls: string[] = [];
  const provider: AIProvider = {
    name: "vertex-ai",
    getAvailableQualities: () => ["low", "medium", "high"],
    async generateContent(request, quality) {
      calls.push(`${quality}:${request.prompt.slice(0, 12)}`);
      return {
        content: JSON.stringify(answer),
        metadata: {
          model: "gemini-3.5-flash-lite",
          provider: "vertex-ai",
          processingTime: 1,
          inputTokens: 100,
          outputTokens: 10,
        },
      };
    },
    async generateEmbeddings() {
      throw new Error("taste_phrase never embeds");
    },
  };
  return { provider, calls };
};

/** The budget `BudgetActor` would be, answering `allowed` and recording seams. */
const budgetAllowing = (allowed: boolean) => {
  const seams: string[] = [];
  const budget: ModelBudget = {
    reserve: async (_c, input) => {
      seams.push(input.seam);
      return {
        allowed,
        effectiveCostCents: 0,
        currentSpendCents: 0,
        limitCents: 200,
        requestCount: 0,
        freeTierLimit: 0,
        isEnabled: true,
        reason: allowed ? "charged" : "monthly budget exhausted",
        usageId: allowed ? "u-1" : null,
      };
    },
    settle: async () => {},
    release: async () => {},
  };
  return { budget, seams };
};

const MODELS = {
  low: "gemini-3.5-flash-lite",
  medium: "gemini-3.5-flash",
  high: "gemini-2.5-pro",
  embedding: "text-embedding-004",
};

/** `providerTastePhraser` behind the metered `taste_phrase` seam, as installed. */
const meteredPhraser = (answer: unknown, allowed = true) => {
  const model = modelAnswering(answer);
  const meter = budgetAllowing(allowed);
  const providerFor: ProviderFor = meteredProviderFor(
    model.provider,
    "taste_phrase",
    MODELS,
    { budget: meter.budget },
  );
  return {
    phraser: providerTastePhraser(providerFor),
    calls: model.calls,
    seams: meter.seams,
  };
};

const anyCtx: Ctx = {
  viewerId: "11111111-1111-4111-8111-111111111111",
  kind: "user",
  requestId: "r",
};

describe("the taste_phrase seam (H-10)", () => {
  it("is charged to taste_phrase, on the low model, once per phrasing", async () => {
    const { phraser, calls, seams } = meteredPhraser({
      factsSupportALine: true,
      line: "You lean towards Nebbiolo and away from Merlot.",
    });
    await expect(phraser(anyCtx, PHRASE_INPUT)).resolves.toBe(
      "You lean towards Nebbiolo and away from Merlot.",
    );
    expect(seams).toEqual(["taste_phrase"]);
    expect(calls).toEqual(["low:You describe"]);
  });

  it("abstains when the model says the facts do not support a line", async () => {
    const { phraser } = meteredPhraser({
      factsSupportALine: false,
      line: "Something anyway about Nebbiolo.",
    });
    await expect(phraser(anyCtx, PHRASE_INPUT)).resolves.toBeNull();
  });

  it("drops a line that names no given style or carries a number", async () => {
    for (const line of ["You like red wine.", "You rate Nebbiolo 5 of 5."]) {
      const { phraser } = meteredPhraser({ factsSupportALine: true, line });
      await expect(phraser(anyCtx, PHRASE_INPUT), line).resolves.toBeNull();
    }
  });

  it("a budget refusal throws BudgetExceededError and never reaches the model", async () => {
    const { phraser, calls } = meteredPhraser(
      { factsSupportALine: true, line: "You lean towards Nebbiolo." },
      false,
    );
    await expect(phraser(anyCtx, PHRASE_INPUT)).rejects.toThrow(
      BudgetExceededError,
    );
    expect(calls).toEqual([]);
  });

  it("defaults to a loud, unconfigured phraser until installAI fills it", async () => {
    expect(tastePhraser()).toBe(unconfiguredTastePhraser);
    await expect(
      unconfiguredTastePhraser(anyCtx, PHRASE_INPUT),
    ).rejects.toThrow(/no AI provider wired for taste_phrase/);
  });
});

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

    const PLAIN_TEN =
      "You rate Nebbiolo and Syrah highest and Merlot lowest, across 1 type.";

    it("an actor built the way Dapr builds it uses the installed taste_phrase seam", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedTen(db, viewer);
        const installed = vi.fn<TastePhraser>(
          async () => "You lean towards Nebbiolo.",
        );
        setTastePhraser(installed);
        try {
          const actor = await activate(
            new TasteActor(
              new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
              new ActorId(viewer),
              db,
            ),
          );
          const profile = await actor.profile(userCtx(viewer));
          expect(installed).toHaveBeenCalledTimes(1);
          expect(profile.line).toBe("You lean towards Nebbiolo.");
          expect(profile.linePhrasedByAi).toBe(true);
        } finally {
          setTastePhraser(unconfiguredTastePhraser);
        }
      });
    });

    it("through the metered seam: thin data never charges, and abstention or refusal keep the plain line", async () => {
      await withTestDb(async (db) => {
        const thin = await seedUser(db);
        for (let i = 0; i < 3; i += 1) {
          await seedItemReview(db, thin, await wineOf(db, thin, "Syrah"), 4);
        }
        const unused = meteredPhraser({
          factsSupportALine: true,
          line: "You lean towards Syrah.",
        });
        const thinProfile = await (
          await newActor(thin, db, unused.phraser)
        ).profile(userCtx(thin));
        expect(unused.seams).toEqual([]);
        expect(unused.calls).toEqual([]);
        expect(thinProfile.linePhrasedByAi).toBe(false);

        const viewer = await seedUser(db);
        await seedTen(db, viewer);
        const abstaining = meteredPhraser({
          factsSupportALine: false,
          line: null,
        });
        const refused = meteredPhraser(
          { factsSupportALine: true, line: "You lean towards Nebbiolo." },
          false,
        );
        for (const { phraser } of [abstaining, refused]) {
          const profile = await (await newActor(viewer, db, phraser)).profile(
            userCtx(viewer),
          );
          expect(profile.line).toBe(PLAIN_TEN);
          expect(profile.linePhrasedByAi).toBe(false);
        }
        expect(abstaining.calls).toHaveLength(1);
        expect(refused.seams).toEqual(["taste_phrase"]);
        expect(refused.calls).toEqual([]);
      });
    });
  });

  describe("agreement", () => {
    it("refuses a stranger as it refuses a missing person, whatever they have rated (F-55)", async () => {
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

        // FR-7: a compare is between friends, so a stranger's five public
        // reviews in common say nothing either: the same refusal as nobody.
        const actor = await newActor(viewer, db);
        const refused = actor.agreement(userCtx(viewer), stranger);
        await expect(refused).rejects.toBeInstanceOf(NotFoundError);
        await expect(refused).rejects.toThrow(PROFILE_NOT_SHARED);
      });
    });

    it("refuses a pending request, either way round, as it refuses a missing person (F-55)", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const asked = await seedUser(db);
        const asker = await seedUser(db);
        for (let i = 0; i < AGREEMENT_MIN_SHARED + 1; i += 1) {
          const ref = await seedItemOfType(db, "WINE", viewer, `Pending ${i}`);
          await seedItemReview(db, viewer, ref, 4);
          await seedItemReview(db, asked, ref, 4);
          await seedItemReview(db, asker, ref, 4);
        }
        await db.execute(sql`
          insert into public.friend_requests (user_id, friend_id, status)
          values (${viewer}::uuid, ${asked}::uuid, 'PENDING'),
                 (${asker}::uuid, ${viewer}::uuid, 'PENDING')`);
        const actor = await newActor(viewer, db);
        for (const other of [asked, asker]) {
          const refused = actor.agreement(userCtx(viewer), other);
          await expect(refused).rejects.toBeInstanceOf(NotFoundError);
          await expect(refused).rejects.toThrow(PROFILE_NOT_SHARED);
        }
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

    it("reads every friend's ratings in one query, not one per friend (CB-3)", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const wine = await seedItemOfType(db, "WINE", viewer);
        await seedItemReview(db, viewer, wine, 4);
        const friends: string[] = [];
        for (let i = 0; i < 4; i += 1) {
          const friend = await seedUser(db, { displayName: `Friend ${i}` });
          await seedFriendship(db, viewer, friend);
          await seedFriendship(db, friend, viewer);
          await seedItemReview(db, friend, wine, 4);
          friends.push(friend);
        }
        const actor = await newActor(viewer, db);
        const execute = vi.spyOn(db, "execute");
        const rows = await actor.friendAgreements(userCtx(viewer));
        const ratingReads = execute.mock.calls.filter(([query]) =>
          JSON.stringify(query).includes("item_reviews"),
        );
        execute.mockRestore();
        expect(rows.map((row) => row.userId).sort()).toEqual(friends.sort());
        expect(rows.every((row) => row.shared === 1)).toBe(true);
        expect(ratingReads).toHaveLength(1);
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

  describe("compare (MC-compare)", () => {
    const befriend = async (db: DbOrTx, a: string, b: string) => {
      await seedFriendship(db, a, b);
      await seedFriendship(db, b, a);
    };

    it("rows for items both rated, biggest difference first, then by name, filtered by kind", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await befriend(db, viewer, friend);
        const wine = (name: string) => seedItemOfType(db, "WINE", viewer, name);
        const [a, b, c, d, e] = [
          await wine("Cmp A"),
          await wine("Cmp B"),
          await wine("Cmp C"),
          await wine("Cmp D"),
          await wine("Cmp E"),
        ] as const;
        const beer = await seedItemOfType(db, "BEER", viewer, "Cmp Beer");
        const onlyMine = await wine("Cmp Mine");
        const onlyTheirs = await wine("Cmp Theirs");
        for (const ref of [a, b, c, d, e])
          await seedItemReview(db, viewer, ref, 4);
        await seedItemReview(db, viewer, beer, 3);
        await seedItemReview(db, viewer, onlyMine, 5);
        await seedItemReview(db, friend, a, 4);
        await seedItemReview(db, friend, b, 2);
        // A friend's drink-log score is theirs to share with a friend.
        await scoreCheckIn(db, friend, c, 4.5);
        await seedItemReview(db, friend, d, 1);
        await seedItemReview(db, friend, e, 4);
        await seedItemReview(db, friend, beer, 5);
        await seedItemReview(db, friend, onlyTheirs, 3);

        const actor = await newActor(viewer, db);
        const rows = await actor.compare(userCtx(viewer), { userId: friend });
        expect(
          rows.map((row) => [row.name, row.myScore, row.theirScore]),
        ).toEqual([
          ["Cmp D", 4, 1],
          ["Cmp B", 4, 2],
          ["Cmp Beer", 3, 5],
          ["Cmp C", 4, 4.5],
          ["Cmp A", 4, 4],
          ["Cmp E", 4, 4],
        ]);
        expect(rows[0]?.item).toEqual({ type: "WINE", id: d.id });
        const beers = await actor.compare(userCtx(viewer), {
          userId: friend,
          itemType: "BEER",
        });
        expect(beers).toEqual([
          { item: beer, name: "Cmp Beer", myScore: 3, theirScore: 5 },
        ]);
      });
    });

    it("a non-friend gets nothing, though their reviews are shared enough to compare", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const stranger = await seedUser(db);
        for (let i = 0; i < AGREEMENT_MIN_SHARED + 1; i += 1) {
          const ref = await seedItemOfType(db, "WINE", viewer, `Stranger ${i}`);
          await seedItemReview(db, viewer, ref, 4);
          await seedItemReview(db, stranger, ref, 2);
        }
        const actor = await newActor(viewer, db);
        // F-55: the agreement read refuses them too, not only the rows.
        await expect(
          actor.agreement(userCtx(viewer), stranger),
        ).rejects.toThrow(PROFILE_NOT_SHARED);
        expect(
          await actor.compare(userCtx(viewer), { userId: stranger }),
        ).toEqual([]);
        // Unknown, malformed and yourself answer the same.
        for (const userId of [randomUUID(), "not-a-uuid", viewer]) {
          expect(await actor.compare(userCtx(viewer), { userId })).toEqual([]);
        }
      });
    });

    it("a friend's rating the viewer may not see never appears", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await befriend(db, viewer, friend);
        const refs: ItemRef[] = [];
        for (let i = 0; i < AGREEMENT_MIN_SHARED; i += 1) {
          refs.push(await seedItemOfType(db, "WINE", viewer, `Shared ${i}`));
        }
        for (const ref of refs) {
          await seedItemReview(db, viewer, ref, 4);
          await seedItemReview(db, friend, ref, 4);
        }
        // A log the friend wrote for a stranger is the stranger's, and its
        // score is not the friend's to compare.
        const hidden = await seedItemOfType(db, "WINE", viewer, "Hidden");
        await seedItemReview(db, viewer, hidden, 4);
        const logId = await seedCheckIn(db, {
          userId: stranger,
          item: hidden,
          createdById: friend,
        });
        await db.execute(
          sql`update public.check_ins set score = 1 where id = ${logId}::uuid`,
        );
        const rows = await (await newActor(viewer, db)).compare(
          userCtx(viewer),
          {
            userId: friend,
          },
        );
        expect(rows.map((row) => row.name).sort()).toEqual(
          refs.map((_, i) => `Shared ${i}`),
        );
      });
    });

    it("is empty below the agreement minimum, whatever the chip", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await befriend(db, viewer, friend);
        for (let i = 0; i < AGREEMENT_MIN_SHARED - 1; i += 1) {
          const ref = await seedItemOfType(db, "WINE", viewer, `Thin ${i}`);
          await seedItemReview(db, viewer, ref, 4);
          await seedItemReview(db, friend, ref, 3);
        }
        const actor = await newActor(viewer, db);
        expect(
          await actor.compare(userCtx(viewer), { userId: friend }),
        ).toEqual([]);
        expect(
          await actor.compare(userCtx(viewer), {
            userId: friend,
            itemType: "WINE",
          }),
        ).toEqual([]);
      });
    });

    it("refuses another caller and an unknown kind", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const other = await seedUser(db);
        const actor = await newActor(viewer, db);
        await expect(
          actor.compare(userCtx(other), { userId: viewer }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          actor.compare(userCtx(viewer), {
            userId: other,
            itemType: "CIDER" as "WINE",
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });
  });
});
