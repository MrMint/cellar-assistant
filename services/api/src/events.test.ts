/**
 * The pieces of `events.ts` that are pure: the throttle and the attribute
 * sanitisers. Whether each event actually fires from the code that should
 * fire it is `telemetry-wiring.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  boundedName,
  classifySidecarFailure,
  createThrottle,
  operationNameAttribute,
} from "./events.ts";

describe("createThrottle", () => {
  const clock = () => {
    let at = 1_000_000;
    return { now: () => at, advance: (ms: number) => (at += ms) };
  };

  it("admits up to the cap in a window, then counts what it drops", () => {
    const time = clock();
    const throttle = createThrottle({
      windowMs: 60_000,
      maxPerWindow: 3,
      now: time.now,
    });

    const decisions = Array.from({ length: 5 }, () => throttle.admit("k"));

    expect(decisions.map((d) => d.admitted)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(decisions.every((d) => d.suppressedBefore === 0)).toBe(true);
  });

  it("reports the dropped count on the first event of the next window, once", () => {
    const time = clock();
    const throttle = createThrottle({
      windowMs: 60_000,
      maxPerWindow: 1,
      now: time.now,
    });
    throttle.admit("k");
    throttle.admit("k");
    throttle.admit("k");

    time.advance(59_999);
    expect(throttle.admit("k")).toEqual({
      admitted: false,
      suppressedBefore: 0,
    });
    time.advance(1);
    expect(throttle.admit("k")).toEqual({
      admitted: true,
      suppressedBefore: 3,
    });
    time.advance(60_000);
    expect(throttle.admit("k")).toEqual({
      admitted: true,
      suppressedBefore: 0,
    });
  });

  it("keeps one window per key, so a noisy class cannot starve another", () => {
    const time = clock();
    const throttle = createThrottle({
      windowMs: 60_000,
      maxPerWindow: 1,
      now: time.now,
    });
    throttle.admit("expired");
    expect(throttle.admit("expired").admitted).toBe(false);
    expect(throttle.admit("jwks_unavailable").admitted).toBe(true);
  });
});

describe("attribute sanitisers", () => {
  it.each([
    ["ActorInvocationError", "ActorInvocationError"],
    ["QUERY_TOO_DEEP", "QUERY_TOO_DEEP"],
    ["iss", "iss"],
    ["has a space", "unknown"],
    ["x".repeat(65), "unknown"],
    ["", "unknown"],
    [42, "unknown"],
    [null, "unknown"],
  ])("boundedName(%j) is %j", (value, expected) => {
    expect(boundedName(value)).toBe(expected);
  });

  it.each([
    [undefined, "anonymous"],
    [null, "anonymous"],
    ["", "anonymous"],
    ["CellarPage", "CellarPage"],
    ["_private2", "_private2"],
    ["2fast", "invalid"],
    ["drop table", "invalid"],
    ["a@b.c", "invalid"],
    [["Many"], "invalid"],
    [`A${"b".repeat(100)}`, `A${"b".repeat(63)}`],
  ])("operationNameAttribute(%j) is %j", (value, expected) => {
    expect(operationNameAttribute(value)).toBe(expected);
  });
});

describe("classifySidecarFailure", () => {
  const dapr = (message: string, errorCode = "ERR_ACTOR_INVOKE_METHOD") =>
    JSON.stringify({ errorCode, message });
  const ID = "6214d337-da10-4fc5-9b30-5ff36644168b";

  it.each([
    [
      // Measured 2026-09-28 on cellar-stack: the keep-alive race, verbatim
      // but for the id.
      "the keep-alive race (EOF)",
      dapr(
        "error invoke actor method: rpc error: code = Internal desc = error " +
          `invoke actor method: Put "http://actors:3002/actors/CellarActor/${ID}/method/get": EOF`,
      ),
      { daprErrorCode: "ERR_ACTOR_INVOKE_METHOD", cause: "app_channel_closed" },
    ],
    [
      "the keep-alive race (reset)",
      dapr(
        `error invoke actor method: Put "http://actors:3002/actors/CellarActor/${ID}/method/get": ` +
          "read tcp 172.28.0.9:46560->172.28.0.4:3002: read: connection reset by peer",
      ),
      { daprErrorCode: "ERR_ACTOR_INVOKE_METHOD", cause: "app_channel_closed" },
    ],
    [
      "the host's opaque 500",
      dapr('error from actor service: (500) {"code":"INTERNAL"}'),
      {
        daprErrorCode: "ERR_ACTOR_INVOKE_METHOD",
        cause: "app_error",
        appStatus: 500,
      },
    ],
    [
      // Measured: the allow-list's 404, as daprd reports it.
      "an undeclared method",
      dapr(
        "error invoke actor method: rpc error: code = Internal desc = error " +
          `invoke actor method: actor method not found: actors/CellarActor/${ID}/method/tx`,
      ),
      { daprErrorCode: "ERR_ACTOR_INVOKE_METHOD", cause: "method_not_found" },
    ],
    [
      // Measured: an actor type no host registered.
      "no host for the actor",
      dapr(
        "error invoke actor method: failed to lookup actor: api error: code = " +
          "FailedPrecondition desc = did not find address for actor 'NoSuchActor/x'",
      ),
      { daprErrorCode: "ERR_ACTOR_INVOKE_METHOD", cause: "placement" },
    ],
    [
      "a refused connection",
      dapr(
        'Put "http://actors:3002/…": dial tcp 172.28.0.4:3002: connect: connection refused',
      ),
      { daprErrorCode: "ERR_ACTOR_INVOKE_METHOD", cause: "app_unreachable" },
    ],
    [
      "an expired deadline",
      dapr("context deadline exceeded"),
      { daprErrorCode: "ERR_ACTOR_INVOKE_METHOD", cause: "deadline" },
    ],
    [
      // Measured: daprd refusing a 5 MiB body itself.
      "daprd's own refusal",
      dapr(
        "invalid request: failed to read body: stream too large",
        "ERR_BAD_REQUEST",
      ),
      { daprErrorCode: "ERR_BAD_REQUEST", cause: "unrecognised" },
    ],
    [
      "a body that is not daprd's",
      "upstream exploded",
      { daprErrorCode: "none", cause: "unrecognised" },
    ],
    [
      "an error code that is not a Dapr constant",
      dapr("EOF", `ERR_${ID}`),
      { daprErrorCode: "invalid", cause: "unrecognised" },
    ],
  ] as const)("%s", (_label, body, expected) => {
    expect(classifySidecarFailure(body)).toEqual(expected);
  });

  it("returns nothing from the body but constants and a status", () => {
    const leaked = JSON.stringify(
      classifySidecarFailure(
        dapr(`error from actor service: (500) ${ID} SELECT * FROM cellars`),
      ),
    );
    expect(leaked).not.toContain(ID);
    expect(leaked).not.toContain("SELECT");
  });
});
