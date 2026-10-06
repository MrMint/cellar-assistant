/**
 * Which model providers bill nothing per token — the half of X1c's price
 * policy that depends on *where* a provider points rather than on what it is
 * called.
 *
 * `BudgetActor` prices a model call from its own table and never from the
 * caller (`modelCallNanoCents`), and until this module it decided "free" by
 * provider name alone: `ollama` and `openai-compatible` were both priced at
 * zero, unconditionally. For `ollama` that is right — it is a daemon on
 * hardware we own. For `openai-compatible` it was wrong in exactly the case the
 * provider was written to allow: the name is a *wire format*, and
 * `OPENAI_COMPAT_ENDPOINT=https://api.openai.com` is a supported configuration
 * (`config.ts`, `openai-compatible.ts`). Pointed there, every call was booked at
 * zero cents, so `monthly_budget_cents` could never bind on a real invoice —
 * the one failure a budget may not have.
 *
 * So `openai-compatible` is free only when its endpoint is one we host: a
 * loopback, private, link-local or container-network address. Anything else is
 * paid, and is priced like any other paid model — by `AI_MODEL_PRICES` if the
 * operator set one, otherwise at `UNKNOWN_PAID_RATE`, which binds the cap early
 * and visibly. `OPENAI_COMPAT_FREE` overrides the inference either way, for a
 * self-hosted server behind a public name (`true`) or a paid gateway on a
 * private address (`false`).
 *
 * The decision is per *seam*, not per provider, because the provider has two
 * endpoints: `generateContent` goes to `OPENAI_COMPAT_ENDPOINT` and
 * `generateEmbeddings` to `OPENAI_COMPAT_EMBEDDING_ENDPOINT`, and a local vLLM
 * for chat with hosted embeddings is a coherent deployment.
 *
 * This module reads environment strings and nothing else, on purpose: it is
 * imported by `BudgetActor`, an entity actor, and `config.ts` reads key files
 * from disk. `config.ts` imports the endpoint default from here, so the two
 * cannot disagree about where an unset endpoint points.
 */
import { ValidationError } from "@cellar-assistant/contracts";
import type { ProviderName } from "./types.ts";

type Env = Readonly<Record<string, string | undefined>>;

/** Where `openai-compatible` points when `OPENAI_COMPAT_ENDPOINT` is unset. */
export const DEFAULT_OPENAI_COMPAT_ENDPOINT = "http://localhost:8000";

/** Free whatever they point at: a daemon on hardware we own. */
export const ALWAYS_FREE_PROVIDERS: ReadonlySet<ProviderName> = new Set([
  "ollama",
]);

export type FreeModelProviders = {
  /** For `generateContent` — every seam but `embedding`. */
  readonly chat: ReadonlySet<ProviderName>;
  /** For `generateEmbeddings` — the `embedding` seam. */
  readonly embedding: ReadonlySet<ProviderName>;
};

const read = (env: Env, name: string): string | undefined => {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Is this base URL a server we host, rather than someone's API?
 *
 * Deliberately a syntactic test on the URL — no DNS lookup, because this runs
 * at boot and inside an actor turn, and a name that *resolves* to a private
 * address today is not a promise about the invoice. What counts:
 *
 *  - `localhost`, `*.localhost`, and IPv4/IPv6 loopback;
 *  - RFC 1918 and link-local IPv4, IPv6 unique-local and link-local, and the
 *    100.64/10 shared range (Tailscale and friends);
 *  - `host.docker.internal`, and any `*.internal` or `*.local` name — the
 *    container, cloud-VPC and mDNS conventions for "not on the internet";
 *  - a single-label host such as `vllm`: a compose service name, which no
 *    public resolver answers.
 *
 * Anything unparseable is **not** private. A malformed endpoint fails on first
 * use anyway; guessing "free" for it would be the wrong direction to err.
 */
export const isPrivateEndpoint = (endpoint: string): boolean => {
  // `canParse` rather than a try/catch: this directory holds that a catch
  // either rethrows or is the one settlement swallow (no-silent-fallback.test).
  if (!URL.canParse(endpoint)) return false;
  let host = new URL(endpoint).hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host === "") return false;

  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;

  const v4 = IPV4.exec(host);
  if (v4 !== null) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return (
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (host.includes(":")) {
    return (
      host === "::1" ||
      // fc00::/7 (unique local) and fe80::/10 (link local): a full first
      // group, so `fc::1` (which is 0x00fc) does not match.
      /^f[cd][0-9a-f]{2}:/.test(host) ||
      /^fe[89ab][0-9a-f]:/.test(host)
    );
  }
  // A name with no dot is a service name on a private network.
  return !host.includes(".");
};

/** `OPENAI_COMPAT_FREE`: `true`/`false` (or `1`/`0`), or unset to infer. */
const freeOverride = (env: Env): boolean | null => {
  const raw = read(env, "OPENAI_COMPAT_FREE");
  if (raw === undefined) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "true" || lowered === "1") return true;
  if (lowered === "false" || lowered === "0") return false;
  throw new ValidationError(
    `OPENAI_COMPAT_FREE must be true or false (or 1/0), got "${raw}". It ` +
      "decides whether openai-compatible calls cost money; a typo must not " +
      "silently decide it the other way.",
  );
};

/**
 * The providers `BudgetActor` prices at zero, per kind of call, as this
 * environment configures them.
 *
 * Throws `ValidationError` on a malformed `OPENAI_COMPAT_FREE`; `installAI`
 * calls it at boot (via `readModelBudgetPolicy`) so that is a refusal to start,
 * not a failure inside the first reservation.
 */
export const freeModelProviders = (env: Env): FreeModelProviders => {
  const override = freeOverride(env);
  const chatEndpoint =
    read(env, "OPENAI_COMPAT_ENDPOINT") ?? DEFAULT_OPENAI_COMPAT_ENDPOINT;
  const embeddingEndpoint =
    read(env, "OPENAI_COMPAT_EMBEDDING_ENDPOINT") ?? chatEndpoint;
  const withCompat = (free: boolean): ReadonlySet<ProviderName> =>
    free
      ? new Set([...ALWAYS_FREE_PROVIDERS, "openai-compatible"])
      : ALWAYS_FREE_PROVIDERS;
  return {
    chat: withCompat(override ?? isPrivateEndpoint(chatEndpoint)),
    embedding: withCompat(override ?? isPrivateEndpoint(embeddingEndpoint)),
  };
};
