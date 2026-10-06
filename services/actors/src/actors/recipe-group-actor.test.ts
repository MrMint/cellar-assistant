/**
 * `RecipeGroupActor` against a real Postgres (B6).
 *
 * What this file is built to prove:
 *
 *   1. **the `recipe_votes` authorization gap is closed.** `target-stack.md`
 *      §7 records that `recipe_votes` has no permissions in Hasura metadata at
 *      all. The rule B6 chose is enforced *by construction* — every vote path
 *      addresses `(recipeId, ctx.viewerId)` and no method takes a user id — so
 *      the proof is behavioural: a second user voting on the same recipe adds
 *      a row rather than editing the first user's, and `removeVote` withdraws
 *      only the caller's own;
 *   2. **the PL/pgSQL trigger is gone and this actor does its job** (§6 B6's
 *      own acceptance). The test asserts both halves: `update_canonical_recipe`
 *      no longer exists in the database, and `vote` recomputes
 *      `canonical_recipe_id` and `name` in-turn with the trigger's exact rule
 *      (highest net score, oldest wins ties);
 *   3. **vote counting is idempotent under redelivery.** Votes are rows under
 *      a unique constraint and the canonical is *recomputed*, never
 *      incremented, so neither a repeated `vote` nor a re-delivered outbox row
 *      can move a count. The outbox half is exercised end to end: the rows
 *      `vote` writes are delivered to `RecipeActor.regenerateVector` twice;
 *   4. owner / friend / stranger for every viewer-dependent method.
 */
import { randomUUID } from "node:crypto";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { outbox, recipeVectors, recipeVotes } from "@cellar-assistant/db";
import { eq, inArray, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedDocument } from "../lib/embedding-client.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { RecipeActor } from "./recipe-actor.ts";
import { RecipeGroupActor } from "./recipe-group-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const page = pageArgs({ first: 50 });

const newGroupActor = (id: string, db: DbOrTx): RecipeGroupActor =>
  new RecipeGroupActor(daprClient(), new ActorId(id), db);

const fakeEmbed =
  (calls: string[]): EmbedDocument =>
  async (_ctx, { text }) => {
    calls.push(text);
    return {
      vector: Array.from({ length: 768 }, (_value, index) => (index % 5) / 5),
      model: null,
    };
  };

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const seedFriendship = async (
  db: DbOrTx,
  userId: string,
  friendId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${userId}::uuid, ${friendId}::uuid) on conflict do nothing
  `);
};

const seedGroup = async (
  db: DbOrTx,
  options: { createdById: string | null; name?: string },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipe_groups (id, name, category, created_by_id)
    values (${id}::uuid, ${options.name ?? "Negroni"}, 'cocktail',
            ${options.createdById}::uuid)
  `);
  return id;
};

/**
 * `created_at` is supplied explicitly on every recipe: inside `withTestDb`'s
 * single transaction `now()` is constant, so the trigger's "oldest wins ties"
 * rule would be undecidable without it (B1's harness note).
 */
