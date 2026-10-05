/**
 * Reaching `EmbeddingActor` from another actor — a sidecar hop, and nothing
 * else.
 *
 * Its own module, apart from `./embeddings.ts`, on purpose: that module holds
 * the `Embedder` seam, the one thing in this host that talks to an embedding
 * *model*, and `ItemActor` is fenced off from every model seam
 * (`no-external-calls.test.ts`: no multi-second call inside its turn). Asking
 * `EmbeddingActor` for a vector is a different act — an actor call, bounded,
 * cached by the phrase — and importing it must not also hand an actor the
 * model.
 */
import type {
  Ctx,
  EmbedDocumentInput,
  EmbedDocumentResult,
  EmbedResult,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  documentEmbeddingActorId,
  EmbeddingActorDescriptor,
  embeddingActorId,
} from "@cellar-assistant/contracts";
import { internal } from "./internal-client.ts";

/**
 * What an actor holds instead of an `Embedder`: the sidecar hop to
 * `EmbeddingActor`, injected so the no-Dapr harness can substitute a stub.
 *
 * **The one copy.** `CellarActor`, `ItemActor` and `RecipeActor` each used to
 * carry their own adapter and their own `sha256(lower(trim(text)))` — four
 * implementations of one key, held together only by a test comparing them.
 * They all default to this now, and the key is `embeddingActorId` from
 * `@cellar-assistant/contracts`, the same function `EmbeddingActor` checks its
 * own id against.
 *
 * §8.5's call graph sanctions `CellarActor → EmbeddingActor` explicitly and is
 * silent on **search → EmbeddingActor**, which is what `ItemSearchActor`,
 * `PlaceSearchActor` and `RecipeSearchActor` need. The edge is safe for the
 * reason the rule exists: reentrancy is off and Dapr deadlocks only on a cycle,
 * and `EmbeddingActor` calls nothing at all, so the graph stays acyclic. Noted
 * for the plan.
 */
export type EmbedQuery = (ctx: Ctx, text: string) => Promise<readonly number[]>;

export const daprEmbedQuery: EmbedQuery = async (ctx, text) => {
  // Typed by the contract, and still checked: it arrived as JSON, and a
  // search run on a missing vector is worse than a refusal.
  const result: Partial<EmbedResult> | null = await internal(ctx)(
    EmbeddingActorDescriptor,
    embeddingActorId(text),
  ).embed(text);
  const vector = result?.vector;
  if (!Array.isArray(vector)) {
    throw new ConflictError(
      `EmbeddingActor returned no vector for ${JSON.stringify(text.slice(0, 60))}`,
    );
  }
  return vector;
};

/**
 * The document side, for `ItemActor` and `RecipeActor` `regenerateVector`: a
 * stored row's text and images, embedded as `RETRIEVAL_DOCUMENT`, and which
 * embedding made the vector (`embedding_model`).
 */
export type EmbeddedDocument = {
  readonly vector: readonly number[];
  readonly model: string | null;
};

export type EmbedDocument = (
  ctx: Ctx,
  input: EmbedDocumentInput,
) => Promise<EmbeddedDocument>;

export const daprEmbedDocument: EmbedDocument = async (ctx, input) => {
  const result: Partial<EmbedDocumentResult> | null = await internal(ctx)(
    EmbeddingActorDescriptor,
    documentEmbeddingActorId(input),
  ).embedDocument(input);
  const vector = result?.vector;
  if (!Array.isArray(vector)) {
    throw new ConflictError(
      `EmbeddingActor returned no vector for the document ${JSON.stringify(
        input.text.slice(0, 60),
      )}`,
    );
  }
  return {
    vector,
    model: typeof result?.model === "string" ? result.model : null,
  };
};
