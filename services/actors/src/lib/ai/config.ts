/**
 * Where a provider's configuration comes from, and what "not configured" means.
 *
 * ## The failure mode this module is designed against
 *
 * `functions/refreshPlaces/_services/factory.ts` — still on the Nhost side, and
 * the reason X1 was written the way it was — contains this:
 *
 * ```ts
 * if (!hasCredentials) {
 *   console.warn("… falling back to mock service");
 *   return new MockPlaceDataService();   // reads wisconsin-places.json
 * }
 * ```
 *
 * A `console.warn` in a log nobody reads, and every caller downstream getting
 * plausible-looking Wisconsin restaurants in production. Nothing failed;
 * everything was wrong. So this module has exactly two outcomes and no third:
 *
 *  - **`AI_PROVIDER` unset or empty** — nothing is configured. `selectProvider`
 *    returns `null`, boot leaves all five seams at their `unconfigured*`
 *    defaults, and the first AI-backed request fails with the seam's own
 *    message naming what is missing. This is the honest state for a checkout
 *    with no model available.
 *  - **`AI_PROVIDER` set** — the operator meant it, so every value that
 *    provider needs must be present. A missing one **throws**, at boot, before
 *    the actor host starts serving. It never degrades to another provider and
 *    never degrades to a stub.
 *
 * There is deliberately no `NODE_ENV`-shaped branch anywhere in this directory.
 * The old factory's mock lane was reached through one (`isLocalDevelopment &&
 * !hasCredentials`), and then through the unconditional fallback underneath it
 * when that guard did not hold. `no-silent-fallback.test.ts` asserts the
 * absence structurally.
 */
import { readFileSync } from "node:fs";
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";
import { EMBEDDING_DIMENSIONS } from "../embeddings.ts";
import { DEFAULT_OPENAI_COMPAT_ENDPOINT } from "./billing.ts";
import { isGeminiEmbedding2 } from "./gemini.ts";
import type { ModelQuality, ProviderName } from "./types.ts";
import { isProviderName, PROVIDER_NAMES } from "./types.ts";

export type Env = Readonly<Record<string, string | undefined>>;

/** The three chat models a provider maps its quality tiers onto. */
export type QualityModels = Readonly<Record<ModelQuality, string>>;

type Common = {
  readonly embeddingModel: string;
  /**
   * Every `halfvec` column in this database is 768 wide, so this defaults to
   * `EMBEDDING_DIMENSIONS` rather than to whatever a model prefers.
   * `EmbeddingActor` re-checks the width it actually got; this is what asks
   * for the right one in the first place, where the provider supports asking.
   */
  readonly embeddingDimensions: number;
  readonly models: QualityModels;
  readonly timeoutMs: number;
};

export type OllamaConfig = Common & {
  readonly provider: "ollama";
  readonly endpoint: string;
};

export type GoogleAIConfig = Common & {
  readonly provider: "google-ai";
  readonly apiKey: string;
};

/** The five fields of a service-account key this port actually signs with. */
export type ServiceAccountKey = {
  readonly type: string;
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
};

export type VertexAIConfig = Common & {
  readonly provider: "vertex-ai";
  readonly projectId: string;
  readonly location: string;
  /**
   * `VERTEX_AI_EMBEDDING_LOCATION`, or `null` to let the model decide
   * (`embeddingLocation` in `vertex-ai.ts`). Read here with everything else
   * rather than from `process.env` at call time, which is what it used to be.
   */
  readonly embeddingLocation: string | null;
  readonly credentials: ServiceAccountKey;
};

