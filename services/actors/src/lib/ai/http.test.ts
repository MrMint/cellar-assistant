/**
 * Which error class `postJson` raises, and therefore how long the outbox
 * spends retrying a model call that was never going to work.
 *
 * `image-mime.ts` states the convention this asserts: `ConflictError` makes the
 * outbox retry, `ValidationError` dead-letters on the first attempt. The
 * classification lives here because here is the last place the HTTP status
 * still exists — two frames up there is only an error class.
 *
 * Measured on the live `cellar-stack` outbox before this change: five
 * `MenuScanActor.process` rows, each a provider **400**, each 10 attempts, each
 * 17m22s wall — exactly `backoffMs`' sum. None of the ten could have differed
 * from the first.
 */
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { isTransientStatus, postJson } from "./http.ts";
import type { FetchLike } from "./types.ts";

/** A `fetch` that answers one canned status, with a body worth reporting. */
const answering = (status: number, body = '{"error":"nope"}'): FetchLike =>
  (async () => new Response(body, { status })) as unknown as FetchLike;

const call = (fetchImpl: FetchLike): Promise<unknown> =>
  postJson({
    url: "http://provider.test/api/chat",
    body: { prompt: "p" },
    timeoutMs: 1_000,
    provider: "ollama",
    what: "generateContent",
    fetchImpl,
  });

describe("isTransientStatus", () => {
  it("treats server errors, timeouts and rate limits as worth retrying", () => {
    for (const status of [500, 502, 503, 504, 408, 429]) {
      expect(isTransientStatus(status)).toBe(true);
    }
  });

  it("treats the other client errors as permanent", () => {
    for (const status of [400, 401, 403, 404, 413, 422]) {
      expect(isTransientStatus(status)).toBe(false);
    }
  });

  it("errs toward retrying anything it does not recognise as a client error", () => {
    // Not reachable through `!response.ok`, but the predicate is exported and
    // the safe direction is "retry", never "bury".
    expect(isTransientStatus(200)).toBe(true);
  });
});

describe("postJson picks the class from the status", () => {
  it("a 400 is permanent: it dead-letters instead of burning ten attempts", async () => {
    await expect(call(answering(400))).rejects.toBeInstanceOf(ValidationError);
  });

  it("bad credentials and a missing model are permanent too", async () => {
    await expect(call(answering(401))).rejects.toBeInstanceOf(ValidationError);
    await expect(call(answering(404))).rejects.toBeInstanceOf(ValidationError);
  });

  it("a 503 stays retryable — the provider is unwell, not wrong", async () => {
    await expect(call(answering(503))).rejects.toBeInstanceOf(ConflictError);
  });

  it("a 429 stays retryable: backoff is the correct response to throttling", async () => {
    await expect(call(answering(429))).rejects.toBeInstanceOf(ConflictError);
  });

  it("reports the status and the body either way", async () => {
    // The class decides the schedule; it must not cost the operator detail.
    await expect(call(answering(400, '{"error":"bad image"}'))).rejects.toThrow(
      /failed \(400\).*bad image/s,
    );
  });

  it("an unreachable provider is retryable, not permanent", async () => {
    const refused: FetchLike = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchLike;
    await expect(call(refused)).rejects.toBeInstanceOf(ConflictError);
  });
});
