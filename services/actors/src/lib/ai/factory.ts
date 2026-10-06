/**
 * `createAIProvider()` — X1's port of `functions/_utils/ai-providers/factory.ts`.
 *
 * One switch over `AI_PROVIDER`, one branch per provider, and **no default
 * branch that returns anything**. The old factory's `default:` threw, and that
 * part was right; what this port adds is that every *reachable* path either
 * returns a real, fully-credentialled provider or throws. There is no
 * environment-shaped shortcut and no stub.
 *
 * ## Caching
 *
 * The Nhost factory cached a single module-level provider and had to be
 * `async` because one branch fetched credentials out of Postgres. Neither
 * survives: configuration is read from the environment, so construction is
 * synchronous and cheap, and the cache is keyed by the resolved provider name
 * so a test that changes the environment gets a different provider rather than
 * a stale one. `resetAIProviderCache()` is exported for the same reason the
 * old `resetProviderCache()` was.
 */
import type { AIProviderConfig, Env } from "./config.ts";
import { readAIProviderConfig } from "./config.ts";
import { createGoogleAIProvider } from "./google-ai.ts";
import { defaultFetch } from "./http.ts";
import { createOllamaProvider } from "./ollama.ts";
import { createOpenAICompatibleProvider } from "./openai-compatible.ts";
import type { AIProvider, FetchLike } from "./types.ts";
import { createVertexAIProvider } from "./vertex-ai.ts";

export type CreateOptions = {
  readonly env?: Env;
  /** Injected by the tests; production always gets `globalThis.fetch`. */
  readonly fetchImpl?: FetchLike;
};

let cached: { readonly key: string; readonly provider: AIProvider } | null =
  null;

/** Build a provider from an already-resolved configuration. No env access. */
export const providerFor = (
  config: AIProviderConfig,
  fetchImpl: FetchLike = defaultFetch,
): AIProvider => {
  switch (config.provider) {
    case "ollama":
      return createOllamaProvider(config, fetchImpl);
    case "google-ai":
      return createGoogleAIProvider(config, fetchImpl);
    case "vertex-ai":
      return createVertexAIProvider(config, fetchImpl);
    case "openai-compatible":
      return createOpenAICompatibleProvider(config, fetchImpl);
  }
};

/**
 * The configured provider, or a throw.
 *
 * Never returns `null`, never returns a fallback, and never consults
 * `NODE_ENV`. A caller that reaches a `return` here is holding a provider whose
 * credentials were all present.
 */
export const createAIProvider = (options: CreateOptions = {}): AIProvider => {
  const config = readAIProviderConfig(options.env ?? process.env);
  const key = cacheKey(config);
  if (
    options.fetchImpl === undefined &&
    cached !== null &&
    cached.key === key
  ) {
    return cached.provider;
  }
  const provider = providerFor(config, options.fetchImpl ?? defaultFetch);
  if (options.fetchImpl === undefined) {
    cached = { key, provider };
  }
  return provider;
};

export const resetAIProviderCache = (): void => {
  cached = null;
};

/**
 * Enough of the configuration to notice that it changed. Deliberately excludes
 * every secret — this string ends up in nothing but an equality check, but a
 * cache key has a way of becoming a log line.
 */
const cacheKey = (config: AIProviderConfig): string =>
  [
    config.provider,
    config.embeddingModel,
    config.embeddingDimensions,
    config.models.low,
    config.models.medium,
    config.models.high,
    config.provider === "ollama" ? config.endpoint : "",
    config.provider === "vertex-ai"
      ? `${config.projectId}/${config.location}`
      : "",
    // Both, because they are independently configurable and a stale provider
    // pointed at the previous port is indistinguishable from a dead server.
    config.provider === "openai-compatible"
      ? `${config.endpoint}/${config.embeddingEndpoint}`
      : "",
  ].join("|");
