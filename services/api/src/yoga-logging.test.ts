/**
 * What reaches the process's own output when a resolver's error is masked.
 *
 * Yoga's default logger prints every error its masker replaces, in full:
 * `ActorInvocationError: CellarActor/<id>.get failed (500): <daprd body>` plus
 * a stack. The id can be a barcode, a search term or an address, and the body
 * quotes it — which is why `actor.invocation_failed` classifies the body and
 * never logs it (`events.ts`). This file holds `createApiYoga` to the same rule
 * for everything Yoga itself would log: an error is reported as a structured
 * `graphql.unexpected_error` (class name, field, request id) and nothing else.
 *
 * Every console method and both output streams are captured, so a leak by any
 * route — a new Yoga log call, a `warn`, a direct stream write — fails here.
 */
import { anonymousCtx, ConflictError } from "@cellar-assistant/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContextFactory } from "./context.ts";
import { ActorInvocationError } from "./dapr.ts";
import { resetEventThrottle } from "./events.ts";
import { useTelemetry } from "./telemetry-plugin.ts";
import { stubSidecar } from "./testing.ts";
import { createApiYoga } from "./yoga.ts";

const CELLAR_ID = "7e1f0a52-3c1d-4b8e-9a44-c0ffee000042";
const SECRET_BODY =
  "secret-sql: select * from users where barcode=0123456789012";
const DAPR_BODY = JSON.stringify({
  errorCode: "ERR_ACTOR_INVOKE_METHOD",
  message: `error invoke actor method: ${SECRET_BODY}`,
});
const REQUEST_ID = "yoga-logging-req-1";

let output: string[] = [];
const render = (value: unknown): string =>
  value instanceof Error
    ? `${value.name}: ${value.message}\n${value.stack ?? ""}`
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

beforeEach(() => {
  output = [];
  resetEventThrottle();
  for (const method of ["error", "warn", "log", "info", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      output.push(`${method}: ${args.map(render).join(" ")}`);
    });
  }
  for (const stream of [process.stdout, process.stderr]) {
    vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
      output.push(`stream: ${String(chunk)}`);
      return true;
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

const anonymousVerify = async (_header: string | null, requestId: string) => ({
  ctx: anonymousCtx(requestId),
  viewer: null,
});

const post = (yoga: ReturnType<typeof createApiYoga>, query: string) =>
  yoga.fetch("http://api.test/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": REQUEST_ID },
    body: JSON.stringify({ query }),
  });

const expectNothingSecret = (): void => {
  const all = output.join("\n");
  expect(all).not.toContain(CELLAR_ID);
  expect(all).not.toContain("secret-sql");
  expect(all).not.toContain("ERR_ACTOR_INVOKE_METHOD");
  expect(all).not.toMatch(/failed \(500\)/);
  // No stack frame either: a path is not a secret, but a stack is how the
  // message above travelled, and nothing here should print one.
  expect(all).not.toMatch(/\n\s+at /);
};

const unexpectedErrorLines = (): string[] =>
  output.filter((line) => line.includes("[graphql.unexpected_error]"));

describe("createApiYoga: a masked error is logged redacted, once", () => {
  const failingInvoke = () =>
    stubSidecar({
      "CellarActor.get": (actorId) => {
        throw new ActorInvocationError(
          "CellarActor",
          actorId,
          "get",
          500,
          DAPR_BODY,
        );
      },
    }).invoke;

  it.each([
    ["with the telemetry plugin (production)", true],
    ["without it", false],
  ])(
    "an ActorInvocationError from a resolver, %s",
    async (_label, withTelemetry) => {
      const yoga = createApiYoga({
        context: ({ request }) =>
          makeContextFactory({
            verify: anonymousVerify,
            invoke: failingInvoke(),
          })(request),
        plugins: withTelemetry ? [useTelemetry()] : [],
      });

      const response = await post(
        yoga,
        `{ cellar(id: "${CELLAR_ID}") { __typename } }`,
      );
      const body = (await response.json()) as {
        errors?: { message: string; extensions?: Record<string, unknown> }[];
      };

      // The client side was already right; pinned so a logging change cannot
      // quietly unmask it.
      expect(body.errors?.[0]?.message).toBe("Unexpected error.");
      expect(JSON.stringify(body)).not.toContain(CELLAR_ID);

      expectNothingSecret();
      const lines = unexpectedErrorLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('"error.name":"ActorInvocationError"');
      expect(lines[0]).toContain('"graphql.field":"cellar"');
      if (withTelemetry) {
        // The plugin reports with the request's own id; the logger does not
        // report a second time.
        expect(lines[0]).toContain(`"request.id":"${REQUEST_ID}"`);
      }
    },
  );

  it("an unexpected throw from the context factory, outside execution", async () => {
    const yoga = createApiYoga({
      context: () => {
        throw new TypeError(
          `jwks parse failed for ${CELLAR_ID}: ${SECRET_BODY}`,
        );
      },
      plugins: [useTelemetry()],
    });

    const response = await post(yoga, "{ __typename }");
    const body = (await response.json()) as {
      errors?: { message: string }[];
    };
    expect(body.errors?.[0]?.message).toBe("Unexpected error.");

    expectNothingSecret();
    const lines = unexpectedErrorLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"error.name":"TypeError"');
    expect(lines[0]).toContain(`"request.id":"${REQUEST_ID}"`);
  });
});

/**
 * The other half of the masker: an `ActorError` is deliberate, so it keeps its
 * message and gains `code` and `reason`. `reason` is what lets a client tell
 * "already friends" from "request already sent" — both `CONFLICT` — and until
 * this test nothing held it: dropping it from `maskError` passed every suite.
 */
describe("createApiYoga: an ActorError keeps its message, code and reason", () => {
  it("through the real masker, and is not logged", async () => {
    const yoga = createApiYoga({
      context: () => {
        throw new ConflictError("you are already friends", "ALREADY_FRIENDS");
      },
      plugins: [useTelemetry()],
    });

    const response = await post(yoga, "{ __typename }");
    const body = (await response.json()) as {
      errors?: { message: string; extensions?: Record<string, unknown> }[];
    };

    expect(body.errors).toHaveLength(1);
    expect(body.errors?.[0]?.message).toBe("you are already friends");
    expect(body.errors?.[0]?.extensions).toMatchObject({
      code: "CONFLICT",
      reason: "ALREADY_FRIENDS",
    });
    // A domain answer, not a failure: nothing reported, nothing printed.
    expect(output).toEqual([]);
  });
});
