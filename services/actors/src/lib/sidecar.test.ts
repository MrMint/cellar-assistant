/**
 * `parseInvocationResult` — what a *successful* actor invocation's body means.
 *
 * This is the seam where a delivery that worked was being recorded as one that
 * failed. `FileActor.delete` returns `Promise<void>`; Dapr's JS host writes a
 * `void` return as the literal body `undefined`, which is not JSON; the old
 * `JSON.parse(text)` threw; and `OutboxActor` booked a committed delete as a
 * failure and retried it to a dead letter.
 *
 * Nothing caught it earlier because no `void` actor method had ever been
 * invoked through the outbox — `MaintenanceActor`, the only thing that does,
 * had never been scheduled.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseInvocationResult } from "./sidecar.ts";

describe("parseInvocationResult", () => {
  it("reads Dapr's `void` body as undefined instead of throwing", () => {
    // The regression. `JSON.parse("undefined")` is a SyntaxError.
    expect(parseInvocationResult("undefined")).toBeUndefined();
  });

  it("reads an empty body as undefined", () => {
    expect(parseInvocationResult("")).toBeUndefined();
  });

  it("still parses real JSON", () => {
    expect(parseInvocationResult('{"a":1}')).toEqual({ a: 1 });
    expect(parseInvocationResult("[1,2]")).toEqual([1, 2]);
    expect(parseInvocationResult('"text"')).toBe("text");
    expect(parseInvocationResult("42")).toBe(42);
    expect(parseInvocationResult("true")).toBe(true);
    expect(parseInvocationResult("null")).toBeNull();
  });

  it("hands back a non-JSON body rather than failing the delivery", () => {
    // A 2xx without the error header means the method returned. Whatever the
    // body is, it is not by itself evidence the call failed — which is the
    // rule Dapr's own `BufferSerializer` follows.
    expect(parseInvocationResult("OK")).toBe("OK");
  });
});

/**
 * Every call this host makes to its sidecar presents `DAPR_API_TOKEN` as
 * `dapr-api-token` — the invocation (through the shared transport) and both
 * reminder calls, which are hand-rolled. A sidecar started with the token
 * answers `401 invalid api token` to anything without it.
 */
describe("the sidecar's API token", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const capture = async (token: string) => {
    vi.resetModules();
    vi.stubEnv("DAPR_API_TOKEN", token);
    const sent: { url: string; headers: Headers }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        sent.push({ url, headers: new Headers(init.headers) });
        return new Response("null", { status: 200 });
      }),
    );
    const sidecar = await import("./sidecar.ts");
    await sidecar.invokeActorMethod("PingActor", "p", "ping", [], 1_000);
    await sidecar.registerReminder("OutboxActor", "singleton", "drain", {
      dueTime: "1s",
    });
    await sidecar.unregisterReminder("OutboxActor", "singleton", "drain");
    return sent;
  };

  it("is presented on the invocation and both reminder calls", async () => {
    const sent = await capture("tok-abc");
    expect(sent).toHaveLength(3);
    for (const { url, headers } of sent) {
      expect(headers.get("dapr-api-token"), url).toBe("tok-abc");
    }
  });

  it("is omitted when unset", async () => {
    for (const { url, headers } of await capture("")) {
      expect(headers.has("dapr-api-token"), url).toBe(false);
    }
  });
});
