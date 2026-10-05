/**
 * Spend accounting for model calls — X1c.
 *
 * `BudgetActor` has metered paid API calls since B5, and it metered exactly
 * one service: Google Places. Every model call in this system — seven of them,
 * one per seam in `./seams.ts` — went through `AIProvider` and past no gate at
 * all. `services/api/src/limits.ts` says so in as many words, and calls
 * `MAX_MODEL_BACKED_FIELDS` a stopgap for it: *"nothing in
 * `services/actors/src/lib/ai/` imports `BudgetActor` … So N aliases of
 * `itemSearch` in one request is N model inferences with no spend gate
 * anywhere on the path."* This module is the other half.
 *
 * ## Why this matters more here than it would elsewhere
 *
 * The deployed configuration is Gemini on Vertex, billed per token; local dev
 * is Ollama or vLLM, billed nothing. A loop that costs nothing to write and
 * nothing to notice on a laptop is an invoice in production, and the gap
 * between the two lanes is exactly where an unmetered call hides. So the
 * local providers are metered too, at a price of zero — see `./billing.ts`,
 * which is also where `openai-compatible` stops being "local": pointed at a
 * hosted API it is paid, whatever its name says. The request cap binds
 * identically in both lanes, which means a runaway seam fails in the lane
 * where failing is cheap.
 *
 * ## Two phases, because the two questions have different answers
 *
 * **To refuse, you need the cost before the call. To record, you need it
 * after.** They are not the same number and no amount of care makes them one:
 *
 *  - *Before.* The prompt and the images are in hand, so the input side is
 *    close to exact. The output side is not knowable at all — that is what
 *    generation decides — so {@link OUTPUT_TOKEN_ESTIMATES} is a per-seam
 *    expectation, and the reservation it prices is the refusal's basis.
 *  - *After.* Three of the four providers report the tokens they actually
 *    billed, split into prompt and completion — the two Google ones always,
 *    `openai-compatible` whenever its server does, which a paid one does.
 *    Output includes a thinking model's reasoning (`geminiTokenSplit`).
 *    `BudgetActor.settleForModel` writes that measurement over the estimate
 *    and re-derives the row's cents, so the month's ledger is the provider's
 *    own arithmetic rather than ours.
 *
 * A host that dies between the two leaves the estimate standing, which is the
 * safe direction and is why the estimate is made first rather than the whole
 * charge deferred to settlement. Ollama reports nothing and is priced at zero,
 * so there is nothing to settle; the estimate of zero was already exact.
 *
 * ## What a refusal must not become
 *
 * `BudgetExceededError`, thrown, and nothing else. Not an empty extraction,
 * not a zero vector, not a canned approval. This directory is written against
 * a specific failure — `install.ts`'s header, `seams.ts`'s header and five
 * separate seam docs all record measurements of a model inventing an answer
 * rather than abstaining — and a budget refusal that synthesised a
 * `GenerateContentResponse` would be that same failure introduced by the
 * accounting layer itself. `budget.test.ts` asserts the refusal reaches the
 * seam as a throw for all seven.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, ReserveResult } from "@cellar-assistant/contracts";
import {
  BUDGET_ACTOR_ID,
  BudgetActorDescriptor,
  BudgetExceededError,
} from "@cellar-assistant/contracts";
import type {
  ModelReserveInput,
  ModelSeam,
  ModelSettleInput,
} from "../../actors/budget-actor.ts";
import { AI_MODEL_SERVICE } from "../../actors/budget-actor.ts";
import { internal } from "../internal-client.ts";
import type {
  AIProvider,
  EmbeddingRequest,
  GenerateContentRequest,
  GenerateContentResponse,
  ModelQuality,
  ProviderFor,
} from "./types.ts";

/**
 * Characters per token, for estimating the input side.
 *
 * Three, not the usual four. The rule of thumb is a *mean* over English prose,
 * and these prompts are not prose: `prompts.ts` is dense with JSON keys, snake
 * case identifiers, enum vocabularies and punctuation, all of which tokenise
 * shorter than words do. Three rounds the estimate up, which is the direction
 * an estimate that has to refuse should err in, and the settlement corrects it
 * on every provider that reports.
 */
