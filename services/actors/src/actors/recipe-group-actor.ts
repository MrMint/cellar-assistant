/**
 * `RecipeGroupActor` — B6 (migration plan §2.1, §3).
 *
 * > **`RecipeGroupActor(groupId)`**
 * > - Owns: `recipe_groups`, `recipe_votes`.
 * > - Methods: `get`, `create`, `vote` (recomputes `canonical_recipe_id` and
 * >   `name` in-turn — replaces the PL/pgSQL trigger), `recipes(page)`.
 *
 * A group is one drink ("Negroni"); a recipe is one version of it. Votes are
 * cast *on a recipe* but owned *by the group*, because what they decide is the
 * group's `canonical_recipe_id`. That is why §3's table→writer map puts
 * `recipe_votes` here and not on `RecipeActor`, and it is what makes the
 * recompute a single-actor, single-turn operation rather than a distributed
 * one.
 *
 * ## The trigger this replaces, and what it did
 *
 * `update_canonical_recipe()` fired `AFTER INSERT | UPDATE | DELETE` on
 * `recipe_votes` and, for the affected group:
 *
 *   1. picked the recipe with the highest net score (`upvote` = +1,
 *      `downvote` = −1), oldest wins ties;
 *   2. if that differed from the stored `canonical_recipe_id`, wrote it back
 *      together with `name = COALESCE(<winner's name>, name)`.
 *
 * `#recomputeCanonical` below is that function, in TypeScript, inside the same
 * transaction as the vote (§2.1's "in-turn"). Two differences are deliberate
 * and both are recorded in the B6 report: the tie-break gains `id asc` after
 * `created_at asc`, because inside one transaction `now()` is constant and
 * every `created_at` ties; and a group with recipes but no votes still
 * resolves a canonical (net 0 for everyone, oldest wins) rather than leaving
 * it null, which is what the SQL did too — it just never ran until the first
 * vote existed.
 *
 * A second trigger, `trigger_recipe_group_embedding_update`, fired `BEFORE
 * UPDATE` on `recipe_groups` and bumped `updated_at` when
 * `canonical_recipe_id` changed, with a comment saying the actual embedding
 * work "will be handled by a separate function". `packages/db/transform/03_…`
 * records its destination as **outbox-driven**, and this is it: when the
 * canonical moves, every recipe in the group gets a `RecipeActor.
 * regenerateVector` row in the same transaction. Every one of them needs it,
 * because a recipe's embedding text includes its group's *name* — which is
 * exactly what just changed.
 *
 * ## `recipe_votes` had no authorization rule at all
 *
 * `docs/architecture/target-stack.md` §7 lists it: no permissions in Hasura
 * metadata, written with the admin secret. B6's rule, matching the one it
 * chose for `recipe_reviews`:
 *
 *   - **cast / change a vote** — any signed-in user, on a recipe *in this
 *     group*; anonymous refused;
 *   - **another user's vote** — unreachable **by construction**. Both `vote`
 *     and `removeVote` address the row as `(recipeId, ctx.viewerId)`; no
 *     method takes a `userId`, a vote id, or anything else that could name
 *     someone else's row. There is nothing to check because there is nothing
 *     to ask for.
 *
 * The "on a recipe in this group" clause is itself new: today a caller with
 * the admin secret can write a `recipe_votes` row pointing at any recipe in
 * the database, and nothing relates it to the group whose canonical it moves.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  CreateRecipeGroupInput,
  Ctx,
  DeletedRecipeGroup,
  Page,
  PageArgs,
  RecipeCategory,
  RecipeGroupActorInterface,
  RecipeGroupDto,
  RecipeVoteDto,
  RecipeVoteResult,
  RecipeVoteSummaryDto,
  RecipeVoteType,
  RemovedRecipeVote,
  UpdateRecipeGroupInput,
  VoteOnRecipeInput,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  isRecipeVoteType,
  NotFoundError,
  offsetPage,
  RECIPE_CATEGORIES,
  RecipeGroupActorDescriptor,
  ValidationError,
  voteWeight,
} from "@cellar-assistant/contracts";
import { recipeGroups, recipes, recipeVotes } from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import { bypassesPolicy, isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import {
  requirePrivileged,
  requireSignedIn,
  requireViewer,
} from "../lib/guards.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import { isUuid, requireUuid } from "../lib/uuid.ts";

type RecipeGroupRow = typeof recipeGroups.$inferSelect;
type RecipeVoteRow = typeof recipeVotes.$inferSelect;

/** What the canonical recompute needs from each member recipe. */
type MemberRecipe = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date | null;
};