const seedRecipe = async (
  db: DbOrTx,
  options: {
    createdById: string;
    recipeGroupId: string;
    name: string;
    createdAt: string;
  },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipes (id, name, type, created_by_id, recipe_group_id, created_at, updated_at)
    values (${id}::uuid, ${options.name}, 'cocktail', ${options.createdById}::uuid,
            ${options.recipeGroupId}::uuid, ${options.createdAt}::timestamptz,
            ${options.createdAt}::timestamptz)
  `);
  return id;
};

/**
 * `outbox` is exempt from `withTestDb`'s isolation in one direction: the table
 * holds rows committed by earlier, non-rolled-back runs (A5's probe job leaves
 * some). Every assertion here is therefore scoped to the ids this test minted.
 */
const outboxRows = async (
  db: DbOrTx,
  targetIds: readonly string[],
): Promise<{ targetActor: string; targetId: string; method: string }[]> =>
  targetIds.length === 0
    ? []
    : await db
        .select({
          targetActor: outbox.targetActor,
          targetId: outbox.targetId,
          method: outbox.method,
        })
        .from(outbox)
        .where(inArray(outbox.targetId, [...targetIds]));

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("RecipeGroupActor", () => {
  afterAll(closeTestDb);

  /* ---------------------------------------------------------------------- */
  /* Visibility                                                              */
  /* ---------------------------------------------------------------------- */

  describe("visibility (catalog: any signed-in viewer, anonymous refused)", () => {
    it("serves get/recipes/votes to owner, friend and stranger alike", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);

        const groupId = await seedGroup(db, { createdById: owner });
        await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));

        for (const [label, viewer] of [
          ["owner", owner],
          ["friend", friend],
          ["stranger", stranger],
        ] as const) {
          const ctx = userCtx(viewer, `r-${label}`);
          expect((await actor.get(ctx)).id, label).toBe(groupId);
          expect((await actor.recipes(ctx, page)).totalCount, label).toBe(1);
          expect((await actor.votes(ctx, page)).totalCount, label).toBe(0);
        }
      });
    });

    it("refuses an anonymous viewer", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const actor = await activate(newGroupActor(groupId, db));
        const anon = anonymousCtx("r");

        await expect(actor.get(anon)).rejects.toThrow(ForbiddenError);
        await expect(actor.recipes(anon, page)).rejects.toThrow(ForbiddenError);
        await expect(actor.votes(anon, page)).rejects.toThrow(ForbiddenError);
        await expect(
          actor.vote(anon, { recipeId: randomUUID(), voteType: "upvote" }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("is NotFound for an id with no row", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const actor = await activate(newGroupActor(randomUUID(), db));
        await expect(actor.get(userCtx(viewer, "r"))).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* create / update                                                         */
  /* ---------------------------------------------------------------------- */

  describe("create and update", () => {
    it("is idempotent on the actor id", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const groupId = randomUUID();
        const actor = await activate(newGroupActor(groupId, db));

        const first = await actor.create(ctx, {
          name: "  Negroni  ",
          category: "cocktail",
          tags: ["bitter", "stirred"],
        });
        const second = await actor.create(ctx, {
          name: "Something else",
          category: "punch",
        });
        expect(first.name).toBe("Negroni");
        expect(first.tags).toEqual(["bitter", "stirred"]);
        expect(second).toEqual(first);
      });
    });

    it("refuses an unknown category and an anonymous creator", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const actor = await activate(newGroupActor(randomUUID(), db));
        await expect(
          actor.create(userCtx(owner, "r"), {
            name: "x",
            category: "smoothie" as never,
          }),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.create(anonymousCtx("r"), { name: "x", category: "cocktail" }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("update is creator only, and fans out regenerations only on an embedding-relevant change", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const groupId = await seedGroup(db, { createdById: owner });
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));

        await expect(
          actor.update(userCtx(friend, "r"), { name: "Friend's" }),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.update(userCtx(stranger, "r"), { name: "Stranger's" }),
        ).rejects.toThrow(ForbiddenError);

        await actor.update(userCtx(owner, "r"), {
          imageUrl: "https://example.test/a.png",
        });
        expect(await outboxRows(db, [recipeId])).toEqual([]);

        await actor.update(userCtx(owner, "r"), { name: "Negroni Sbagliato" });
        expect(await outboxRows(db, [recipeId])).toEqual([
          {
            targetActor: "RecipeActor",
            targetId: recipeId,
            method: "regenerateVector",
          },
        ]);

        expect(
          (await actor.update(adminCtx(stranger, "r"), { baseSpirit: "gin" }))
            .baseSpirit,
        ).toBe("gin");
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The canonical recompute — §6 B6's acceptance                            */
  /* ---------------------------------------------------------------------- */

  describe("canonical recipe", () => {
    it("the PL/pgSQL trigger and its function are gone from the database", async () => {
      await withTestDb(async (db) => {
        const triggers = await db.execute<{ tgname: string }>(sql`
          select tgname from pg_trigger
           where tgrelid = 'public.recipe_votes'::regclass
             and not tgisinternal
        `);
        expect(triggers.rows.map((row) => row.tgname)).toEqual([
          // The only survivor is the generic `updated_at` stamper.
          "update_recipe_votes_updated_at",
        ]);

        const functions = await db.execute<{ proname: string }>(sql`
          select proname from pg_proc
           where proname in ('update_canonical_recipe',
                             'trigger_recipe_group_embedding_update')
        `);
        expect(functions.rows).toEqual([]);
      });
    });

    it("moves canonical_recipe_id and name by net score, oldest wins ties", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const voterA = await seedUser(db);
        const voterB = await seedUser(db);
        const groupId = await seedGroup(db, {
          createdById: owner,
          name: "Negroni",
        });
        const older = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "Classic Negroni",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const newer = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "Negroni, house style",
          createdAt: "2026-02-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));

        // First vote: both are net 0 until it lands, so the winner is decided
        // by the vote itself — and the group's name follows the winner, which
        // is exactly `name = COALESCE(new_canonical_name, name)`.
        const first = await actor.vote(userCtx(voterA, "r"), {
          recipeId: newer,
          voteType: "upvote",
        });
        expect(first.canonicalChanged).toBe(true);
        expect(first.group.canonicalRecipeId).toBe(newer);
        expect(first.group.name).toBe("Negroni, house style");
        expect(first.netScore).toBe(1);

        // Two downvotes push it below the older one, which is still net 0.
        await actor.vote(userCtx(voterA, "r"), {
          recipeId: newer,
          voteType: "downvote",
        });
        const moved = await actor.vote(userCtx(voterB, "r"), {
          recipeId: newer,
          voteType: "downvote",
        });
        expect(moved.netScore).toBe(-2);
        expect(moved.group.canonicalRecipeId).toBe(older);
        expect(moved.group.name).toBe("Classic Negroni");

        // Now an actual tie, with votes on both sides of it: voter A flips
        // back to an upvote, so the newer recipe is +1 -1 = 0, level with the
        // older one's 0. The title's "oldest wins ties" is decided here and
        // only here — this used to stop at -2 vs 0, which a "newest wins"
        // tie-break passed just as well (W4 mutant R1). With it, the canonical
        // would move to the newer recipe; it must stay put.
        const tied = await actor.vote(userCtx(voterA, "r"), {
          recipeId: newer,
          voteType: "upvote",
        });
        expect(tied.netScore).toBe(0);
        expect(tied.canonicalChanged).toBe(false);
        expect(tied.group.canonicalRecipeId).toBe(older);
        expect(tied.group.name).toBe("Classic Negroni");

        // `recipes` is ordered the same way the canonical is chosen, the tie
        // included.
        const ranked = await actor.recipes(userCtx(owner, "r"), page);
        expect(ranked.entries.map((entry) => entry.node)).toEqual([
          older,
          newer,
        ]);
      });
    });

    /**
     * The regression test for the one bug the in-process suite could not have
     * found on its own: membership is `recipes.recipe_group_id`, a column
     * `RecipeActor` writes, so a cached member list goes stale with nothing to
     * invalidate it. Measured against the running stack — an activation that
     * predated the recipe answered "recipe X is not in group Y" for a recipe
     * that was. Everything here happens on ONE activation on purpose.
     */
    it("sees a recipe added to the group after this activation started", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const actor = await activate(newGroupActor(groupId, db));

        // Activated while the group is empty.
        expect((await actor.get(userCtx(owner, "r"))).recipeCount).toBe(0);

        // A *different* aggregate writes the membership column.
        const recipeId = randomUUID();
        const recipeActor = await activate(
          new RecipeActor(
            daprClient(),
            new ActorId(recipeId),
            db,
            async () => {
              throw new Error("no ItemActor in this test");
            },
            fakeEmbed([]),
          ),
        );
        await recipeActor.create(userCtx(owner, "r"), {
          name: "Added later",
          type: "cocktail",
          recipeGroupId: groupId,
        });

        // The same activation, no reload() call in the test.
        expect((await actor.get(userCtx(owner, "r"))).recipeCount).toBe(1);
        expect(
          (await actor.recipes(userCtx(owner, "r"), page)).entries.map(
            (entry) => entry.node,
          ),
        ).toEqual([recipeId]);
        const voted = await actor.vote(userCtx(owner, "r"), {
          recipeId,
          voteType: "upvote",
        });
        expect(voted.canonicalChanged).toBe(true);
        expect(voted.group.canonicalRecipeId).toBe(recipeId);
      });
    });

    it("refuses a vote on a recipe that is not in this group", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const otherGroupId = await seedGroup(db, { createdById: owner });
        const outsider = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: otherGroupId,
          name: "Elsewhere",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));

        await expect(
          actor.vote(userCtx(owner, "r"), {
            recipeId: outsider,
            voteType: "upvote",
          }),
        ).rejects.toThrow(NotFoundError);
      });
    });

    /**
     * Review W4 #3. Membership is `===` against Postgres's lowercase ids, so
     * an uppercase copy of a member's id used to be refused as
     * `RECIPE_NOT_IN_GROUP`, and omitted from `voteSummaries`.
     */
    it("reads an uppercase recipe id as the member it names", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const recipe = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "Only",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));
        const ctx = userCtx(owner, "r");

        const voted = await actor.vote(ctx, {
          recipeId: recipe.toUpperCase(),
          voteType: "upvote",
        });
        expect(voted.vote.recipeId).toBe(recipe);
        expect(voted.netScore).toBe(1);
        expect(
          (await actor.voteSummaries(ctx, [recipe.toUpperCase()])).map(
            (row) => [row.recipeId, row.upvotes],
          ),
        ).toEqual([[recipe, 1]]);
        expect(await actor.removeVote(ctx, recipe.toUpperCase())).toMatchObject(
          { recipeId: recipe, userId: owner },
        );
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The `recipe_votes` gap                                                  */
  /* ---------------------------------------------------------------------- */

  describe("recipe_votes: the rule chosen for a table that had none", () => {
    it("lets the group's creator, a friend and a stranger all vote (catalog rule)", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const groupId = await seedGroup(db, { createdById: owner });
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));

        for (const [label, viewer] of [
          ["owner", owner],
          ["friend", friend],
          ["stranger", stranger],
        ] as const) {
          const result = await actor.vote(userCtx(viewer, `r-${label}`), {
            recipeId,
            voteType: "upvote",
          });
          expect(result.vote.userId, label).toBe(viewer);
        }
        expect((await actor.votes(userCtx(owner, "r"), page)).totalCount).toBe(
          3,
        );
      });
    });

    it("a second voter cannot touch the first voter's row, and removeVote takes only your own", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const author = await seedUser(db);
        const other = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));

        const mine = await actor.vote(userCtx(author, "r"), {
          recipeId,
          voteType: "upvote",
        });
        const theirs = await actor.vote(userCtx(other, "r"), {
          recipeId,
          voteType: "downvote",
        });

        // Two rows, one per person — `other` voting did not rewrite `author`'s.
        expect(theirs.vote.id).not.toBe(mine.vote.id);
        const rows = await db
          .select({
            id: recipeVotes.id,
            userId: recipeVotes.userId,
            voteType: recipeVotes.voteType,
          })
          .from(recipeVotes)
          .where(eq(recipeVotes.recipeId, recipeId));
        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.userId === author)?.voteType).toBe(
          "upvote",
        );

        // `removeVote` takes `(recipeId, ctx.viewerId)`: there is no argument
        // by which `other` could name `author`'s row.
        await actor.removeVote(userCtx(other, "r"), recipeId);
        const survivors = await db
          .select({ userId: recipeVotes.userId })
          .from(recipeVotes)
          .where(eq(recipeVotes.recipeId, recipeId));
        expect(survivors).toEqual([{ userId: author }]);

        // …and a caller who never voted has nothing to withdraw.
        await expect(
          actor.removeVote(userCtx(other, "r"), recipeId),
        ).rejects.toThrow(NotFoundError);
        await expect(
          actor.removeVote(anonymousCtx("r"), recipeId),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("changing your mind is an upsert, not a second row", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const voter = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));
        const ctx = userCtx(voter, "r");

        const up = await actor.vote(ctx, { recipeId, voteType: "upvote" });
        const down = await actor.vote(ctx, { recipeId, voteType: "downvote" });
        expect(down.vote.id).toBe(up.vote.id);
        expect(down.netScore).toBe(-1);
        expect((await actor.votes(userCtx(owner, "r"), page)).totalCount).toBe(
          1,
        );
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Idempotency, including through the outbox                               */
  /* ---------------------------------------------------------------------- */

  describe("vote counting is idempotent", () => {
    it("re-casting the same vote changes no count and enqueues nothing new", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const voter = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));
        const ctx = userCtx(voter, "r");

        const first = await actor.vote(ctx, { recipeId, voteType: "upvote" });
        expect(first.canonicalChanged).toBe(true);
        const afterFirst = await outboxRows(db, [recipeId]);
        expect(afterFirst).toHaveLength(1);

        const second = await actor.vote(ctx, { recipeId, voteType: "upvote" });
        // The canonical is recomputed from the rows, never incremented, so a
        // repeat is a no-op — there is no counter to double.
        expect(second.netScore).toBe(1);
        expect(second.canonicalChanged).toBe(false);
        expect(await outboxRows(db, [recipeId])).toEqual(afterFirst);
        expect((await actor.votes(ctx, page)).totalCount).toBe(1);
      });
    });

    /**
     * The outbox half of the acceptance criterion. `vote`'s only outbox row is
     * a `RecipeActor.regenerateVector`; delivery is at least once, so it is
     * delivered twice here. Neither the vote count nor the canonical moves,
     * and one vector row exists at the end rather than two.
     */
    it("a re-delivered regenerateVector leaves votes and the canonical alone", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const voter = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const groupActor = await activate(newGroupActor(groupId, db));
        const before = await groupActor.vote(userCtx(voter, "r"), {
          recipeId,
          voteType: "upvote",
        });

        const rows = await outboxRows(db, [recipeId]);
        expect(rows).toEqual([
          {
            targetActor: "RecipeActor",
            targetId: recipeId,
            method: "regenerateVector",
          },
        ]);

        const embedded: string[] = [];
        const deliver = async (): Promise<boolean> => {
          const recipeActor = await activate(
            new RecipeActor(
              daprClient(),
              new ActorId(recipeId),
              db,
              async () => {
                throw new Error("no ItemActor in this test");
              },
              fakeEmbed(embedded),
            ),
          );
          const result = await recipeActor.regenerateVector(
            testDelivery("row-1"),
            { reason: "canonical changed", recipeGroupId: groupId },
          );
          return result.skipped;
        };

        expect(await deliver()).toBe(false);
        expect(await deliver()).toBe(true);
        expect(embedded).toHaveLength(1);

        const vectors = await db
          .select({ id: recipeVectors.id })
          .from(recipeVectors)
          .where(eq(recipeVectors.recipeId, recipeId));
        expect(vectors).toHaveLength(1);

        // Nothing about the vote or the canonical moved.
        const after = await groupActor.get(userCtx(owner, "r"));
        expect(after.canonicalRecipeId).toBe(before.group.canonicalRecipeId);
        expect(
          (await groupActor.votes(userCtx(owner, "r"), page)).totalCount,
        ).toBe(1);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* A7d item 4: voteSummaries                                                */
  /* ---------------------------------------------------------------------- */

  describe("voteSummaries (A7d item 4)", () => {
    it("tallies per recipe and names the caller's own vote", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const voterA = await seedUser(db);
        const voterB = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const first = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const second = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v2",
          createdAt: "2026-01-02T00:00:00Z",
        });

        const actor = await activate(newGroupActor(groupId, db));
        await actor.vote(userCtx(voterA, "r"), {
          recipeId: first,
          voteType: "upvote",
        });
        await actor.vote(userCtx(voterB, "r"), {
          recipeId: first,
          voteType: "upvote",
        });
        await actor.vote(userCtx(voterA, "r"), {
          recipeId: second,
          voteType: "downvote",
        });

        const summaries = await actor.voteSummaries(userCtx(voterA, "r"), [
          first,
          second,
        ]);
        expect(summaries).toEqual([
          {
            recipeId: first,
            upvotes: 2,
            downvotes: 0,
            netScore: 2,
            myVote: "upvote",
          },
          {
            recipeId: second,
            upvotes: 0,
            downvotes: 1,
            netScore: -1,
            myVote: "downvote",
          },
        ]);

        // `myVote` is the *caller's*, so the same rows read differently for a
        // viewer who has not voted. netScore is not viewer-dependent.
        const asOwner = await actor.voteSummaries(userCtx(owner, "r"), [first]);
        expect(asOwner).toEqual([
          {
            recipeId: first,
            upvotes: 2,
            downvotes: 0,
            netScore: 2,
            myVote: null,
          },
        ]);

        // upvotes/downvotes are carried separately because a net of 0 cannot
        // distinguish "nobody voted" from "one each way" — and a versions list
        // shows those two differently.
        await actor.vote(userCtx(voterB, "r"), {
          recipeId: second,
          voteType: "upvote",
        });
        const [tied] = await actor.voteSummaries(userCtx(owner, "r"), [second]);
        expect(tied).toEqual({
          recipeId: second,
          upvotes: 1,
          downvotes: 1,
          netScore: 0,
          myVote: null,
        });
      });
    });

    it("omits a non-member rather than refusing the whole batch", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const other = await seedGroup(db, {
          createdById: owner,
          name: "Elsewhere",
        });
        const member = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const outsider = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: other,
          name: "elsewhere v1",
          createdAt: "2026-01-01T00:00:00Z",
        });

        const actor = await activate(newGroupActor(groupId, db));
        const summaries = await actor.voteSummaries(userCtx(owner, "r"), [
          member,
          outsider,
          randomUUID(),
        ]);
        // One stale id on a page must not blank the page — unlike `vote`,
        // which raises RECIPE_NOT_IN_GROUP for the same input.
        expect(summaries.map((row) => row.recipeId)).toEqual([member]);
      });
    });

    it("refuses an anonymous caller, like every other read here", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const actor = await activate(newGroupActor(groupId, db));
        await expect(
          actor.voteSummaries(anonymousCtx("r"), []),
        ).rejects.toBeInstanceOf(ForbiddenError);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* A7d items 7 and 8                                                        */
  /* ---------------------------------------------------------------------- */

  describe("delete and recomputeCanonical (A7d items 7, 8)", () => {
    it("refuses to delete a group that still holds recipes", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "v1",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const actor = await activate(newGroupActor(groupId, db));

        // `recipes.recipe_group_id` is ON DELETE SET NULL, so a permissive
        // delete would orphan the versions rather than remove them. Refusing
        // is the CellarActor precedent.
        await expect(actor.delete(userCtx(owner, "r"))).rejects.toBeInstanceOf(
          ConflictError,
        );

        const { rows } = await db.execute<{ n: string }>(sql`
          select count(*) as n from public.recipe_groups
          where id = ${groupId}::uuid
        `);
        expect(Number(rows[0]?.n ?? 0)).toBe(1);
      });
    });

    it("deletes an empty group, creator only", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const stranger = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const actor = await activate(newGroupActor(groupId, db));

        await expect(
          actor.delete(userCtx(stranger, "r")),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(actor.delete(anonymousCtx("r"))).rejects.toBeInstanceOf(
          ForbiddenError,
        );

        expect(await actor.delete(userCtx(owner, "r"))).toEqual({
          id: groupId,
        });
        const { rows } = await db.execute<{ n: string }>(sql`
          select count(*) as n from public.recipe_groups
          where id = ${groupId}::uuid
        `);
        expect(Number(rows[0]?.n ?? 0)).toBe(0);
      });
    });

    it("recomputeCanonical is system-only and picks the next winner", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const voter = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const winner = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "winner",
          createdAt: "2026-01-01T00:00:00Z",
        });
        const runnerUp = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          name: "runner up",
          createdAt: "2026-01-02T00:00:00Z",
        });

        const actor = await activate(newGroupActor(groupId, db));
        await actor.vote(userCtx(voter, "r"), {
          recipeId: winner,
          voteType: "upvote",
        });
        expect((await actor.get(userCtx(owner, "r"))).canonicalRecipeId).toBe(
          winner,
        );

        await expect(
          actor.recomputeCanonical(userCtx(owner, "r")),
        ).rejects.toBeInstanceOf(ForbiddenError);

        // What `RecipeActor.delete` enqueues: the member is gone and the FK
        // has already nulled the pointer, so the group has to choose again.
        await db.execute(
          sql`delete from public.recipes where id = ${winner}::uuid`,
        );
        const after = await actor.recomputeCanonical(testDelivery("recompute"));
        expect(after.canonicalRecipeId).toBe(runnerUp);

        // Idempotent: a redelivery writes nothing and returns the same answer.
        expect(
          (await actor.recomputeCanonical(testDelivery("recompute")))
            .canonicalRecipeId,
        ).toBe(runnerUp);
      });
    });

    it("names RECIPE_NOT_IN_GROUP on a vote for a non-member", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const voter = await seedUser(db);
        const groupId = await seedGroup(db, { createdById: owner });
        const other = await seedGroup(db, {
          createdById: owner,
          name: "Elsewhere",
        });
        const outsider = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: other,
          name: "elsewhere v1",
          createdAt: "2026-01-01T00:00:00Z",
        });

        const actor = await activate(newGroupActor(groupId, db));
        await expect(
          actor.vote(userCtx(voter, "r"), {
            recipeId: outsider,
            voteType: "upvote",
          }),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          reason: "RECIPE_NOT_IN_GROUP",
        });
      });
    });
  });
});