const CHARS_PER_TOKEN = 3;

/**
 * Tokens charged for one image, before settlement.
 *
 * The Gemini family tiles an image into 768×768 blocks at 258 tokens each,
 * having first resized it so the long edge is at most 3072 — so at most
 * ⌈3072/768⌉² = 16 tiles, 4128 tokens, whatever the camera produced. 4200 is
 * that with a little room, and it is an upper bound for the other providers at
 * the sizes this app sends, which are phone photographs of labels and menus.
 *
 * It is an estimate for a reason and not a measurement: nothing here decodes
 * the image. `image-mime.ts` sniffs the format and nothing reads dimensions,
 * deliberately — `providerItemDefaults` and `providerMenuExtraction` both say
 * why size is the wrong thing to reason about for *legibility*, and it would
 * be the wrong thing to build a decoder for here either. The settlement is
 * where the real number arrives.
 */
const IMAGE_TOKENS = 4200;

/**
 * What each seam's completion is expected to run to, in tokens.
 *
 * These are expectations, not ceilings, and that is the deliberate choice. A
 * ceiling — say the model's full output window — would have every call reserve
 * two cents against a five-dollar cap, refuse real traffic after a couple of
 * hundred calls, and be wrong by two orders of magnitude in the direction that
 * looks like prudence. The bound that does not depend on guessing right is
 * `ModelSpender.maxMonthlyRequests`; this number only has to be close enough
 * that the cents cap is not systematically mis-set, and the settlement
 * replaces it with the truth moments later.
 *
 * The two large ones extract lists: a menu is tens of lines and a recipe is
 * its ingredients and method, both as structured JSON. The two small ones
 * answer a handful of short fields. Embeddings produce a vector, which is not
 * billed as output tokens by any provider here.
 *
 * They are the *answer's* length and leave out a thinking model's reasoning,
 * which `gemini-2.5-pro` spends on every `high` call and Google bills as
 * output. So a reservation under-states such a call, and the settlement —
 * which does count thoughts (`geminiTokenSplit`) — books the difference in the
 * same turn, before the seam's next reservation is priced.
 */
export const OUTPUT_TOKEN_ESTIMATES: Readonly<Record<ModelSeam, number>> = {
  embedding: 0,
  item_defaults: 1024,
  menu_extraction: 4096,
  menu_match: 512,
  place_review: 512,
  recipe_photo: 4096,
  tier_list_insights: 1024,
};

/**
 * One embedded image, in tokens *at the embedding model's text rate* — the one
 * rate `BudgetActor`'s table holds per model.
 *
 * Google prices `gemini-embedding-2` images per image, not per token: $0.00012
 * an image against $0.20 per million text tokens (paid tier,
 * ai.google.dev/gemini-api/docs/pricing, "Gemini Embedding 2", read
 * 2026-09-28). $0.00012 / ($0.20 / 1e6) = 600. So an item embedded with its
 * three label and display images reserves 1,800 tokens on top of its text,
 * which is what the invoice will say — rather than being booked as text alone,
 * which is what it was before images went in.
 */
export const EMBEDDING_IMAGE_TEXT_TOKENS = 600;

export const estimateTextTokens = (text: string): number =>
  Math.ceil(text.length / CHARS_PER_TOKEN);

export const estimateImageTokens = (images: number): number =>
  images * IMAGE_TOKENS;

/* -------------------------------------------------------------------------- */
/* The two hops to the singleton                                               */
/* -------------------------------------------------------------------------- */

export type ModelBudget = {
  reserve(ctx: Ctx, input: ModelReserveInput): Promise<ReserveResult>;
  settle(ctx: Ctx, input: ModelSettleInput): Promise<void>;
};

/**
 * The real budget, over the sidecar.
 *
 * `reserveForModel` and not `reserve`: `reserve` is system-or-admin only, and
 * a seam runs inside whatever turn called it — `ItemOnboardingActor.start` and
 * `PlaceCreationActor.createPlace` are user turns. A seam may not mint a
 * `system` ctx to get around that (§1.6, `src/lib/system-ctx.test.ts`), which
 * is the same corner `GooglePlacesActor` was in and has the same answer: a
 * narrow door with an allow-list, a price the caller does not choose, and
 * attribution forced to the viewer.
 */