/**
 * Any server speaking OpenAI's `/v1/chat/completions` + `/v1/embeddings`.
 *
 * ## Why there are two endpoints
 *
 * `AIProvider` demands *both* `generateContent` (a multimodal chat model, for
 * the four vision seams) and `generateEmbeddings`. Ollama serves many models
 * from one daemon, so `OllamaConfig` needs one endpoint. **vLLM does not** —
 * `vllm serve <model>` is one model per server process, so reaching vLLM at all
 * means two ports.
 *
 * `embeddingEndpoint` therefore defaults to `endpoint` rather than to a second
 * port: a single-base server (LM Studio, `llama-server`, Ollama's `/v1`,
 * api.openai.com) then needs no second variable, and only vLLM pays for vLLM's
 * design. That default is the one thing here that makes the config shape not
 * vLLM-specific.
 *
 * ## `apiKey` is optional, and that is not a hole
 *
 * A local server has no credential; vLLM started with `--api-key` and the real
 * OpenAI API both do. So an absent key means "send no `Authorization` header",
 * not "fail". This is *not* the set-but-incomplete case `require_` exists for:
 * nothing is missing, because a local server requires nothing. `endpoint` is
 * the value this provider genuinely cannot run without, and it is defaulted
 * rather than required because a wrong-but-present localhost URL fails on
 * first use with a connection error naming the port — which is a better error
 * than a boot-time throw for the overwhelmingly common local case.
 *
 * ## Whether it costs money depends on the endpoint, not on the name
 *
 * A local server bills nothing; api.openai.com bills per token. `BudgetActor`
 * prices this provider at zero only when the endpoint a call goes to is a
 * loopback, private or container-network address, or `OPENAI_COMPAT_FREE=true`
 * says so — see `billing.ts`. Pointed anywhere else it is a paid provider,
 * priced by `AI_MODEL_PRICES` or, failing that, at `UNKNOWN_PAID_RATE`.
 */
export type OpenAICompatibleConfig = Common & {
  readonly provider: "openai-compatible";
  /** Base URL for `/v1/chat/completions`. `/v1` is appended if absent. */
  readonly endpoint: string;
  /** Base URL for `/v1/embeddings`. Defaults to `endpoint`. */
  readonly embeddingEndpoint: string;
  /** Sent as `Authorization: Bearer`, when present. Never logged. */
  readonly apiKey: string | null;
  /**
   * Caps the completion. Left unset by default: vLLM defaults to the model's
   * full context, and guessing low here is how a menu extraction gets
   * truncated into invalid JSON. `finish_reason: "length"` names this.
   */
  readonly maxTokens: number | null;
  /**
   * Truncate + L2-renormalise an over-wide embedding to
   * `embeddingDimensions`, instead of throwing.
   *
   * **Off by default, and it must stay off unless the model is documented as
   * Matryoshka.** `Qwen3-VL-Embedding-2B` is (64–2048, and a truncated 768
   * slice keeps 1.000 rank agreement —
   * `docs/architecture/findings/vllm-provider.md` §4.2). `nomic-embed-text`
   * and OpenAI's `text-embedding-3-*` are. A model that is *not* yields a
   * vector that is unit-norm, contains no NaN, inserts into `halfvec(768)`
   * happily and is meaningless — the exact silent-wrongness this directory is
   * written against. Setting this asserts a property of the model; the code
   * cannot check it for you.
   */
  readonly truncateEmbeddings: boolean;
};

export type AIProviderConfig =
  | OllamaConfig
  | GoogleAIConfig
  | VertexAIConfig
  | OpenAICompatibleConfig;

/**
 * What `AI_REQUEST_TIMEOUT_MS` is when nobody sets it.
 *
 * Exported alongside {@link aiRequestTimeoutMs} because `OutboxActor` needs an
 * answer even when the variable is unreadable — see `modelCallFloorMs` there.
 */
/**
 * The embedding model both Google providers default to: production's (the
 * owner's decision, 2026-09-28), GA on the Gemini API
 * and Vertex since 2026-04-22, and the GA successor of the
 * `gemini-embedding-2-preview` legacy production embedded every stored vector
 * with. Its space is incompatible with every other model's, so switching to
 * it (or away) is a re-embed of everything — `VectorReembedJobActor`.
 */
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-2";

export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 120_000;

/**
 * The chat models both Google providers default to, by quality tier. The same
 * ids are served on Vertex and on the Gemini API.
 *
 * **Changed 2026-10-04, ahead of a retirement.** The previous defaults
 * (`gemini-2.5-flash-lite`, `-2.5-flash`, `-2.5-pro`) retire on Vertex on
 * 2026-10-20 (the "Model versions and lifecycle" page). Production's Nhost
 * functions had already moved on (`82450ad1`,
 * `functions/_utils/ai-providers/vertex-ai.ts`), so the port had regressed.
 * Google's own replacement column names these:
 *
 * - `low`: `gemini-3.1-flash-lite`. GA, guaranteed available until at least
 *   2027-05-07. Place review, which a user waits on in their turn.
 * - `medium`: `gemini-3.5-flash-lite`. GA, at least until 2027-07-21. Google
 *   calls it "a suitable replacement for Gemini 2.5 Flash", at the same price.
 * - `high`: `gemini-3.5-flash`. GA, at least until 2027-05-19. This tier
 *   reads label, menu and recipe photographs. It beat `gemini-3.8-flash` in a
 *   bake-off on ten real production label photos, run through the real
 *   item-defaults seam on 2026-10-04. Neither model returned a wrong value.
 *   3.5 filled 20 ground-truth fields and 3.8 filled 17; 3.8 left out more,
 *   such as a printed vintage and a wine style. Both refused a venue photo
 *   sent as a label. 3.8 is cheaper until 2026-12-31 and faster, but it is on
 *   Google's short-availability list: no date, only 45 days' notice. Swap it
 *   in only after a better eval.
 *
 * No `thinkingConfig` is sent. Each model thinks at its own default, and
 * `gemini-3.8-flash` answers `400` to `thinkingLevel: MINIMAL`, so it must not
 * be sent one. `thinkingBudget` is deprecated on 3.x. `providers.test.ts`
 * fails if any default here is on its list of retired ids.
 */
