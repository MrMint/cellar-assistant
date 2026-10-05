/**
 * `RecipePhotoJobActor` — C4 (migration plan §2.6).
 *
 * > `RecipePhotoJobActor(jobId)` | `processRecipePhoto` action +
 * > `_utils/recipe-database` (creates recipes, items, and brands through their
 * > actors)
 *
 * ## The authorization gap this closes
 *
 * `docs/architecture/target-stack.md` §7, still open on `main` today:
 *
 * > `processRecipePhoto` takes a client-supplied `userId`.
 *
 * It was not a subtlety. `actions.graphql` declared `userId: String!` as an
 * ordinary input field, the Kriti request transform copied
 * `$body.input.input.userId` into the function body **without forwarding
 * session variables**, the function validated it only for being a non-empty
 * string, and it landed in `recipes.created_by` through a mutation run with
 * the admin secret — so no row-level check ever saw it. Any signed-in user
 * could create a recipe owned by anyone whose id they knew.
 *
 * **Here the user is `jobs.created_by`, and there is no other source.**
 * `JobActor.start` writes that column from `ctx.viewerId`; `#ownerContext`
 * reads it back and every write in the chain is made as that user. The payload
 * type (`RecipePhotoJobPayload`) declares `userId?: never`, so naming a user is
 * a compile error, and `assertNoCallerSuppliedUser` re-checks at runtime
 * because an outbox payload is JSON with no types at all. `runBatch` is
 * `system`-only and `system` is not derivable from a request (§1.6,
 * `lib/system-ctx.test.ts`), so nobody can reach the chain except through
 * `start`.
 *
 * ## Why the cursor walks stages instead of rows
 *
 * Every other job actor pages a table. This one processes **one photo**, and
 * its expensive step is a single vision call. Making each stage its own batch
 * buys exactly what §1.4 promises: the stage advance and the outbox row that
 * schedules the next stage commit together, so a host killed after `extract`
 * resumes at `group` and **the model is never asked twice**. A retry of the
 * old synchronous action re-ran the entire pipeline, image download and all.
 *
 * ```
 * extract ──▶ group ──▶ recipe ──▶ ingredients ──▶ instructions ──▶ completed
 *  (AI)      (RecipeGroupActor)  (RecipeActor)   (ItemSearchActor  (RecipeActor)
 *                                                 + RecipeActor)
 * ```
 *
 * ## §8.5 is why this is a job and not a method on `RecipeActor`
 *
 * The `ingredients` stage asks `ItemSearchActor` whether an item already
 * exists and then writes the answer through `RecipeActor`. An entity actor may
 * not call a search actor synchronously, and the outbox is one-way so it
 * cannot carry the answer back — §8.5's `job → entity / registry / search`
 * edge is the only one that permits both halves. Same shape, same reason as
 * B8's `MenuMatchJobActor`.
 *
 * ## Idempotency (§8.4)
 *
 * Four layers, none relying on the others:
 *
 *  1. `JobActor.runBatch` drops a delivery whose batch number is behind the
 *     stored cursor;
 *  2. the recipe id is **derived from the job id**, so `RecipeActor.create` on
 *     a redelivery returns the existing recipe instead of making a second one;
 *  3. the group id is derived from the group's *name*, so two photos of the
 *     same drink converge on one `recipe_groups` row — the dedupe the old
 *     `calculateTextSimilarity` was approximating, done exactly;
 *  4. `setIngredients` and `setInstructions` **replace** their lists, so
 *     re-running a stage cannot double them.
 */
import type {
  ActorCategory,
  Ctx,
  ExtractedRecipe,
  InternalJobActorInterface,
  RecipeCategory,
  RecipeIngredientInput,
  RecipePhotoCursor,
  RecipePhotoJobActorInterface,
  RecipePhotoJobPayload,
  RecipePhotoResult,
  RecipePhotoStage,
  RecipeType,
} from "@cellar-assistant/contracts";
import {
  assertNoCallerSuppliedUser,
  ForbiddenError,
  isRecipeType,
  RECIPE_CATEGORIES,
  RECIPE_PHOTO_JOB_KIND,
  RECIPE_PHOTO_STAGES,
  RECIPE_TYPES,
  RecipePhotoJobActorDescriptor,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { derivedUuid } from "../lib/derived-uuid.ts";
import type { VerifyFile } from "../lib/file-verification.ts";
import {
  daprVerifyFile,
  requireVerifiedFile,
} from "../lib/file-verification.ts";
import type { RecipePhotoExtractor } from "../lib/recipe-photo-ai.ts";
import { recipePhotoExtractor } from "../lib/recipe-photo-ai.ts";
import type {
  IngredientSearcher,
  RecipeWriter,
} from "../lib/recipe-photo-matching.ts";
import {
  daprIngredientSearcher,
  daprRecipeWriter,
  genericFallback,
  ingredientQuantities,
  ingredientRefFromHit,
  ingredientSearchInput,
  ingredientSearchText,
  instructionInput,
  pickIngredientMatch,
} from "../lib/recipe-photo-matching.ts";
import { correlationId, emit } from "../lib/telemetry.ts";
import type { BatchInput, BatchOutcome } from "./job-actor/index.ts";
import { JobActor } from "./job-actor/index.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireUuid = (value: string, what: string): string => {
  if (!UUID_PATTERN.test(value)) {
    throw new ValidationError(`${what} must be a uuid, got ${value}`);
  }
  return value;
};

