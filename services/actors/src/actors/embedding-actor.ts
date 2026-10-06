/**
 * `EmbeddingActor(sha256(lower(trim(text))))` — C1 (migration plan §2.3).
 *
 * > | `EmbeddingActor(hash(text))` | `create_search_vector` + `unstable_cache`
 * > admin workaround | no | vector |
 *
 * The smallest actor in the catalog and the most-called: `CellarActor`'s
 * semantic sort, `ItemActor.regenerateVector`, `ItemSearchActor`,
 * `PlaceSearchActor` and `RecipeSearchActor` all reach it. Its entire job is to
 * be the thing that turns a phrase into 768 floats *once* — the activation is
 * the cache, replacing `src/lib/cache/index.ts`'s `unstable_cache` wrapper
 * around an admin-credentialled `create_search_vector` call (§2.3, and
 * `target-stack.md` §7's note that the workaround exists because Hasura would
 * not expose the function to a `user` role).
 *
 * ## The key is B1's, and it is checked
 *
 * §2.3 says `hash(text)`; B1's outcome note pinned it to
 * `sha256(lower(trim(text)))` because `CellarActor` already addressed the actor
 * that way before it existed. `embeddingActorId` in
 * `@cellar-assistant/contracts` is now the canonical copy, and this actor
 * **verifies** that the text it was handed hashes to its own id.
 *
 * That check is not ceremony. The activation *is* a cache keyed by the text, so
 * an activation addressed as `hash("pinot noir")` but handed `"chardonnay"`
 * would serve a chardonnay vector to every later caller asking for pinot noir —
 * a cache-poisoning bug with no symptom except bad search results. Two live
 * call sites compute the key inline (`embeddingActorId` in `cellar-actor.ts`,
 * `daprEmbedText` in `item-actor.ts`); `embedding-actor.test.ts` asserts all
 * three agree, so a drift becomes a failing test rather than silent nonsense.
 *
 * Note the deliberate asymmetry with every other C1 key: this one trims and
 * lowercases but does **not** collapse inner whitespace, because the two call
 * sites above already shipped without collapsing and widening it here would
 * split their activations from this one. `search.ts` records the same.
 *
 * ## Why it holds the vector rather than a table
 *
 * §1.3 makes Postgres the only truth, and a search vector is not truth — it is
 * a pure function of the text and the model. There is nothing to persist and
 * nothing to lose on eviction; §8.5's 5-minute search idle window bounds how
 * long one phrase stays warm. `computed` on the result says which turn paid for
 * it, which is what makes "identical inputs hit one activation" observable
 * without a log scrape.
 */
