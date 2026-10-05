/**
 * The embedding seam — C1 (§2.3 `EmbeddingActor`, §5's `getVectorForString`).
 *
 * `EmbeddingActor` is the only thing in the system that turns a phrase into a
 * vector, and it does so through this interface rather than an AI client of its
 * own. Same shape, and the same reason, as B7's `InsightsGenerator` and B5's
 * `GooglePlacesClient`: the no-Dapr harness (`src/lib/testing.ts`) has no
 * credentials and must never reach a model.
 *
 * X1 landed the provider (`src/lib/ai/`), and `boot()` installs a real
 * `Embedder` through `setEmbedder` at boot when `AI_PROVIDER` is set. The
 * default below is unchanged and is still what an unconfigured process gets.
 *
 * ## The default throws, loudly
 *
 * B7 set the rule and B5 repeated it: the production default is **not** a
 * silent no-op returning a zero vector. A zero vector is worse than an error —
 * every cosine distance against it is 1.0, so search would quietly return an
 * arbitrary ordering and look like it worked. `unconfiguredEmbedder` therefore
 * raises `ConflictError` naming what is missing, and a deployment that forgot
 * to wire a model fails on the first search instead of shipping noise.
 *
 * ## Dimensions are checked, not trusted
 *
 * `item_vectors.vector`, `recipe_vectors.vector` and `category_vectors.vector`
 * are all `halfvec(768)`. A provider returning 1536 would be rejected by
 * Postgres deep inside a `<=>` with an error naming neither the provider nor
 * the caller, so the actor checks the length itself and says which.
 *
 * ## A stored vector's identity is the model **and the task instruction**
 *
 * The width is the checkable half. This is the unchecked half, and it fails
 * with no error at all.
 *
 * `EmbeddingTaskType` is Google's vocabulary. On `ollama` it is a **documented
 * no-op** — the field is dropped, so a query and a document embedded through
 * Ollama land in the same space and search works. On an
 * instruction-wrapping model it is **not** a no-op: `openai-compatible` maps
 * each task type to an instruction string that is prepended to the input, and
 * the instruction changes the vector. Measured against a live server:
 * `RETRIEVAL_QUERY` and `RETRIEVAL_DOCUMENT` for the same phrase came back at
 * **cosine 0.9281**, not 1.0.
 *
 * So two vectors are only comparable when the **model, the provider's
 * instruction scheme, and the task-type mapping** all agree. A column of
 * `halfvec(768)` cannot tell any of that apart, and neither can
 * `regenerateVector`. The failure is not an exception — it is retrieval that
 * quietly gets worse, which is the hardest kind to notice.
 *
 * **What has to be re-embedded, and when.** Any of these invalidates *every*
 * stored vector in `item_vectors`, `recipe_vectors`, `category_vectors` and
 * `place_vectors`, and means re-running `regenerateVector` across all of them:
 *
 *  - changing the embedding **model** (`*_EMBEDDING_MODEL`);
 *  - changing **provider** between one that sends instructions and one that
 *    does not — notably `ollama` ⇄ `openai-compatible`, in either direction;
 *  - editing the `INSTRUCTIONS` table in `lib/ai/openai-compatible.ts`;
 *  - changing which `EmbeddingTaskType` a call site asks for.
 *
 * Mixing is worse than switching: documents embedded under one scheme and
 * queries under another degrade silently, where a wholesale switch at least
 * degrades consistently.
 *
 * **It is recorded now** (`20260928162504_vector_embedding_identity`). Every
 * `item_vectors` / `recipe_vectors` row carries `embedding_model` —
 * `<provider>:<model>@<dimensions>/RETRIEVAL_DOCUMENT`, as `EmbeddingActor`
 * reported it — and `embedding_images`, and `regenerateVector` treats a row
 * whose identity is not the configured one as stale (`vectorIsFresh` in
 * `./vectors.ts`). So changing the model or provider is now: deploy, then
 * start `VectorReembedJobActor`, which walks every row whose `embedding_model`
 * differs and re-embeds it. Editing `INSTRUCTIONS` in
 * `lib/ai/openai-compatible.ts`, or the `gemini-embedding-2` task strings in
 * `lib/ai/gemini.ts`, changes vectors *without* changing the key: whoever does
 * either must change `embeddingModelKey` (`./vectors.ts`) in the same commit —
 * a version suffix is enough — so the rows read as stale. `category_vectors`
 * and `place_vectors` carry no such columns yet.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { ConflictError } from "@cellar-assistant/contracts";

/** Every vector column in this database. */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * `RETRIEVAL_QUERY` is what `getVectorForString` asks for when embedding a
 * *search phrase*, and `RETRIEVAL_DOCUMENT` when embedding a stored item.
 * `EmbeddingActor` only ever does the former — `ItemActor.regenerateVector`
 * owns the document side.
 *
 * Those two are not interchangeable on every provider: see "A stored vector's
 * identity" above before changing which one a call site asks for.
 *
 * ## `ctx` is second, not first (X1c)
 *
 * Unlike every actor method (§8.2), because this seam's first argument
 * predates it and widening in place would have rewritten every implementation
 * and every test double. A double that ignores it — which is all of them —
 * still satisfies the type.
 *
 * It is here because the installed embedder charges `BudgetActor` before it
 * calls a model, and a charge needs to know who is spending. `EmbeddingActor`
 * has the ctx and already refuses an anonymous `embed`; this carries it the
 * one step further down, to where the money is.
 */