/**
 * A photo set is a recipe card, not an album — "second page, back of card, and
 * so on", per `StartRecipePhotoJobInput`.
 *
 * The cap is a real bound and not decoration: every id in the list costs one
 * `FileActor.verify` round trip inside a user-facing mutation turn, each with
 * the 30s `FileActorDescriptor` gives `verify`, so the list length *is* this
 * mutation's worst-case latency. It is checked against the list as sent, before
 * the ids are deduplicated, because the raw list is also what lands in
 * `jobs.payload` and is re-read from JSON on every batch.
 */
const MAX_ADDITIONAL_FILES = 10;

export const RECIPE_ID_NAMESPACE = "cellar:recipe-photo:recipe";
export const RECIPE_GROUP_ID_NAMESPACE = "cellar:recipe-photo:group";

/** The name a `recipe_groups` row is deduplicated on. */
export const normaliseGroupName = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

const nextStage = (stage: RecipePhotoStage): RecipePhotoStage | null => {
  const at = RECIPE_PHOTO_STAGES.indexOf(stage);
  return RECIPE_PHOTO_STAGES[at + 1] ?? null;
};

/**
 * The extraction's `type`, or a refusal — the second of the two places the
 * silent `cocktail` default lived (C4d).
 *
 * The first is `requireRecipeType` in `../lib/ai/seams.ts`, which checks the
 * model's answer as it is parsed. This one is not a duplicate of it: what
 * arrives here is `jobs.cursor.extraction`, **re-read from JSON on every
 * batch**, so a job whose `extract` stage committed before this change can
 * still deliver an `ExtractedRecipe` carrying `type: "groupName"` — an answer
 * that was never checked, because nothing checked it. One rule, two
 * positions, the way `requireExtractableInput` and `requireLegibleLabel` are:
 * the seam refuses an illegal answer *now*, this refuses a stored one.
 *
 * It fails the job rather than filing it, and that is the deliberate part. A
 * `ValidationError` is permanent to the outbox (`isPermanentFailure`), so the
 * `recipe` batch is dead-lettered on its first attempt — and `JobActor.runBatch`
 * sees the same classification and marks the job `failed` before rethrowing,
 * which is what ends the page's poll. (Until it did, "fails the job" meant a
 * dead letter and a job row left `running` forever.) The
 * old behaviour completed such a job with `recipes.type = 'cocktail'`, which
 * happened to be right for a cocktail card and was wrong — silently, with a
 * `completed` row and no error — for every food one. A failed job the person
 * can re-run, against a schema that now constrains the answer, is the better
 * of the two.
 */
const recipeTypeOf = (extraction: ExtractedRecipe): RecipeType => {
  if (isRecipeType(extraction.type)) return extraction.type;
  throw new ValidationError(
    `this job's stored extraction has \`type\`: ` +
      `${JSON.stringify(extraction.type)}, which is not one of the ` +
      `${RECIPE_TYPES.length} values \`recipes_type_check\` accepts ` +
      `(${RECIPE_TYPES.join(", ")}). \`RECIPE_PHOTO_SCHEMA\` constrains the ` +
      "model to those, so this cursor was written by an extraction that ran " +
      "before it did. Start the job again rather than filing the recipe " +
      "under a type nobody read off the photograph.",
  );
};

/** `recipe_groups.category` is a Postgres enum; anything else is `other`. */
const isRecipeCategory = (value: string): value is RecipeCategory =>
  (RECIPE_CATEGORIES as readonly string[]).includes(value);

