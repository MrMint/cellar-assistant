/**
 * The one test in this repository that reaches a real model.
 *
 * It skips itself unless an Ollama daemon is actually reachable with the two
 * models pulled, so CI and a fresh checkout are unaffected. When it does run it
 * proves the thing no fake can: that the local default produces a vector of the
 * width every `halfvec` column in this database expects, that the same phrase
 * embeds to the same vector twice (which is what makes `EmbeddingActor`'s
 * activation-as-cache sound), and that two phrases that mean similar things
 * land closer together than two that do not — the property every semantic
 * search in the system rests on.
 *
 * Point it somewhere else with `OLLAMA_ENDPOINT`.
 */
import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMENSIONS } from "../embeddings.ts";
import { readAIProviderConfig } from "./config.ts";
import { providerFor } from "./factory.ts";

const ENDPOINT = process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434";

const reachable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${ENDPOINT}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { models?: { name?: string }[] };
    return (body.models ?? []).some((model) =>
      (model.name ?? "").startsWith("nomic-embed-text"),
    );
  } catch {
    // Not reachable is not a failure — this suite is opt-in by environment.
    return false;
  }
};

const skip = !(await reachable());

const config = readAIProviderConfig({
  AI_PROVIDER: "ollama",
  OLLAMA_ENDPOINT: ENDPOINT,
});

/** Cosine distance, the operator `<=>` computes. Range 0–2. */
const cosineDistance = (a: readonly number[], b: readonly number[]): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

describe.skipIf(skip)(`ollama, live at ${ENDPOINT}`, () => {
  const provider = providerFor(config);
  const embed = async (text: string): Promise<number[]> =>
    (await provider.generateEmbeddings({ content: text, type: "text" }))
      .embeddings;

  it("produces a vector of exactly the width every halfvec column is", async () => {
    const vector = await embed("pinot noir");
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector.every((n) => Number.isFinite(n))).toBe(true);
    // Not the zero vector `lib/embeddings.ts` warns about.
    expect(vector.some((n) => n !== 0)).toBe(true);
  });

  it("is deterministic — the property EmbeddingActor's cache assumes", async () => {
    const [first, second] = await Promise.all([
      embed("smoky islay whisky"),
      embed("smoky islay whisky"),
    ]);
    expect(second).toEqual(first);
  });

  it("puts related phrases closer than unrelated ones", async () => {
    const [wine, grape, machinery] = await Promise.all([
      embed("a dry red wine from Bordeaux"),
      embed("cabernet sauvignon grapes"),
      embed("hydraulic excavator maintenance schedule"),
    ]);
    const near = cosineDistance(wine, grape);
    const far = cosineDistance(wine, machinery);
    expect(near).toBeLessThan(far);
    // …and both inside the 0–2 range `similarityFromDistance` assumes.
    expect(near).toBeGreaterThanOrEqual(0);
    expect(far).toBeLessThanOrEqual(2);
  });
});