export const GEMINI_CHAT_MODELS: QualityModels = {
  low: "gemini-3.1-flash-lite",
  medium: "gemini-3.5-flash-lite",
  high: "gemini-3.5-flash",
};

const read = (env: Env, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
};

/**
 * Required, or a `ConflictError` naming the variable and the provider that
 * wanted it. `ConflictError` rather than `ValidationError` for the same reason
 * every seam's default uses it: this is a deployment-state problem, so the API
 * reports "cannot be done right now" and the outbox retries instead of
 * dead-lettering on the first attempt.
 */
const require_ = (env: Env, name: string, provider: ProviderName): string => {
  const value = read(env, name);
  if (value === undefined) {
    throw new ConflictError(
      `${name} is required for the "${provider}" AI provider. AI_PROVIDER is ` +
        `set to "${provider}", so this is a misconfiguration, not an absence: ` +
        "unset AI_PROVIDER entirely if you mean to run without a model. " +
        "See services/actors/README.md and infra/.env.example.",
    );
  }
  return value;
};

const positiveInt = (env: Env, name: string, fallback: number): number => {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive integer, got ${raw}`);
  }
  return value;
};

/** `positiveInt`, but absent stays absent rather than taking a default. */
const optionalPositiveInt = (env: Env, name: string): number | null => {
  const raw = read(env, name);
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive integer, got ${raw}`);
  }
  return value;
};

/**
 * A strict boolean. `OPENAI_COMPAT_EMBEDDING_TRUNCATE=yes` **throws** rather
 * than reading as false: this flag asserts a property of the embedding model,
 * and a typo that silently disables it would restore exactly the dimension
 * error the operator was trying to suppress.
 */
const flag = (env: Env, name: string, fallback: boolean): boolean => {
  const raw = read(env, name);
  if (raw === undefined) return fallback;
  const lowered = raw.toLowerCase();
  if (lowered === "true" || lowered === "1") return true;
  if (lowered === "false" || lowered === "0") return false;
  throw new ValidationError(
    `${name} must be true or false (or 1/0), got "${raw}"`,
  );
};

const qualityModels = (
  env: Env,
  prefix: string,
  defaults: QualityModels,
): QualityModels => ({
  low: read(env, `${prefix}_MODEL_LOW`) ?? defaults.low,
  medium: read(env, `${prefix}_MODEL_MEDIUM`) ?? defaults.medium,
  high: read(env, `${prefix}_MODEL_HIGH`) ?? defaults.high,
});

const common = (
  env: Env,
  prefix: string,
  defaultModels: QualityModels,
  defaultEmbeddingModel: string,
): Common => ({
  embeddingModel:
    read(env, `${prefix}_EMBEDDING_MODEL`) ?? defaultEmbeddingModel,
  embeddingDimensions: positiveInt(
    env,
    "AI_EMBEDDING_DIMENSIONS",
    EMBEDDING_DIMENSIONS,
  ),
  models: qualityModels(env, prefix, defaultModels),
  timeoutMs: aiRequestTimeoutMs(env),
});

/**
 * The longest one model call may run before the AI layer itself gives up.
 *
 * Exported because it is not only this layer's business. Most model calls in
 * this app are made inside an **outbox delivery**, and `OutboxActor` bounds a
 * delivery separately (`deliveryTimeoutMs`). If that bound is the shorter of
 * the two, the drainer abandons and retries a call the AI layer has not yet
 * been allowed to finish *or* to classify — so the provider is asked the same
 * question again, and again, while nothing about the first ask was wrong. The
 * outbox reads this to keep its own bound above it; see the floor in
 * `outbox-actor.ts` for the measurement that made it necessary.
 *
 * One definition, read from two places, rather than two copies of 120_000 —
 * the same argument `RECLAIM_AFTER` makes about deriving its interval literal.
 */