/**
 * `recipe_groups.category`, from the model's own answer where it gave a legal
 * one and from `type` where it did not.
 *
 * Both halves changed meaning with C4d even though neither line did.
 * `groupCategory` is now an `enum` over all five members of the
 * `recipe_category` Postgres type (`cocktail, mocktail, other, punch, shot`,
 * read from the running database and mirrored as `RECIPE_CATEGORIES`), so
 * `isRecipeCategory` accepts every value a schema-honouring model can emit and
 * rejects none of them. And the fallback is now reachable in both directions:
 * it used to see `recipeTypeOf` return `cocktail` for *every* extraction,
 * because the unconstrained `type` never once came back legal, so its `other`
 * branch — the whole of the food case — was dead code that read like a
 * feature.
 */
const groupCategoryOf = (extraction: ExtractedRecipe): RecipeCategory => {
  const declared = (extraction.groupCategory ?? "").trim().toLowerCase();
  if (isRecipeCategory(declared)) return declared;
  return recipeTypeOf(extraction) === "cocktail" ? "cocktail" : "other";
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class RecipePhotoJobActor
  extends JobActor<RecipePhotoCursor, RecipePhotoJobPayload>
  implements RecipePhotoJobActorInterface, InternalJobActorInterface
{
  static override readonly category: ActorCategory =
    RecipePhotoJobActorDescriptor.category;

  protected readonly kind = RECIPE_PHOTO_JOB_KIND;

  readonly #extract: RecipePhotoExtractor;
  readonly #search: IngredientSearcher;
  readonly #write: RecipeWriter;
  readonly #verifyFile: VerifyFile;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    extract: RecipePhotoExtractor = recipePhotoExtractor(),
    search: IngredientSearcher = daprIngredientSearcher,
    write: RecipeWriter = daprRecipeWriter,
    verifyFile: VerifyFile = daprVerifyFile,
  ) {
    super(daprClient, id, db);
    this.#extract = extract;
    this.#search = search;
    this.#write = write;
    this.#verifyFile = verifyFile;
  }

  /** The recipe this job builds. Derived, so a redelivery cannot fork it. */
  get recipeId(): string {
    return derivedUuid(RECIPE_ID_NAMESPACE, this.key);
  }

  /**
   * Any caller with a viewer — a signed-in user or an admin. This is the one
   * job an ordinary person starts, and `ctx.viewerId` is what makes them its
   * owner, so a ctx without one (anonymous, or `system`) has no one to create
   * the recipe as.
   */
  protected authorizeStart(ctx: Ctx): void {
    if (ctx.viewerId === null) {
      throw new ForbiddenError("sign in to read a recipe from a photo");
    }
  }

  /**
   * The payload, before anything is written: no caller-named user, and every
   * file id one the caller uploaded and that actually arrived.
   *
   * ## Every file id here is the caller's, and `requireUuid` proves nothing
   *
   * `StartRecipePhotoJobInput` takes `fileId` and `additionalFileIds` straight
   * from the request. Until E2e this method checked their *shape* and stopped
   * there, which admits two different attacks that E2d had already closed on
   * `MenuScanActor.create` and `ItemActor.attachImage`:
   *
   *  - **bytes that never arrived.** `createUploadTarget` mints the `files`
   *    row *before the PUT*, so the FK to `files` is satisfied by a target
   *    nobody uploaded to. The job was accepted, `jobs` committed `running`,
   *    an outbox row was scheduled, and the failure surfaced one hop later
   *    inside `extract` as `file … is not verified yet` — burning outbox
   *    retries against an object that does not exist and leaving the user a
   *    job to make sense of. `files.verified_at` is the only server-side fact
   *    that the bytes landed (target-stack §4), and nothing on this path read
   *    it — `recipe-photo-ai.ts` even documents `fileId` as "already verified
   *    by `FileActor`", an invariant no code established.
   *  - **somebody else's photo.** `FileActor.verify` is uploader-only, so
   *    asking it is also the authorization this path never did: a signed-in
   *    user could name *another user's* verified file id and have the vision
   *    model read it into a recipe they own. Verified end to end before this
   *    change: the same id through `createMenuScan` answered "file … is not
   *    yours" while `startRecipePhotoJob` answered `RUNNING`.
   *
   * The list makes this the widest instance of the defect rather than the
   * smallest, so **every element is checked, not just the first** — same
   * helper and same shape as `menu-scan-actor.ts`, so there is one mechanism
   * here rather than a second one that drifts.
   *
   * Deliberately before anything is written (`JobActor.start` runs this
   * ahead of the insert): the point is that no `jobs` row and no outbox row
   * exist for a photo set that cannot be read. The check is not
   * repeated per batch — `processBatch` resolves the photo through
   * `FileActor.presignRead`, which refuses an unverified file on its own, and
   * a hand-edited `jobs.payload` therefore cannot promote itself the way the
   * §7 `userId` fence has to guard against.
   */
  protected override async validateStart(
    ctx: Ctx,
    payload: RecipePhotoJobPayload,
  ): Promise<void> {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "a recipe-photo job's payload",
    );
    requireUuid(this.key, "jobId");
    const fileId = requireUuid(payload.fileId ?? "", "fileId");

    const sent = payload.additionalFileIds ?? [];
    if (sent.length > MAX_ADDITIONAL_FILES) {
      throw new ValidationError(
        `additionalFileIds takes at most ${MAX_ADDITIONAL_FILES} ids, got ${sent.length}`,
      );
    }
    // Deduplicated for the loop only — the payload keeps what the caller sent.
    // A repeat costs a sidecar hop and answers the same thing twice, and the
    // main `fileId` is checked below whether or not the list repeats it.
    const additional = [
      ...new Set(
        sent.map((extra) => requireUuid(extra, "additionalFileIds[]")),
      ),
    ].filter((extra) => extra !== fileId);

    await requireVerifiedFile(this.#verifyFile, ctx, fileId, "a recipe photo");
    for (const extra of additional) {
      await requireVerifiedFile(this.#verifyFile, ctx, extra, "a recipe photo");
    }
  }

  /** Progress, for the page the user is watching. Owner/admin/system only. */
  async result(ctx: Ctx): Promise<RecipePhotoResult> {
    const job = this.requireReadableJob(ctx);
    const cursor = this.cursorOf(job).value;
    return {
      jobId: this.key,
      recipeId: cursor?.recipeId ?? this.recipeId,
      recipeGroupId: cursor?.recipeGroupId ?? null,
      stage: cursor?.stage ?? "extract",
      done: job.status === "completed",
    };
  }

  /* ---------------------------------------------------------------------- */
  /* The chain                                                               */
  /* ---------------------------------------------------------------------- */

  protected async processBatch(
    ctx: Ctx,
    { cursor, payload }: BatchInput<RecipePhotoCursor, RecipePhotoJobPayload>,
  ): Promise<BatchOutcome<RecipePhotoCursor>> {
    assertNoCallerSuppliedUser(
      payload as Record<string, unknown>,
      "a recipe-photo job's payload",
    );
    const owner = this.#ownerContext(ctx);
    const state: RecipePhotoCursor = cursor ?? {
      stage: "extract",
      recipeId: this.recipeId,
      extraction: null,
      recipeGroupId: payload.recipeGroupId ?? null,
      model: null,
    };

    const advanced = await this.#runStage(owner, state, payload);
    const following = nextStage(advanced.stage);
    if (following === null) {
      emit({
        name: "recipe_photo.completed",
        severity: "INFO",
        message: `recipe-photo job ${this.key} produced recipe ${advanced.recipeId}`,
        attributes: {
          "job.id": this.key,
          "recipe.id": advanced.recipeId,
          "recipe.group_id": advanced.recipeGroupId ?? "none",
        },
      });
      return {
        cursor: advanced,
        processed: 1,
        total: RECIPE_PHOTO_STAGES.length,
        done: true,
      };
    }
    return {
      cursor: { ...advanced, stage: following },
      processed: 1,
      total: RECIPE_PHOTO_STAGES.length,
      done: false,
    };
  }

  /** One stage. Returns the cursor *for the stage that just ran*. */
  async #runStage(
    owner: Ctx,
    state: RecipePhotoCursor,
    payload: RecipePhotoJobPayload,
  ): Promise<RecipePhotoCursor> {
    switch (state.stage) {
      case "extract": {
        const { recipe, model } = await this.#extract(owner, {
          jobId: this.key,
          fileId: payload.fileId,
          additionalFileIds: payload.additionalFileIds ?? [],
          notes: payload.notes ?? null,
        });
        if (recipe.name.trim() === "") {
          throw new ValidationError(
            "the extraction produced no recipe name; there is nothing to create",
          );
        }
        return { ...state, extraction: recipe, model };
      }
      case "group": {
        const extraction = this.#requireExtraction(state);
        return {
          ...state,
          recipeGroupId: await this.#resolveGroup(owner, state, extraction),
        };
      }
      case "recipe": {
        const extraction = this.#requireExtraction(state);
        await this.#write.createRecipe(owner, state.recipeId, {
          name: extraction.name.trim(),
          type: recipeTypeOf(extraction),
          description: extraction.description ?? null,
          recipeGroupId: state.recipeGroupId,
          difficultyLevel: extraction.difficultyLevel ?? null,
          prepTimeMinutes: extraction.prepTimeMinutes ?? null,
          servingSize: extraction.servingSize ?? null,
        });
        return state;
      }
      case "ingredients": {
        const extraction = this.#requireExtraction(state);
        const ingredients: RecipeIngredientInput[] = [];
        for (const ingredient of extraction.ingredients) {
          if (ingredientSearchText(ingredient) === "") continue;
          ingredients.push(await this.#resolveIngredient(owner, ingredient));
        }
        await this.#write.setIngredients(owner, state.recipeId, {
          ingredients,
        });
        return state;
      }
      case "instructions": {
        const extraction = this.#requireExtraction(state);
        await this.#write.setInstructions(owner, state.recipeId, {
          instructions: extraction.instructions
            .map(instructionInput)
            .filter((step) => step.instructionText !== ""),
        });
        return state;
      }
    }
  }

  /**
   * An existing group with this name, or a new one under a **name-derived**
   * id. Two photos of an Old Fashioned therefore land in one group without any
   * similarity heuristic — and without the old pipeline's third outcome, where
   * a 0.60–0.85 name similarity abandoned the whole request with
   * `"User confirmation required"` and wrote nothing at all.
   */
  async #resolveGroup(
    owner: Ctx,
    state: RecipePhotoCursor,
    extraction: ExtractedRecipe,
  ): Promise<string | null> {
    if (state.recipeGroupId !== null) return state.recipeGroupId;
    const name = (extraction.groupName ?? "").trim();
    if (name === "") return null;

    const key = normaliseGroupName(name);
    // `recipe_groups` belongs to `RecipeGroupActor` (§1.2); a job may read any
    // table (§1.1) and caches none of it, so this is a fresh read every time.
    const { rows } = await this.db.execute<{ id: string }>(sql`
      select id from public.recipe_groups
      where lower(btrim(regexp_replace(name, '\\s+', ' ', 'g'))) = ${key}
      order by created_at asc nulls last
      limit 1
    `);
    const existing = rows[0]?.id;
    if (existing !== undefined) return existing;

    const created = await this.#write.createGroup(
      owner,
      derivedUuid(RECIPE_GROUP_ID_NAMESPACE, key),
      { name, category: groupCategoryOf(extraction) },
    );
    return created.id;
  }

  /**
   * Match, or fall back to a generic item.
   *
   * The search is `ItemSearchActor` — §8.5's `job → search` — and it is the
   * only reason this work cannot live on `RecipeActor`. A miss produces a
   * `newGenericItem`, which `RecipeActor.setIngredients` find-or-creates
   * through `ItemActor.createGeneric`; nothing here inserts anything (§1.2).
   */
  async #resolveIngredient(
    owner: Ctx,
    ingredient: Parameters<typeof genericFallback>[0],
  ): Promise<RecipeIngredientInput> {
    const hits = await this.#search(owner, ingredientSearchInput(ingredient));
    const match = pickIngredientMatch(hits);
    if (match !== null) {
      return {
        ref: ingredientRefFromHit(match),
        ...ingredientQuantities(ingredient),
      };
    }
    return {
      newGenericItem: genericFallback(ingredient),
      ...ingredientQuantities(ingredient),
    };
  }

  #requireExtraction(state: RecipePhotoCursor): ExtractedRecipe {
    if (state.extraction === null) {
      throw new ValidationError(
        `recipe-photo job ${this.key} reached '${state.stage}' with no ` +
          "extraction; the `extract` stage did not commit its cursor",
      );
    }
    return state.extraction;
  }

  /**
   * **The only source of a user in this actor.**
   *
   * `jobs.created_by` was written by `JobActor.start` from `ctx.viewerId`. The
   * payload cannot influence it, the outbox delivery cannot influence it, and
   * an admin who starts a job on someone's behalf still owns what they start.
   * This method is what closes target-stack §7.
   */
  #ownerContext(delivery: Ctx): Ctx {
    const job = this.requireJob();
    if (job.createdBy === null) {
      throw new ForbiddenError(
        `recipe-photo job ${this.key} has no owner; there is no user to ` +
          "create the recipe as (jobs.created_by is null)",
      );
    }
    // The delivery's correlation id is carried through so the whole chain
    // shares one — but not its `kind`: the writes are the user's, and running
    // them as `system` would bypass every rule in `policy` (§1.6). Nor its
    // `delivery`: a user ctx cannot carry one, and the recipe writes key on
    // ids derived from this job's own key, not on the outbox row.
    return userCtx(job.createdBy, correlationId(delivery));
  }
}