/**
 * **Only the `recipe_groups` row is cached.** §1.3 lets an actor cache its
 * aggregate on activate; §1.2 says every table has exactly one writer. Together
 * those mean an actor may cache only what it *owns* — and membership of a group
 * is `recipes.recipe_group_id`, a column `RecipeActor` writes. A recipe created
 * into this group after this activation started would be invisible to a cached
 * list, with nothing to invalidate it: `vote` would answer "that recipe is not
 * in this group" for a recipe that is. Measured against the running stack
 * before it was written this way.
 *
 * So membership and the votes that hang off it are read fresh, per call, by
 * `#snapshot()`. Two indexed `SELECT`s on a path nobody calls in a loop is the
 * right price for not being wrong.
 */
export type RecipeGroupAggregate = {
  readonly group: RecipeGroupRow;
};

/** A group plus the cross-aggregate rows a decision needs, all read fresh. */
type RecipeGroupSnapshot = {
  readonly group: RecipeGroupRow;
  /** `created_at asc, id asc` — the tie-break order the recompute uses. */
  readonly recipes: readonly MemberRecipe[];
  /** Every vote on every recipe in this group. */
  readonly votes: readonly RecipeVoteRow[];
};

/** `recipe_groups_name_check`: `length(name) > 0`. */
const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed === "") throw new ValidationError("a recipe group needs a name");
  if (trimmed.length > 300) {
    throw new ValidationError(
      "a recipe group's name must be 300 characters or less",
    );
  }
  return trimmed;
};

const requireCategory = (value: string): RecipeCategory => {
  if (!(RECIPE_CATEGORIES as readonly string[]).includes(value)) {
    throw new ValidationError(
      `category must be one of ${RECIPE_CATEGORIES.join("|")}, got ${value}`,
    );
  }
  return value as RecipeCategory;
};