export type Embedder = (
  input: {
    readonly text: string;
    /**
     * `document` for a stored item or recipe (`RETRIEVAL_DOCUMENT`, as legacy
     * embedded them); a search phrase otherwise (`RETRIEVAL_QUERY`).
     */
    readonly purpose?: "query" | "document";
    /**
     * Files embedded *with* the text into the one vector, in this order — a
     * document's label and display images. Only a model whose identity
     * `acceptsImages` may be handed any; the others refuse.
     */
    readonly imageFileIds?: readonly string[];
  },
  ctx: Ctx,
) => Promise<readonly number[]>;

export const unconfiguredEmbedder: Embedder = async () => {
  throw new ConflictError(
    "EmbeddingActor has no embedding provider wired: AI_PROVIDER is unset, so " +
      "`installAI()` installed nothing at boot. Set AI_PROVIDER=ollama for a " +
      `local model that needs no credentials. Whatever is wired must return a ` +
      `${EMBEDDING_DIMENSIONS}-dimension vector, matching every halfvec column ` +
      "in this database. This throws rather than returning a zero vector " +
      "because a zero vector is distance 1.0 from everything, so search would " +
      `silently return an arbitrary ordering instead of failing. See services/actors/README.md · Local AI.`,
  );
};

/**
 * The installed embedder, defaulting to the loud one above.
 *
 * `EmbeddingActor` is constructed by Dapr, which passes only `(daprClient, id)`
 * — so a real provider cannot be handed in at the construction site the way a
 * test hands one in. X1 therefore adds the module-level registry B2's
 * `item-defaults.ts`, B8's `menu-ai.ts` and C4's `recipe-photo-ai.ts` already
 * use, and for the same reason: `boot()` installs one at startup, once, and
 * every later activation picks it up through the constructor's default.
 *
 * The default stays `unconfiguredEmbedder`. A process that never calls
 * `setEmbedder` — every test in this suite, and any deployment with
 * `AI_PROVIDER` unset — still fails loudly on the first embed rather than
 * returning a zero vector.
 */
let installedEmbedder: Embedder = unconfiguredEmbedder;

export const setEmbedder = (next: Embedder): void => {
  installedEmbedder = next;
};

export const embedder = (): Embedder => installedEmbedder;

// `toVectorLiteral` lives in `./vectors.ts`: the SQL side of a vector, which
// `ItemActor` may import where it may not import this model seam.