export const daprModelBudget: ModelBudget = {
  reserve: (ctx, input) =>
    internal(ctx)(BudgetActorDescriptor, BUDGET_ACTOR_ID).reserveForModel(
      input,
    ),
  settle: (ctx, input) =>
    internal(ctx)(BudgetActorDescriptor, BUDGET_ACTOR_ID).settleForModel(input),
};

/**
 * An id no other reservation will ever carry — on this host, after a restart,
 * or on another replica.
 *
 * ## Why not the outbox row's id
 *
 * Google reservations used to be keyed that way — `BudgetActor.#reserve`
 * defaulted a missing `reservationId` to the delivering row's id — and it was the
 * same bug this section is about, found there first: one delivery makes many
 * paid calls, so every reservation after a delivery's first replayed it and
 * was never counted. The default is gone and `ReserveInput.reservationId` is
 * required; `PlaceActor` and `GooglePlacesActor` now mint a key per paid call,
 * and neither relies on a shared key to avoid charging twice — a redelivery
 * or a cache hit that makes no second call makes no second reservation.
 * A model call has both halves of that problem and no cache to hide either: a
 * redelivery really does call the model again and really is billed again, and
 * `MenuMatchJobActor.processBatch` makes one call per row of a batch *within a
 * single delivery*, so an outbox-keyed reservation would collapse a whole
 * batch into one charge.
 *
 * ## Why not `requestId` plus a counter, which is what this was
 *
 * `${seam}:${ctx.requestId}:${n}` with `n` a module counter looked distinct
 * and was not, for two reasons that compound. The counter restarts at 1 with
 * the process (and is per-replica), and `ctx.requestId` repeats by design — an
 * outbox redelivery carries the same `outbox:<id>` every time, and a request's
 * id is the client's `x-request-id`. So the redelivery of a delivery that had
 * reserved before a restart minted *the same ids again*, `BudgetActor` found
 * the earlier rows, and answered "already reserved": the model was called
 * again with no request counted, no cap checked and no row written. The live
 * ledger showed it — `…:outbox:ed55…:1..3` after `:10`.
 *
 * A random uuid has neither problem. `ctx.requestId` still rides along, in the
 * row's `metadata.requestId`, because tracing a charge back to the request
 * that caused it is useful — it just no longer decides identity.
 */
const newReservationId = (seam: ModelSeam): string =>
  `${AI_MODEL_SERVICE}:${seam}:${randomUUID()}`;

/* -------------------------------------------------------------------------- */
/* The metered provider                                                        */
/* -------------------------------------------------------------------------- */

/** The three chat models plus the embedding model, as `installAI` resolved them. */
export type SeamModels = Readonly<Record<ModelQuality, string>> & {
  readonly embedding: string;
};

export type MeterOptions = {
  readonly budget?: ModelBudget;
  /** Attribution for `api_usage_log`, when the seam knows a row. */
  readonly entityType?: string;
};

const refuse = (seam: ModelSeam, result: ReserveResult): never => {
  throw new BudgetExceededError(
    `${AI_MODEL_SERVICE}/${seam} refused: ${result.reason}. No model was ` +
      "called and nothing was generated — this is a refusal, not an answer.",
  );
};

/**
 * Settlement never fails the call it is settling.
 *
 * The model has already run and the money is already spent by the time this
 * is reachable; turning a failed *bookkeeping* hop into a failed menu scan
 * would throw away work that was paid for, and — through the outbox — pay for
 * it again on the retry. The estimate stands in the ledger, the drift is
 * logged, and the row still says what was called. This is the one place in
 * this directory where swallowing an error is right, and it is right only
 * because the alternative costs more money rather than less.
 */
const settleQuietly = async (
  budget: ModelBudget,
  ctx: Ctx,
  input: ModelSettleInput,
): Promise<void> => {
  try {
    await budget.settle(ctx, input);
  } catch (error) {
    console.warn(
      `[ai-budget] ${input.seam}: could not settle usage row ${input.usageId}; ` +
        "the pre-call estimate stands in api_usage_log:",
      error instanceof Error ? error.message : error,
    );
  }
};

