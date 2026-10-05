/**
 * The one HTTP helper the three providers share.
 *
 * Every provider in this directory speaks JSON over `fetch` rather than through
 * a vendor SDK. Three reasons, in order of weight:
 *
 *  1. **`services/actors` has no build step.** It runs straight off the source
 *     under Node's type stripping (`infra/docker-compose.yml`), so every
 *     dependency is a real `node_modules` resolution at run time. `ollama`,
 *     `@google/genai` and `google-auth-library` are three packages and a
 *     transitive tree for what is, in each case, one documented POST.
 *  2. **The failure surface is the point.** `no-silent-fallback.test.ts` has to
 *     be able to prove that a transport failure *propagates* — that no error
 *     path anywhere produces a plausible answer. That is only checkable when
 *     the transport is injectable, which is what `FetchLike` is for.
 *  3. The wire formats are stable and public: Ollama's `/api/embeddings` and
 *     `/api/chat`, Gemini's `:generateContent` / `:embedContent`, Vertex's
 *     `:generateContent` / `:predict`.
 *
 * Errors always carry the provider, the status and the first of the body,
 * because "the model call failed" with no detail is the thing you cannot debug
 * from a dead-lettered outbox row.
 *
 * ## Which error class, and why it decides the retry schedule
 *
 * `image-mime.ts` already states the rule this directory works to:
 * `ConflictError` makes the outbox retry, `ValidationError` dead-letters on the
 * first attempt. Until now every non-ok status collapsed into `ConflictError`,
 * so a provider answering `400 Bad Request` was retried nine more times across
 * ~17 minutes before dying — measured on five live `MenuScanActor.process`
 * rows, each 10 attempts and 17m22s wall, which is exactly `backoffMs`' sum.
 *
 * A 400 does not become a 200 because you asked again: the request we built is
 * one the provider will not accept, and the fix is a deploy, not a wait. So the
 * status decides the class:
 *
 *   - **transient** — 5xx (the provider is unwell), 408 (it timed out), 429
 *     (rate limited, and backoff is precisely the right response) → retry;
 *   - **permanent** — every other 4xx: a malformed request (400), bad or
 *     missing credentials (401/403), a model name that does not exist (404) →
 *     dead-letter now, with the status and body intact for the operator.
 *
 * Erring on the side of retrying is the safe direction, so anything that is not
 * recognisably a client error stays transient.
 */
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";
import { describeImages } from "./image-mime.ts";
import type { FetchLike, ProviderName } from "./types.ts";

/**
 * Could asking again plausibly succeed?
 *
 * Note this is a question about the *status*, not about the provider: it is
 * asked where the HTTP status is still known, because two layers up it is gone
 * and all that is left is an error class.
 */
export const isTransientStatus = (status: number): boolean =>
  status >= 500 || status === 408 || status === 429 || status < 400;

export const defaultFetch: FetchLike = (input, init) =>
  fetch(input, init) as unknown as ReturnType<FetchLike>;

export type PostJsonOptions = {
  readonly url: string;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly provider: ProviderName;
  /** For the error message: `"embeddings"`, `"generateContent"`, `"token"`. */
  readonly what: string;
  readonly fetchImpl: FetchLike;
};

export const postJson = async (options: PostJsonOptions): Promise<unknown> => {
  const { url, body, headers, timeoutMs, provider, what, fetchImpl } = options;

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Rethrown, never swallowed. A DNS failure, a refused connection or a
    // timeout is exactly the case where returning something plausible would
    // be worst — see `config.ts`'s note on the Wisconsin mock.
    throw new ConflictError(
      `${provider} ${what} could not be reached at ${redactUrl(url)}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    const detail =
      `${provider} ${what} failed (${response.status}) at ${redactUrl(url)}: ` +
      text.slice(0, 500);
    // The class is the retry schedule (see this file's header). Same message
    // either way — an operator reading a dead-lettered row needs the status and
    // the body regardless of which of the two it turned out to be.
    throw isTransientStatus(response.status)
      ? new ConflictError(detail)
      : new ValidationError(detail);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ConflictError(
      `${provider} ${what} returned a body that is not JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Say what images the request carried, when a call that carried some fails.
 *
 * Every provider here validates an image's *container* before sending it —
 * `requireImageMime` against that provider's own list — and no signature check
 * can do more than that. What a vision server rejects underneath is the pixel
 * data, and the message it sends back describes its own decoder, not our file:
 * measured 2026-09-18, `gemma3:4b` on ollama 0.34.1 answers `Failed to load
 * image or audio file` identically for an HEIC, a TIFF, a downloaded XML error
 * document and a PNG whose raster is two bytes short. Thirteen menu scans
 * dead-lettered that week carrying exactly that sentence and nothing else —
 * not which image, not how big, not what format we believed it to be.
 *
 * So the call is allowed to fail, and the failure is made to carry the one
 * thing the provider cannot know to tell us: what we gave it. Decoding here to
 * find out first would be a second implementation of the decoder on the other
 * end of the socket, which is how this directory got two image sniffers once
 * already.
 *
 * The error's class is preserved, because the class is the retry schedule
 * (this file's header): a `ValidationError` from a 400 still dead-letters on
 * the first attempt and a `ConflictError` from a refused connection is still
 * retried. Anything else is rethrown untouched.
 */
export const withImageContext = async <T>(
  images: readonly Uint8Array[],
  run: () => Promise<T>,
): Promise<T> => {
  if (images.length === 0) return await run();
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const detail =
      `${error.message} The request carried ${describeImages(images)}. ` +
      "A provider that refuses an image whose container it does accept is " +
      "usually refusing the pixel data: a truncated or otherwise malformed " +
      "raster still has a valid signature, and still renders in a browser, " +
      "so looking at the file proves nothing.";
    if (error instanceof ValidationError) throw new ValidationError(detail);
    if (error instanceof ConflictError) throw new ConflictError(detail);
    throw error;
  }
};

/** Google puts the API key in a query string on some endpoints. Never log it. */
export const redactUrl = (url: string): string =>
  url.replace(/([?&](?:key|access_token)=)[^&]*/gi, "$1[redacted]");

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A numeric vector, validated. A provider that answers `{"embedding": null}`
 * or `["0.1", "0.2"]` must fail here rather than a thousand lines later inside
 * a `halfvec` cast, and must never be coerced into a zero vector — every
 * cosine distance from a zero vector is 1.0, so search would return an
 * arbitrary ordering and look like it worked (`lib/embeddings.ts`).
 */
export const requireVector = (
  value: unknown,
  provider: ProviderName,
  where: string,
): number[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ConflictError(
      `${provider} returned no embedding at ${where}: ` +
        `${JSON.stringify(value)?.slice(0, 200) ?? "undefined"}`,
    );
  }
  const vector = value.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new ConflictError(
        `${provider} returned a non-numeric embedding component at ${where}: ` +
          `${JSON.stringify(entry)}`,
      );
    }
    return entry;
  });
  return vector;
};

export const requireString = (
  value: unknown,
  provider: ProviderName,
  where: string,
): string => {
  if (typeof value !== "string" || value === "") {
    throw new ConflictError(
      `${provider} returned no content at ${where}: ` +
        `${JSON.stringify(value)?.slice(0, 300) ?? "undefined"}`,
    );
  }
  return value;
};