export const aiRequestTimeoutMs = (env: Env = process.env): number =>
  positiveInt(env, "AI_REQUEST_TIMEOUT_MS", DEFAULT_AI_REQUEST_TIMEOUT_MS);

/**
 * Which provider the operator asked for, or `null` for "none".
 *
 * A value that is not one of the three **throws**: `AI_PROVIDER=vertex` is a
 * typo, not a request to run without AI, and silently treating it as the latter
 * is the same class of bug as the mock fallback.
 */
export const selectProvider = (env: Env = process.env): ProviderName | null => {
  const raw = read(env, "AI_PROVIDER");
  if (raw === undefined) return null;
  if (!isProviderName(raw)) {
    throw new ValidationError(
      `AI_PROVIDER="${raw}" is not a known provider. Use one of ` +
        `${PROVIDER_NAMES.join(", ")}, or unset it to run with no AI provider ` +
        "(every AI-backed feature then fails loudly on use).",
    );
  }
  return raw;
};

export const readAIProviderConfig = (
  env: Env = process.env,
): AIProviderConfig => {
  const provider = selectProvider(env);
  if (provider === null) {
    throw new ConflictError(
      "no AI provider is configured: AI_PROVIDER is unset. Set it to one of " +
        `${PROVIDER_NAMES.join(", ")} — "ollama" needs no credentials and is ` +
        "the local default (services/actors/README.md · Local AI).",
    );
  }

  switch (provider) {
    case "ollama":
      return {
        provider,
        // The actor host runs in a container; Ollama runs on the developer's
        // machine. `host.docker.internal` is what compose passes in.
        endpoint: read(env, "OLLAMA_ENDPOINT") ?? "http://localhost:11434",
        ...common(
          env,
          "OLLAMA",
          { low: "gemma3:4b", medium: "gemma3:4b", high: "gemma3:12b" },
          "nomic-embed-text",
        ),
      };

    case "openai-compatible": {
      const endpoint =
        read(env, "OPENAI_COMPAT_ENDPOINT") ?? DEFAULT_OPENAI_COMPAT_ENDPOINT;
      return {
        provider,
        endpoint,
        // One base serves both routes on every server but vLLM; see the type.
        embeddingEndpoint:
          read(env, "OPENAI_COMPAT_EMBEDDING_ENDPOINT") ?? endpoint,
        apiKey: read(env, "OPENAI_COMPAT_API_KEY") ?? null,
        maxTokens: optionalPositiveInt(env, "OPENAI_COMPAT_MAX_TOKENS"),
        truncateEmbeddings: flag(
          env,
          "OPENAI_COMPAT_EMBEDDING_TRUNCATE",
          false,
        ),
        ...common(
          env,
          "OPENAI_COMPAT",
          // No default is right for every server, so these name the sanctioned
          // local pair (docs/architecture/e4-decisions.md §12) and are wrong
          // loudly rather than quietly: a model string the server does not
          // serve comes back as a 404 naming the model it was asked for.
          {
            low: "Qwen/Qwen3-VL-2B-Instruct",
            medium: "Qwen/Qwen3-VL-2B-Instruct",
            high: "Qwen/Qwen3-VL-8B-Instruct",
          },
          "Qwen/Qwen3-VL-Embedding-2B",
        ),
      };
    }

    case "google-ai":
      return {
        provider,
        apiKey: require_(env, "GOOGLE_AI_API_KEY", provider),
        ...common(
          env,
          "GOOGLE_AI",
          GEMINI_CHAT_MODELS,
          // Production's model (legacy embedded with its `-preview`). Asked for
          // 768 through `outputDimensionality`; it re-normalises a truncated
          // vector itself, and `EmbeddingActor` still checks the width.
          GEMINI_EMBEDDING_MODEL,
        ),
      };

    case "vertex-ai":
      return requireServedEmbeddingLocation({
        provider,
        projectId: require_(env, "GOOGLE_GCP_PROJECT_ID", provider),
        location: read(env, "GOOGLE_GCP_LOCATION") ?? "global",
        embeddingLocation: read(env, "VERTEX_AI_EMBEDDING_LOCATION") ?? null,
        credentials: readServiceAccountKey(env, provider),
        ...common(env, "VERTEX_AI", GEMINI_CHAT_MODELS, GEMINI_EMBEDDING_MODEL),
      });
  }
};