/**
 * Bind a provider to one seam and one budget, producing the `ProviderFor`
 * `seams.ts` asks for.
 *
 * Every model call in this system goes through exactly one of these, because
 * `installSeams` is the only thing that hands a provider to a seam factory and
 * it builds one of these per seam. `install.test.ts` holds that property: it
 * drives all seven seams through `installSeams` with a recording budget and
 * asserts seven reservations.
 */
export const meteredProviderFor = (
  provider: AIProvider,
  seam: ModelSeam,
  models: SeamModels,
  options: MeterOptions = {},
): ProviderFor => {
  const budget = options.budget ?? daprModelBudget;

  return (ctx: Ctx): AIProvider => ({
    name: provider.name,
    getAvailableQualities: () => provider.getAvailableQualities(),

    async generateContent(
      request: GenerateContentRequest,
      quality?: ModelQuality,
    ): Promise<GenerateContentResponse> {
      // `medium` is every provider's default for an omitted quality; keeping
      // the fallback here rather than defaulting the parameter means the price
      // is quoted against the model that will actually run.
      const model = models[quality ?? "medium"];
      const inputTokens =
        estimateTextTokens(request.prompt) +
        estimateImageTokens(request.images?.length ?? 0);
      const outputTokens = OUTPUT_TOKEN_ESTIMATES[seam];

      const reservation = await budget.reserve(ctx, {
        seam,
        provider: provider.name,
        model,
        inputTokens,
        outputTokens,
        reservationId: newReservationId(seam),
        ...(options.entityType === undefined
          ? {}
          : { entityType: options.entityType }),
        metadata: {
          requestId: ctx.requestId,
          quality: quality ?? "medium",
          images: request.images?.length ?? 0,
        },
      });
      if (!reservation.allowed) refuse(seam, reservation);

      const response = await provider.generateContent(request, quality);

      const measured = measuredTokens(response, inputTokens);
      if (reservation.usageId !== null && measured !== null) {
        await settleQuietly(budget, ctx, {
          usageId: reservation.usageId,
          seam,
          provider: provider.name,
          model: response.metadata.model,
          inputTokens: measured.inputTokens,
          outputTokens: measured.outputTokens,
        });
      }
      return response;
    },

    async generateEmbeddings(request: EmbeddingRequest) {
      /*
       * Single-phase, unlike `generateContent`, and not for want of a
       * settlement hop: an embedding has no completion, so the *whole* cost is
       * the input text — which is in hand, exactly, before the call. There is
       * nothing a measurement would tell us that the estimate does not, and no
       * provider here reports embedding tokens anyway.
       */
      const images = request.images?.length ?? 0;
      const reservation = await budget.reserve(ctx, {
        seam,
        provider: provider.name,
        model: request.model ?? models.embedding,
        inputTokens:
          estimateTextTokens(request.content) +
          images * EMBEDDING_IMAGE_TEXT_TOKENS,
        outputTokens: 0,
        reservationId: newReservationId(seam),
        metadata: {
          requestId: ctx.requestId,
          taskType: request.taskType ?? null,
          images,
        },
      });
      if (!reservation.allowed) refuse(seam, reservation);
      return provider.generateEmbeddings(request);
    },
  });
};

/**
 * What the provider says it was billed, split into the two sides that are
 * priced differently.
 *
 * `null` when the provider reported nothing — Ollama does not, and Ollama is
 * free, so there is nothing to correct. A provider that reports only a total
 * (`tokensUsed`) has the input side subtracted out of it: the input estimate
 * is the one half that is nearly exact, because the prompt is a string we
 * built and the images are files we counted.
 */
export const measuredTokens = (
  response: GenerateContentResponse,
  estimatedInputTokens: number,
): { inputTokens: number; outputTokens: number } | null => {
  const { inputTokens, outputTokens, tokensUsed } = response.metadata;
  if (inputTokens !== undefined && outputTokens !== undefined) {
    return { inputTokens, outputTokens };
  }
  if (tokensUsed === undefined) return null;
  return {
    inputTokens: Math.min(estimatedInputTokens, tokensUsed),
    outputTokens: Math.max(0, tokensUsed - estimatedInputTokens),
  };
};
