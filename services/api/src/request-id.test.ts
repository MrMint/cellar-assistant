/**
 * `x-request-id` is client-controlled, and it becomes `ctx.requestId`, which
 * actors read idempotency keys out of. See `request-id.ts`.
 */
import { anonymousCtx, PingActorDescriptor } from "@cellar-assistant/contracts";
import { describe, expect, it } from "vitest";
import { makeContextFactory } from "./context.ts";
import {
  REQUEST_ID_PATTERN,
  requestIdFor,
  sanitizeRequestId,
} from "./request-id.ts";
import { stubSidecar } from "./testing.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OUTBOX_SPOOF = "outbox:3f9b2c14-7d5e-4a61-9c28-0b4f6e8d1a37";

describe("sanitizeRequestId", () => {
  it.each([
    ["a uuid", "3f9b2c14-7d5e-4a61-9c28-0b4f6e8d1a37"],
    ["a W3C trace id", "4bf92f3577b34da6a3ce929d0e0e4736"],
    ["one character", "a"],
    ["64 characters, the bound", "x".repeat(64)],
    ["underscores and dashes", "req_ABC-123"],
  ])("keeps %s", (_label, value) => {
    expect(sanitizeRequestId(value)).toBe(value);
  });

  it.each([
    ["absent", null],
    ["undefined", undefined],
    ["empty", ""],
    ["65 characters", "x".repeat(65)],
    // The one that matters downstream: actors read this prefix as an outbox
    // delivery and key idempotency on the uuid after it.
    ["an outbox delivery id", OUTBOX_SPOOF],
    ["a space", "a b"],
    ["a newline, which would forge a log line", "a\nb"],
    ["a control character", "a\u0000b"],
    ["non-ASCII", "réq"],
    ["a path", "../etc"],
    ["a repeated header, which node hands over as an array", ["a", "b"]],
  ])("replaces %s with a fresh uuid", (_label, value) => {
    const sanitized = sanitizeRequestId(value);
    expect(sanitized).toMatch(UUID);
    expect(sanitized).toMatch(REQUEST_ID_PATTERN);
  });

  it("mints a different id each time rather than a fixed placeholder", () => {
    expect(sanitizeRequestId(OUTBOX_SPOOF)).not.toBe(
      sanitizeRequestId(OUTBOX_SPOOF),
    );
  });
});

describe("requestIdFor", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("http://api.test/graphql", { method: "POST", headers });

  it("returns the header when it is safe", () => {
    expect(requestIdFor(request({ "x-request-id": "req-1" }))).toBe("req-1");
  });

  it("mints once per request, so every event for a request shares one id", () => {
    const one = request({ "x-request-id": OUTBOX_SPOOF });
    const two = request();
    expect(requestIdFor(one)).toBe(requestIdFor(one));
    expect(requestIdFor(two)).toBe(requestIdFor(two));
    expect(requestIdFor(one)).not.toBe(requestIdFor(two));
  });
});

describe("the context factory", () => {
  it("passes the sanitised id, not the header, to the actors", async () => {
    const { invoke, calls } = stubSidecar({
      "PingActor.ping": () => ({ pong: true }),
    });
    const build = makeContextFactory({
      verify: async (_authorization, requestId) => ({
        ctx: anonymousCtx(requestId),
        viewer: null,
      }),
      invoke,
    });
    const incoming = new Request("http://api.test/graphql", {
      method: "POST",
      headers: { "x-request-id": OUTBOX_SPOOF },
    });

    const context = await build(incoming);
    await context.actor(PingActorDescriptor, "smoke").ping("hi");

    expect(context.ctx.requestId).not.toBe(OUTBOX_SPOOF);
    expect(context.ctx.requestId).toMatch(UUID);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0]).toMatchObject({
      requestId: context.ctx.requestId,
    });
    // The same id the telemetry plugin will read for this request.
    expect(requestIdFor(incoming)).toBe(context.ctx.requestId);
  });
});