/**
 * Refuses `VERTEX_AI_EMBEDDING_LOCATION` pinned to a region Vertex does not
 * serve the embedding model from.
 *
 * `gemini-embedding-2` is served **only** at `global` (`vertex-ai.ts`,
 * "Locations"): every regional `:embedContent` for it answers 404. So a
 * regional value with that model is not a preference, it is a configuration
 * under which every embedding fails — and the failure would surface as a
 * stream of dead-lettered `regenerateVector` deliveries long after boot,
 * rather than here.
 *
 * **Possibly stale (2026-10-04):** the `gemini-embedding-2` model page, last
 * updated 2026-10-02, now lists the `us` and `eu` multi-regions as well as
 * `global`. Nobody has called either from here, and the 404s above were
 * measured against single regions such as `us-central1`. So this still allows
 * only `global` until a multi-region is tested live. `global` is what every
 * deployment uses anyway, and non-global is billed 10% higher.
 *
 * `ValidationError`, like a typo'd `AI_PROVIDER`: the value
 * is set, and wrong. Leaving the variable empty lets `embeddingLocation` pick
 * `global` itself; a region stays legal for the `text-embedding-*` models,
 * which are only served regionally.
 */
const requireServedEmbeddingLocation = (
  config: VertexAIConfig,
): VertexAIConfig => {
  const pinned = config.embeddingLocation;
  if (
    pinned !== null &&
    pinned !== "global" &&
    isGeminiEmbedding2(config.embeddingModel)
  ) {
    throw new ValidationError(
      `VERTEX_AI_EMBEDDING_LOCATION="${pinned}" cannot serve ` +
        `${config.embeddingModel}: Vertex serves it only at "global", so ` +
        "every embedding call would 404. Leave VERTEX_AI_EMBEDDING_LOCATION " +
        "empty (the model's own location is then used) or set it to global.",
    );
  }
  return config;
};

/**
 * A service-account key, from a file path or inline JSON.
 *
 * The Nhost factory had a third lane — fetch the key out of the
 * `admin_credentials` table with the Hasura admin secret. It is not ported:
 * that table does not exist in the transformed schema, §1.3 makes Postgres the
 * truth for *domain* rows and not for secrets, and the lane meant every cold
 * provider construction did a GraphQL round trip against an admin-credentialled
 * client. Deployment secrets belong in the environment.
 */
const readServiceAccountKey = (
  env: Env,
  provider: ProviderName,
): ServiceAccountKey => {
  const inline = read(env, "GOOGLE_APPLICATION_CREDENTIALS_JSON");
  const path = read(env, "GOOGLE_APPLICATION_CREDENTIALS");
  if (inline === undefined && path === undefined) {
    throw new ConflictError(
      'the "vertex-ai" provider needs a service-account key: set ' +
        "GOOGLE_APPLICATION_CREDENTIALS to a key file path, or " +
        "GOOGLE_APPLICATION_CREDENTIALS_JSON to the key itself. " +
        "(The Nhost lane that read the key out of `admin_credentials` is not " +
        "ported — see this file's note.)",
    );
  }

  const raw =
    inline ?? readKeyFile(path ?? "" /* unreachable: checked above */);
  return parseServiceAccountKey(raw, provider);
};

const readKeyFile = (path: string): string => {
  // Synchronous on purpose: this runs once, at boot, before the host serves.
  // `node:fs` is not on `no-external-calls.test.ts`'s forbidden list — that
  // list is about *network* transports, and this file is never imported by an
  // entity actor.
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new ConflictError(
      `could not read GOOGLE_APPLICATION_CREDENTIALS at ${path}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const parseServiceAccountKey = (
  raw: string,
  provider: ProviderName,
): ServiceAccountKey => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ConflictError(
      `the "${provider}" service-account key is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ConflictError(
      `the "${provider}" service-account key must be a JSON object`,
    );
  }
  const key = parsed as Partial<ServiceAccountKey>;
  const missing = (
    ["project_id", "client_email", "private_key"] as const
  ).filter((field) => typeof key[field] !== "string" || key[field] === "");
  if (missing.length > 0) {
    throw new ConflictError(
      `the "${provider}" service-account key is missing ${missing.join(", ")}. ` +
        "A key with fields missing is a broken deployment, not a reason to " +
        "run without a model.",
    );
  }
  return {
    type: key.type ?? "service_account",
    project_id: key.project_id ?? "",
    client_email: key.client_email ?? "",
    private_key: key.private_key ?? "",
    token_uri: key.token_uri,
  };
};