const requireVoteType = (value: string): RecipeVoteType => {
  if (!isRecipeVoteType(value)) {
    throw new ValidationError(
      `voteType must be upvote or downvote (recipe_votes_vote_type_check), got ${value}`,
    );
  }
  return value;
};

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const voteRowToDto = (row: RecipeVoteRow): RecipeVoteDto => ({
  id: row.id,
  recipeId: row.recipeId,
  userId: row.userId,
  voteType: requireVoteType(row.voteType),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/**
 * The `recipe_groups` columns a member recipe's embedding text reads
 * (`RecipeActor.#embeddingText`). `image_url` is the inert one.
 */
const GROUP_EMBEDDING_FIELDS: readonly string[] = [
  "name",
  "description",
  "category",
  "baseSpirit",
  "tags",
];

/** Epoch for a null `created_at`, so the "oldest wins" tie-break is total. */
const createdAtOrEpoch = (recipe: MemberRecipe): number =>
  recipe.createdAt?.getTime() ?? 0;

export class RecipeGroupActor
  extends EntityActorBase<RecipeGroupAggregate>
  implements RecipeGroupActorInterface
{
  static readonly category: ActorCategory = RecipeGroupActorDescriptor.category;

  constructor(daprClient: DaprClient, id: ActorId, db: DbOrTx = actorDb()) {
    super(daprClient, id, db);
  }

  protected async loadAggregate(
    id: string,
  ): Promise<RecipeGroupAggregate | null> {
    if (!isUuid(id)) return null;

    const [group] = await this.db
      .select()
      .from(recipeGroups)
      .where(eq(recipeGroups.id, id));
    return group === undefined ? null : { group };
  }

  /** The group plus a *fresh* read of its members and their votes. */
  async #snapshot(): Promise<RecipeGroupSnapshot> {
    const { group } = this.requireAggregate();
    const id = this.key;

    const members = await this.db
      .select({
        id: recipes.id,
        name: recipes.name,
        createdAt: recipes.createdAt,
      })
      .from(recipes)
      .where(eq(recipes.recipeGroupId, id))
      .orderBy(sql`${recipes.createdAt} asc, ${recipes.id} asc`);

    // `inArray` with an empty list is not a query worth issuing, and Drizzle
    // renders it as a constant-false predicate anyway.
    const votes =
      members.length === 0
        ? []
        : await this.db
            .select()
            .from(recipeVotes)
            .where(
              inArray(
                recipeVotes.recipeId,
                members.map((recipe) => recipe.id),
              ),
            )
            .orderBy(sql`${recipeVotes.createdAt} asc, ${recipeVotes.id} asc`);

    return { group, recipes: members, votes };
  }

  /* ---------------------------------------------------------------------- */
  /* Policy                                                                  */
  /* ---------------------------------------------------------------------- */

  // Reads are catalog data: today's `recipe_groups` select filter is `{}` for
  // `user`, so they take `requireSignedIn` (`../lib/guards.ts`).

  /** Today's `recipe_groups` update filter: `created_by_id = session user`. */
  #requireCreator(ctx: Ctx, group: RecipeGroupRow, what: string): void {
    if (bypassesPolicy(ctx)) return;
    if (group.createdById === null) {
      throw new ForbiddenError(
        `recipe group ${this.key} has no creator; only an admin may ${what}`,
      );
    }
    if (isOwner(ctx, group.createdById)) return;
    throw new ForbiddenError(
      `recipe group ${this.key} is not yours to ${what}`,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<RecipeGroupDto> {
    this.requireAggregate();
    requireSignedIn(ctx, "view a recipe group");
    return this.#toDto(await this.#snapshot());
  }

  /**
   * Recipe **ids**, hydrated by `services/api`'s `Recipe` DataLoader (§1.5: "ids
   * for owned lists whose entity actors are cheap and likely warm").
   *
   * Ordered exactly the way the canonical is chosen — net score descending,
   * then oldest — so the first entry of the first page *is* the canonical
   * recipe, and a versions list reads top-down in the order the votes put it.
   */
  async recipes(ctx: Ctx, page: PageArgs): Promise<Page<string>> {
    this.requireAggregate();
    requireSignedIn(ctx, "view a recipe group's recipes");
    const snapshot = await this.#snapshot();
    return offsetPage(
      this.#rankedRecipes(snapshot).map((recipe) => recipe.id),
      page,
    );
  }

  async votes(ctx: Ctx, page: PageArgs): Promise<Page<RecipeVoteDto>> {
    this.requireAggregate();
    requireSignedIn(ctx, "view a recipe group's votes");
    return offsetPage((await this.#snapshot()).votes.map(voteRowToDto), page);
  }

  /**
   * Vote tallies for the named members, plus **this caller's** own vote
   * (A7d item 4).
   *
   * `RecipeVersions` used to page this actor's `votes` 100 at a time and tally
   * in the browser, because `netScore` lived only on `RecipeVotePayload` — the
   * answer to a vote you had just cast. That was fine at tens of votes, wrong
   * at thousands, and *silently* wrong rather than merely slow once a recipe
   * passed the page cap.
   *
   * Batched rather than per-recipe, and that is the whole reason it takes an
   * array: `#snapshot()` already reads every vote for every member, so
   * answering for twenty versions costs exactly what answering for one does.
   * A `summary(recipeId)` method would have run twenty turns in series, since
   * Dapr gives one activation one turn at a time.
   *
   * A non-member or unknown id is **omitted**, not refused — unlike `vote`,
   * which raises `RECIPE_NOT_IN_GROUP`. This is a read behind a batched
   * resolver, and a caller's one stale id should not blank a whole page. The
   * caller matches results back by `recipeId`.
   */
  async voteSummaries(
    ctx: Ctx,
    recipeIds: readonly string[],
  ): Promise<readonly RecipeVoteSummaryDto[]> {
    this.requireAggregate();
    requireSignedIn(ctx, "view a recipe group's votes");
    const snapshot = await this.#snapshot();
    const members = new Set(snapshot.recipes.map((recipe) => recipe.id));
    const viewer = ctx.viewerId;

    // Lowercased, not `requireUuid`d: a non-uuid is just not a member, and is
    // omitted like any other stale id (above). The members are Postgres's
    // lowercase spelling, so an uppercase copy of one is that member.
    const wanted = [
      ...new Set(recipeIds.map((id) => String(id).toLowerCase())),
    ].filter((id) => members.has(id));
    return wanted.map((recipeId) => {
      const cast = snapshot.votes.filter((row) => row.recipeId === recipeId);
      let upvotes = 0;
      let downvotes = 0;
      let myVote: RecipeVoteType | null = null;
      for (const row of cast) {
        const voteType = requireVoteType(row.voteType);
        if (voteType === "upvote") upvotes += 1;
        else downvotes += 1;
        if (viewer !== null && row.userId === viewer) myVote = voteType;
      }
      return {
        recipeId,
        upvotes,
        downvotes,
        netScore: upvotes - downvotes,
        myVote,
      };
    });
  }

  /* ---------------------------------------------------------------------- */
  /* The group itself                                                        */
  /* ---------------------------------------------------------------------- */

  /** Provisional-id pattern; idempotent on `this.key` (§8.4). */
  async create(
    ctx: Ctx,
    input: CreateRecipeGroupInput,
  ): Promise<RecipeGroupDto> {
    requireUuid(this.key, "recipeGroupId");
    requireSignedIn(ctx, "create a recipe group");
    if (this.aggregate !== null) return this.#toDto(await this.#snapshot());

    const name = requireName(input.name);
    const category = requireCategory(input.category);

    await this.tx(async (tx) => {
      await tx
        .insert(recipeGroups)
        .values({
          id: this.key,
          name,
          category,
          description: input.description ?? null,
          baseSpirit: input.baseSpirit ?? null,
          tags:
            input.tags === undefined || input.tags === null
              ? null
              : [...input.tags],
          imageUrl: input.imageUrl ?? null,
          createdById: ctx.viewerId,
        })
        .onConflictDoNothing({ target: recipeGroups.id });
    });

    await this.reload();
    return this.#toDto(await this.#snapshot());
  }

  /**
   * Creator only. Not in §2.1's method list — added because today's Hasura
   * metadata *does* grant `recipe_groups` update to the creator, and dropping
   * a permission that exists is a behaviour regression rather than a
   * simplification. Flagged in the B6 report.
   *
   * `canonical_recipe_id` is deliberately **not** settable here: it is derived
   * from votes, and letting a creator pin it by hand would make `vote`'s
   * recompute silently undo them.
   */
  async update(
    ctx: Ctx,
    input: UpdateRecipeGroupInput,
  ): Promise<RecipeGroupDto> {
    const snapshot = await this.#snapshot();
    this.#requireCreator(ctx, snapshot.group, "update it");

    const patch: Partial<typeof recipeGroups.$inferInsert> = {};
    if (input.name !== undefined) patch.name = requireName(input.name);
    if (input.category !== undefined) {
      patch.category = requireCategory(input.category);
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.baseSpirit !== undefined) patch.baseSpirit = input.baseSpirit;
    if (input.tags !== undefined) {
      patch.tags = input.tags === null ? null : [...input.tags];
    }
    if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl;
    if (Object.keys(patch).length === 0) return this.#toDto(snapshot);

    // Every member recipe's embedding text contains the group's name,
    // description, category, base spirit and tags — but not its image, so an
    // image-only edit enqueues nothing. B2's change-detection rule, applied
    // one aggregate up.
    const embeddingChanged = Object.keys(patch).some((field) =>
      GROUP_EMBEDDING_FIELDS.includes(field),
    );

    await this.tx(async (tx) => {
      await tx
        .update(recipeGroups)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(recipeGroups.id, this.key));
      if (embeddingChanged) {
        await this.#enqueueMemberRegenerations(
          tx,
          snapshot,
          "group updated",
          ctx,
        );
      }
    });

    await this.reload();
    return this.#toDto(await this.#snapshot());
  }

  /* ---------------------------------------------------------------------- */
  /* Voting                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Any signed-in user; one vote per person per recipe
   * (`recipe_votes_recipe_id_user_id_key`), so changing your mind is the same
   * call — an upsert, not an error.
   *
   * **Naturally idempotent** (§8.4's second branch), and this is the property
   * the B6 acceptance asks for: the row is keyed `(recipe_id, user_id)` and
   * the canonical is *recomputed from the rows* rather than incremented, so
   * casting the same vote twice — or re-delivering anything this method
   * enqueues — cannot move a count. There is no counter to double.
   *
   * The recompute runs in the same transaction as the vote (§2.1: "in-turn"),
   * which is what replaces `update_canonical_recipe`'s `AFTER` trigger.
   */
  async vote(ctx: Ctx, input: VoteOnRecipeInput): Promise<RecipeVoteResult> {
    this.requireAggregate();
    const userId = requireViewer(ctx, "vote on a recipe");
    const snapshot = await this.#snapshot();

    const recipeId = requireUuid(input.recipeId, "recipeId");
    const voteType = requireVoteType(input.voteType);
    if (!snapshot.recipes.some((recipe) => recipe.id === recipeId)) {
      throw new NotFoundError(
        `recipe ${recipeId} is not in recipe group ${this.key}`,
        "RECIPE_NOT_IN_GROUP",
      );
    }

    await this.tx(async (tx) => {
      await tx
        .insert(recipeVotes)
        .values({ id: randomUUID(), recipeId, userId, voteType })
        .onConflictDoUpdate({
          target: [recipeVotes.recipeId, recipeVotes.userId],
          set: { voteType, updatedAt: new Date() },
        });
    });
    // The recompute re-reads, so it sees the vote just written. Its own write
    // is a second statement in a second transaction — see
    // `#recomputeCanonical`'s doc for why that is safe here and would not be
    // in a lock-free design.
    const canonicalChanged = await this.#recomputeCanonical(ctx);
    await this.reload();

    const reloaded = await this.#snapshot();
    const written = reloaded.votes.find(
      (row) => row.recipeId === recipeId && row.userId === userId,
    );
    if (written === undefined) {
      throw new ConflictError(
        `vote on ${recipeId} by ${userId} was not written`,
      );
    }

    return {
      vote: voteRowToDto(written),
      group: this.#toDto(reloaded),
      netScore: this.#netScore(reloaded, recipeId),
      canonicalChanged,
    };
  }

  /**
   * Withdraw your own vote. Not in §2.1 — added because §7's gap is about who
   * may *delete* a vote as much as who may cast one, and "you cannot un-vote"
   * is not a rule anyone chose. Deletes `(recipeId, ctx.viewerId)` and nothing
   * else: there is no parameter that could name another user's row.
   */
  async removeVote(ctx: Ctx, recipeId: string): Promise<RemovedRecipeVote> {
    this.requireAggregate();
    const userId = requireViewer(ctx, "withdraw a vote");
    const snapshot = await this.#snapshot();
    const id = requireUuid(recipeId, "recipeId");

    const mine = snapshot.votes.find(
      (row) => row.recipeId === id && row.userId === userId,
    );
    if (mine === undefined) {
      throw new NotFoundError(
        `you have not voted on recipe ${id} in group ${this.key}`,
      );
    }

    await this.tx(async (tx) => {
      await tx
        .delete(recipeVotes)
        .where(
          and(eq(recipeVotes.recipeId, id), eq(recipeVotes.userId, userId)),
        );
    });
    const canonicalChanged = await this.#recomputeCanonical(ctx);
    await this.reload();

    return { recipeId: id, userId, canonicalChanged };
  }

  /**
   * **`system` only, via the outbox.** Re-derives `canonical_recipe_id` (and
   * the group's name) from the members and votes that exist *now*.
   *
   * `vote` and `removeVote` already recompute in-turn; this exists for the
   * change they cannot see — `RecipeActor.delete` removing the canonical
   * member. The FK is `ON DELETE SET NULL`, so the database clears the column,
   * but **choosing the next winner reads `recipe_votes` and writes
   * `recipe_groups`**, both this actor's tables. `RecipeActor` enqueues a row
   * here rather than calling across, because §8.5 has no
   * `RecipeActor → RecipeGroupActor` edge and a delete should not fail because
   * a different activation was mid-turn.
   *
   * Naturally idempotent (§8.4): `#recomputeCanonical` compares the recomputed
   * winner against the stored one and writes only on a difference, so a
   * redelivery costs two `SELECT`s and nothing else. A group whose last member
   * was the deleted one recomputes to `null`, which is the correct answer and
   * not an error.
   *
   * `payload` is accepted and unused — `OutboxActor.deliver` always invokes
   * `method(systemCtx, payload)` (§1.4), so the parameter has to exist.
   */
  async recomputeCanonical(
    ctx: Ctx,
    _payload?: Record<string, unknown>,
  ): Promise<RecipeGroupDto> {
    this.requireAggregate();
    requirePrivileged(
      ctx,
      `only a system or admin caller may recompute a recipe group's canonical version`,
    );
    await this.#recomputeCanonical(ctx);
    await this.reload();
    return this.#toDto(await this.#snapshot());
  }

  /**
   * **Creator only** (A7d item 7). **Refused while the group still holds
   * recipes.**
   *
   * This is `CellarActor.delete`'s shape rather than `TierListActor.delete`'s,
   * and the FK is why. `recipes.recipe_group_id` is `ON DELETE SET NULL`, so a
   * permissive delete would not fail and would not cascade — it would quietly
   * orphan every version of the drink, leaving rows that no group, no
   * `/recipes` page and no canonical pointer reaches. That is the exact
   * failure `CellarActor` refuses, and "the delete succeeded and your data is
   * now unreachable" is the worst of the available outcomes.
   *
   * Empty is therefore the precondition, and the caller is told what to do:
   * move or delete the versions first (`deleteRecipe` exists now).
   *
   * `recipe_votes` needs no separate thought — it cascades from `recipes`, and
   * a group with no recipes has no votes.
   */
  async delete(ctx: Ctx): Promise<DeletedRecipeGroup> {
    const { group } = this.requireAggregate();
    this.#requireCreator(ctx, group, "delete it");
    const snapshot = await this.#snapshot();

    if (snapshot.recipes.length > 0) {
      throw new ConflictError(
        `recipe group ${this.key} still has ${snapshot.recipes.length} ` +
          "recipe(s). `recipes.recipe_group_id` is ON DELETE SET NULL, so " +
          "deleting the group would orphan them rather than remove them: " +
          "delete or re-group the versions first.",
      );
    }

    await this.tx(async (tx) => {
      await tx.delete(recipeGroups).where(eq(recipeGroups.id, this.key));
    });
    this.setAggregate(null);
    return { id: this.key };
  }

  /* ---------------------------------------------------------------------- */
  /* The canonical recompute — `update_canonical_recipe()`, in one turn      */
  /* ---------------------------------------------------------------------- */

  /**
   * Picks the highest net score (oldest wins ties) and writes it back with the
   * winner's name, if and only if it differs from what is stored. Returns
   * whether it wrote.
   *
   * Runs as its own transaction after the vote's, rather than sharing one.
   * That is safe for exactly the reason `TierListActor.reorderBand`'s
   * lock-free renumber is: Dapr runs one turn at a time per actor id, so no
   * other vote on this group can interleave, and the recompute reads the
   * aggregate this turn just reloaded. It is *not* safe against two stale
   * activations of the same group — the negative result B7 measured — and the
   * placement guarantee is what rules that out.
   */
  async #recomputeCanonical(ctx: Ctx): Promise<boolean> {
    const snapshot = await this.#snapshot();
    const ranked = this.#rankedRecipes(snapshot);
    const winner = ranked[0] ?? null;
    const current = snapshot.group.canonicalRecipeId;
    const next = winner?.id ?? null;
    if (next === current) return false;

    await this.tx(async (tx) => {
      await tx
        .update(recipeGroups)
        .set({
          canonicalRecipeId: next,
          // `name = COALESCE(new_canonical_name, name)`, verbatim.
          name: winner?.name ?? snapshot.group.name,
          updatedAt: new Date(),
        })
        .where(eq(recipeGroups.id, this.key));
      // What `trigger_recipe_group_embedding_update` was a placeholder for
      // (transform `03_…`: "→ outbox-driven"). Every member recipe's
      // embedding text contains the group's name, which just changed.
      await this.#enqueueMemberRegenerations(
        tx,
        snapshot,
        "canonical changed",
        ctx,
      );
    });
    return true;
  }

  /** Net score (`upvote` = +1, `downvote` = −1) for one recipe. */
  #netScore(snapshot: RecipeGroupSnapshot, recipeId: string): number {
    return snapshot.votes
      .filter((row) => row.recipeId === recipeId)
      .reduce((sum, row) => sum + voteWeight(requireVoteType(row.voteType)), 0);
  }

  /** `ORDER BY net_score DESC, created_at ASC` — plus `id ASC` (module doc). */
  #rankedRecipes(snapshot: RecipeGroupSnapshot): readonly MemberRecipe[] {
    return snapshot.recipes.slice().sort((a, b) => {
      const byScore =
        this.#netScore(snapshot, b.id) - this.#netScore(snapshot, a.id);
      if (byScore !== 0) return byScore;
      const byAge = createdAtOrEpoch(a) - createdAtOrEpoch(b);
      if (byAge !== 0) return byAge;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  /**
   * One `RecipeActor.regenerateVector` row per member recipe, in the caller's
   * transaction (§1.4). A group is the versions of one drink, so this is a
   * handful of rows, not a fan-out — and `regenerateVector` skips before
   * calling the model when a recipe's vector is already fresh, so an
   * unnecessary row costs a `SELECT`.
   */
  async #enqueueMemberRegenerations(
    tx: DbOrTx,
    snapshot: RecipeGroupSnapshot,
    reason: string,
    ctx: Ctx,
  ): Promise<void> {
    for (const recipe of snapshot.recipes) {
      await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["RecipeActor.regenerateVector"],
        {
          targetId: recipe.id,
          // §1.4: a payload is a `Record<string, unknown>`, never a bare scalar.
          payload: { reason, recipeGroupId: this.key },
        },
        { attributeTo: ctx },
      );
    }
  }

  #toDto(snapshot: RecipeGroupSnapshot): RecipeGroupDto {
    const row = snapshot.group;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: requireCategory(row.category),
      baseSpirit: row.baseSpirit,
      tags: row.tags ?? [],
      imageUrl: row.imageUrl,
      createdById: row.createdById,
      canonicalRecipeId: row.canonicalRecipeId,
      recipeCount: snapshot.recipes.length,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }
}