import type {
  ActorCategory,
  Ctx,
  EmbedDocumentInput,
  EmbedDocumentResult,
  EmbeddingActorInterface,
  EmbedImageInput,
  EmbedImageResult,
  EmbedResult,
  InternalEmbeddingActorInterface,
} from "@cellar-assistant/contracts";
import {
  documentEmbeddingActorId,
  EmbeddingActorDescriptor,
  embeddingActorId,
  imageEmbeddingActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { ActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import type { Embedder } from "../lib/embeddings.ts";
import { EMBEDDING_DIMENSIONS, embedder } from "../lib/embeddings.ts";
import { requireSignedIn, requireSystem } from "../lib/guards.ts";
import type { ImageEmbedder } from "../lib/image-embeddings.ts";
import {
  documentImageEmbedder,
  queryImageEmbedder,
} from "../lib/image-embeddings.ts";
import { embeddingModel, imageEmbeddingKey } from "../lib/vectors.ts";

export class EmbeddingActor
  extends ActorBase
  implements EmbeddingActorInterface, InternalEmbeddingActorInterface
{
  static readonly category: ActorCategory = EmbeddingActorDescriptor.category;

  readonly #embed: Embedder;
  readonly #embedQueryImage: ImageEmbedder;
  readonly #embedDocumentImage: ImageEmbedder;
  #vector: readonly number[] | null = null;
  #document: EmbedDocumentResult | null = null;
  #image: EmbedImageResult | null = null;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    embed: Embedder = embedder(),
    embedQueryImage: ImageEmbedder = queryImageEmbedder(),
    embedDocumentImage: ImageEmbedder = documentImageEmbedder(),
  ) {
    super(daprClient, id, db);
    this.#embed = embed;
    this.#embedQueryImage = embedQueryImage;
    this.#embedDocumentImage = embedDocumentImage;
  }

  /**
   * §8.4: naturally idempotent — a pure function of `text`, with no write of
   * any kind. Reachable from the outbox only indirectly, through
   * `ItemActor.regenerateVector`.
   */
  async embed(ctx: Ctx, text: string): Promise<EmbedResult> {
    // A caller gate, so `Forbidden` (`lib/guards.ts`): an anonymous request
    // is well-formed, it is just not allowed to spend a model call.
    requireSignedIn(ctx, "search");
    const trimmed = text.trim();
    if (trimmed === "") {
      throw new ValidationError("cannot embed an empty string");
    }
    const expected = embeddingActorId(text);
    if (expected !== this.key) {
      throw new ValidationError(
        `EmbeddingActor(${this.key}) was asked to embed text that hashes to ` +
          `${expected}. The activation is the cache for one phrase (§2.3), so ` +
          "a mismatch would serve this phrase's vector to callers asking for " +
          "another. Address the actor with `embeddingActorId(text)`.",
      );
    }

    if (this.#vector !== null) {
      return {
        vector: this.#vector,
        dimensions: this.#vector.length,
        computed: false,
      };
    }

    const vector = await this.#embed({ text: trimmed }, ctx);
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new ValidationError(
        `the embedding provider returned ${vector.length} dimensions; every ` +
          `halfvec column in this database is ${EMBEDDING_DIMENSIONS}`,
      );
    }
    this.#vector = vector;
    return { vector, dimensions: vector.length, computed: true };
  }

  /**
   * A stored item's or recipe's vector: `RETRIEVAL_DOCUMENT`, with the images
   * it names fused in (C1's document side — `ItemActor` and `RecipeActor`
   * `regenerateVector` reach this rather than `embed`).
   *
   * `system` only: it loads whatever files it is named, as the system, and its
   * only caller is an outbox delivery. Addressed by
   * `documentEmbeddingActorId(input)`, checked here for the reason `embed`
   * checks its own key, and cached on the activation the same way.
   *
   * `model` is this process's configured `embedding_model` — the process that
   * actually ran the model, which is the one whose answer is true during a
   * rolling deploy, when the caller's replica may be configured differently.
   */
  async embedDocument(
    ctx: Ctx,
    input: EmbedDocumentInput,
  ): Promise<EmbedDocumentResult> {
    requireSystem(
      ctx,
      "EmbeddingActor.embedDocument is reached from regenerateVector, an " +
        "outbox delivery; it reads the files it is named as the system",
    );
    const text = typeof input?.text === "string" ? input.text.trim() : "";
    if (text === "") {
      throw new ValidationError("cannot embed an empty document");
    }
    const imageFileIds = Array.isArray(input.imageFileIds)
      ? input.imageFileIds
      : [];
    if (!imageFileIds.every((id) => typeof id === "string")) {
      throw new ValidationError("imageFileIds must be file ids");
    }
    const expected = documentEmbeddingActorId({ text, imageFileIds });
    if (expected !== this.key) {
      throw new ValidationError(
        `EmbeddingActor(${this.key}) was asked to embed a document that ` +
          `hashes to ${expected}. Address it with documentEmbeddingActorId(input).`,
      );
    }
    if (this.#document !== null) {
      return { ...this.#document, computed: false };
    }

    const vector = await this.#embed(
      { text, purpose: "document", imageFileIds },
      ctx,
    );
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new ValidationError(
        `the embedding provider returned ${vector.length} dimensions; every ` +
          `halfvec column in this database is ${EMBEDDING_DIMENSIONS}`,
      );
    }
    this.#document = {
      vector,
      dimensions: vector.length,
      computed: true,
      model: embeddingModel()?.key ?? null,
    };
    return this.#document;
  }

  /**
   * G32: a person's search photo, embedded alone (`purpose: "query"`, signed
   * in), charged to `ai_model/image_search`. `ItemSearchActor` reaches it.
   *
   * Addressed by `imageEmbeddingActorId(input, viewerId)`, which puts the
   * viewer in the key: the activation caches the vector, and the file's
   * visibility was checked for *this* caller when the image was loaded
   * (`FileActor.presignReadInternal` inside the seam). A cache shared across
   * viewers would hand the second one a vector of a file they may not read.
   *
   * A process that cannot embed images throws `IMAGE_SEARCH_UNAVAILABLE` from
   * the seam, before fetching or charging anything.
   */
  async embedImage(
    ctx: Ctx,
    input: EmbedImageInput,
  ): Promise<EmbedImageResult> {
    requireSignedIn(ctx, "search by photo");
    const fileId = this.#requireImageKey(ctx, input, "query");
    if (this.#image !== null) return { ...this.#image, computed: false };
    return this.#keepImage(await this.#embedQueryImage(ctx, { fileId }));
  }

  /**
   * G32: a stored `item_image`, embedded alone (`purpose: "document"`), for
   * `item_image_vectors` — charged to `ai_model/image_embedding`. System
   * only: `ItemActor.embedImage`, an outbox delivery or the backfill, reaches
   * it, and it reads the file as the system.
   *
   * A separate method from {@link embedImage} rather than a branch inside
   * one, because each spends a different budget seam and `services/api`'s
   * model-backed-fields analysis attributes a method to one seam.
   */
  async embedStoredImage(
    ctx: Ctx,
    input: EmbedImageInput,
  ): Promise<EmbedImageResult> {
    requireSystem(
      ctx,
      "a stored image is embedded by ItemActor.embedImage, an outbox " +
        "delivery; a person's photo goes through embedImage",
    );
    const fileId = this.#requireImageKey(ctx, input, "document");
    if (this.#image !== null) return { ...this.#image, computed: false };
    return this.#keepImage(await this.#embedDocumentImage(ctx, { fileId }));
  }

  /** The file id, once the input is well-formed and hashes to this activation. */
  #requireImageKey(
    ctx: Ctx,
    input: EmbedImageInput,
    purpose: EmbedImageInput["purpose"],
  ): string {
    if (input?.purpose !== purpose) {
      throw new ValidationError(
        `this method embeds a \`${purpose}\` image; got ${JSON.stringify(input?.purpose)}`,
      );
    }
    const fileId = typeof input.fileId === "string" ? input.fileId.trim() : "";
    if (fileId === "") {
      throw new ValidationError("an image embedding needs a fileId");
    }
    const expected = imageEmbeddingActorId({ fileId, purpose }, ctx.viewerId);
    if (expected !== this.key) {
      throw new ValidationError(
        `EmbeddingActor(${this.key}) was asked to embed an image that hashes ` +
          `to ${expected}. Address it with imageEmbeddingActorId(input, viewerId).`,
      );
    }
    return fileId;
  }

  #keepImage(vector: readonly number[]): EmbedImageResult {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new ValidationError(
        `the embedding provider returned ${vector.length} dimensions for an ` +
          `image; every halfvec column in this database is ${EMBEDDING_DIMENSIONS}`,
      );
    }
    this.#image = {
      vector,
      dimensions: vector.length,
      computed: true,
      model: imageEmbeddingKey(embeddingModel()),
    };
    return this.#image;
  }
}
