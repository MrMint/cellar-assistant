/**
 * `invokeActor`'s failure detection (A7b).
 *
 * The subject is one non-obvious line: `response.ok` is not "it worked". Dapr's
 * actor protocol signals an *application-level* failure with a response header
 * and leaves the status at 200 — see `services/actors/src/lib/actor-error-envelope.ts`
 * — so a 200 carrying `DAPR_ERROR_RESPONSE_HEADER` is a failure, and treating it
 * as a result would hand a resolver `{ code, message }` where it expected a
 * payload.
 *
 * `fetch` is stubbed with the exact bodies daprd produced against the compose
 * stack; `scripts/a7b-acceptance.sh` in `services/actors` is the same assertions
 * against the real sidecar.
 */
import {
  DAPR_ERROR_RESPONSE_HEADER,
  FileActorDescriptor,
  ForbiddenError,
  ItemOnboardingActorDescriptor,
  PlaceActorDescriptor,
  PlaceCreationActorDescriptor,
} from "@cellar-assistant/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActorInvocationError, invokeActor, timeoutFor } from "./dapr.ts";

const descriptor = { actorType: "OutboxActor" } as never;

const respondWith = (
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status, headers })),
  );
};

const call = () =>
  invokeActor(
    descriptor,
    "singleton",
    "drain" as never,
    {
      viewerId: "u1",
      kind: "user",
      requestId: "r",
    } as never,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("invokeActor (A7b)", () => {
  it("raises the typed class from a 200 carrying the Dapr error header", async () => {
    // Verbatim from daprd 1.18.3, across the api sidecar's remote hop.
    respondWith(
      200,
      '{"code":"FORBIDDEN","message":"OutboxActor.drain is system/admin only"}',
      { [DAPR_ERROR_RESPONSE_HEADER]: "1" },
    );

    // The class, not just the code: `plugin-errors` matches on `instanceof`.
    await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(call()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "OutboxActor.drain is system/admin only",
    });
  });

  it("stays opaque for a wrapped infrastructure failure", async () => {
    respondWith(
      500,
      '{"errorCode":"ERR_ACTOR_INVOKE_METHOD","message":"error invoke actor method: rpc error: code = Internal desc = error invoke actor method: error from actor service: (500) {\\"code\\":\\"INTERNAL\\"}"}',
    );

    await expect(call()).rejects.toBeInstanceOf(ActorInvocationError);
  });

  it("returns a plain 200 as the result", async () => {
    respondWith(200, '{"delivered":3}');

    await expect(call()).resolves.toEqual({ delivered: 3 });
  });
});

describe("invokeActor on a void method", () => {
  it("resolves undefined for Dapr's literal `undefined` body", async () => {
    // Verbatim from the shared lane, 2026-09-27: `FileActor.delete` on an id
    // naming no row, through the api sidecar, answered 200, no error header,
    // `text/html`, body `undefined`. `JSON.parse` threw on it, and
    // `Mutation.deleteFile` answered "Unexpected error." — which, for a real
    // file, arrives after its row has already been deleted.
    respondWith(200, "undefined", {
      "content-type": "text/html; charset=utf-8",
    });

    await expect(
      invokeActor(FileActorDescriptor, "f1", "delete", {
        viewerId: "u1",
        kind: "user",
        requestId: "r",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("timeoutFor (§8.5)", () => {
  it("gives the two request-driven AI calls 120s", () => {
    // `createPlace`, not `create`: the stale spelling left the synchronous AI
    // review on the 15s default from 4e067928 until this test existed.
    expect(timeoutFor(PlaceCreationActorDescriptor, "createPlace")).toBe(
      120_000,
    );
    expect(timeoutFor(ItemOnboardingActorDescriptor, "start")).toBe(120_000);
  });

  it("leaves everything else on the 15s default", () => {
    expect(timeoutFor(PlaceCreationActorDescriptor, "findDuplicates")).toBe(
      15_000,
    );
    expect(timeoutFor(ItemOnboardingActorDescriptor, "confirm")).toBe(15_000);
  });

  it("reads the same table the actor host's own client reads", () => {
    // One bound per method whoever calls it: the host waited 30s on
    // `FileActor.verify` while this hop waited 15s for the same stat.
    expect(timeoutFor(FileActorDescriptor, "verify")).toBe(30_000);
    // `enrichPlaceFromGoogle`'s request half only enqueues, but it queues
    // behind a running system half on the same place, which is the outbox
    // delivery this bound was declared for.
    expect(timeoutFor(PlaceActorDescriptor, "enrichFromGoogle")).toBe(90_000);
  });

  it("refuses, at compile time, a method the contract does not have", () => {
    // If `timeoutFor` ever stops checking the name, this directive is unused
    // and `bun run typecheck` fails — so the negative control runs on every
    // typecheck, not just once by hand.
    // @ts-expect-error — `PlaceCreationActorInterface` has no `create`.
    timeoutFor(PlaceCreationActorDescriptor, "create");
    expect(timeoutFor(PlaceCreationActorDescriptor, "createPlace")).toBe(
      120_000,
    );
  });
});

describe("invokeActor presents the sidecar's API token", () => {
  // Read once, at import, from `DAPR_API_TOKEN` — Dapr's own name for it,
  // which the sidecar reads to decide whether to demand the header.
  const headersSent = async (token: string | undefined) => {
    vi.resetModules();
    if (token === undefined) vi.stubEnv("DAPR_API_TOKEN", "");
    else vi.stubEnv("DAPR_API_TOKEN", token);
    const sent: Headers[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(new Headers(init.headers));
        return new Response("null", { status: 200 });
      }),
    );
    const fresh = await import("./dapr.ts");
    await fresh.invokeActor(
      descriptor,
      "singleton",
      "drain" as never,
      {
        viewerId: "u1",
        kind: "user",
        requestId: "r",
      } as never,
    );
    vi.unstubAllEnvs();
    return sent[0];
  };

  it("sends dapr-api-token when DAPR_API_TOKEN is set", async () => {
    expect((await headersSent("tok-123"))?.get("dapr-api-token")).toBe(
      "tok-123",
    );
  });

  it("sends no header when it is not", async () => {
    expect((await headersSent(undefined))?.has("dapr-api-token")).toBe(false);
  });
});
