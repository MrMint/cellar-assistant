/**
 * `parseInvocationResult` — what a *successful* actor invocation's body means.
 *
 * The seam where a call that worked was reported as one that failed, on both
 * transports: `FileActor.delete` returns `Promise<void>`, Dapr's JS host writes
 * that as the literal body `undefined`, and `JSON.parse` throws on it. See
 * `./invocation.ts` for the two measured consequences.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DAPR_ERROR_RESPONSE_HEADER, NotFoundError } from "./errors.ts";
import {
  actorMethodUrl,
  DAPR_API_TOKEN_HEADER,
  invokeActorOverSidecar,
  parseInvocationResult,
  SidecarError,
} from "./invocation.ts";

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

  it("hands back a non-JSON body rather than failing the call", () => {
    // A 2xx without the error header means the method returned. Whatever the
    // body is, it is not by itself evidence the call failed — which is the
    // rule Dapr's own `BufferSerializer` follows.
    expect(parseInvocationResult("OK")).toBe("OK");
  });
});

describe("invokeActorOverSidecar", () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const respondWith = (
    status: number,
    body: string,
    headers: Record<string, string> = {},
  ): void => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        requests.push({ url, init });
        return new Response(body, { status, headers });
      }),
    );
  };
  const call = () =>
    invokeActorOverSidecar({
      baseUrl: "http://sidecar:3500/v1.0",
      actorType: "FileActor",
      actorId: "wine:a b/c",
      method: "verify",
      args: [{ kind: "user" }, 1],
      timeoutMs: 1_000,
    });

  afterEach(() => {
    requests.length = 0;
    vi.unstubAllGlobals();
  });

  it("encodes every URL segment and posts the arguments as a JSON array", async () => {
    respondWith(200, '{"ok":true}');
    await expect(call()).resolves.toEqual({ ok: true });
    expect(requests[0]?.url).toBe(
      "http://sidecar:3500/v1.0/actors/FileActor/wine%3Aa%20b%2Fc/method/verify",
    );
    expect(requests[0]?.init.method).toBe("POST");
    expect(requests[0]?.init.body).toBe('[{"kind":"user"},1]');
  });

  it("raises the typed class from a 200 carrying the Dapr error header", async () => {
    respondWith(200, '{"code":"NOT_FOUND","message":"no such file"}', {
      [DAPR_ERROR_RESPONSE_HEADER]: "1",
    });
    await expect(call()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("raises a SidecarError, with the whole body, for an opaque failure", async () => {
    const body = `{"errorCode":"ERR_ACTOR_INVOKE_METHOD","pad":"${"x".repeat(600)}"}`;
    respondWith(500, body);
    const error = await call().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SidecarError);
    expect((error as SidecarError).status).toBe(500);
    expect((error as SidecarError).body).toBe(body);
    expect((error as SidecarError).message.length).toBeLessThan(600);
  });

  it("reads a void method's literal `undefined` body as undefined", async () => {
    respondWith(200, "undefined", { "content-type": "text/html" });
    await expect(call()).resolves.toBeUndefined();
  });

  it("lets a network failure through untouched", async () => {
    const refused = new TypeError("fetch failed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw refused;
      }),
    );
    await expect(call()).rejects.toBe(refused);
  });

  it("presents the sidecar's API token when it has one, and no header when it does not", async () => {
    respondWith(200, "null");
    await invokeActorOverSidecar({
      baseUrl: "http://sidecar:3500/v1.0",
      actorType: "FileActor",
      actorId: "x",
      method: "get",
      args: [],
      timeoutMs: 1_000,
      apiToken: "s3cret",
    });
    const sent = new Headers(requests[0]?.init.headers);
    expect(DAPR_API_TOKEN_HEADER).toBe("dapr-api-token");
    expect(sent.get("dapr-api-token")).toBe("s3cret");
    expect(sent.get("content-type")).toBe("application/json");

    await call();
    expect(new Headers(requests[1]?.init.headers).has("dapr-api-token")).toBe(
      false,
    );
    await invokeActorOverSidecar({
      baseUrl: "http://sidecar:3500/v1.0",
      actorType: "FileActor",
      actorId: "x",
      method: "get",
      args: [],
      timeoutMs: 1_000,
      apiToken: "",
    });
    expect(new Headers(requests[2]?.init.headers).has("dapr-api-token")).toBe(
      false,
    );
  });

  it("builds the same URL shape for any base", () => {
    expect(actorMethodUrl("http://h:1/v1.0", "A", "1", "m")).toBe(
      "http://h:1/v1.0/actors/A/1/method/m",
    );
  });
});
