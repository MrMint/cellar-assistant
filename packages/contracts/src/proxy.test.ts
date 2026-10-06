import { describe, expect, it, vi } from "vitest";
import type { ActorInvoker } from "./actors.ts";
import { PingActorDescriptor } from "./actors.ts";
import { adminCtx, anonymousCtx, systemCtx, userCtx } from "./ctx.ts";
import { assertNotSystemCtx, makeActorClient } from "./proxy.ts";

const recordingInvoker = () => {
  const calls: unknown[][] = [];
  const invoke = vi.fn(async (...args: unknown[]) => {
    calls.push(args);
    return { pong: true } as never;
  }) as unknown as ActorInvoker;
  return { invoke, calls };
};

describe("makeActorClient", () => {
  it("binds ctx as the first argument of every call (§8.2)", async () => {
    const { invoke, calls } = recordingInvoker();
    const ctx = userCtx("user-1", "req-9");
    const actor = makeActorClient(invoke, ctx);

    await actor(PingActorDescriptor, "smoke").ping("hello");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([
      PingActorDescriptor,
      "smoke",
      "ping",
      ctx,
      "hello",
    ]);
  });

  it("works for an anonymous and an admin viewer", async () => {
    const { invoke, calls } = recordingInvoker();
    await makeActorClient(invoke, anonymousCtx("r"))(
      PingActorDescriptor,
      "a",
    ).ping("x");
    await makeActorClient(invoke, adminCtx("u", "r"))(
      PingActorDescriptor,
      "b",
    ).ping("y");
    expect(calls.map((call) => (call[3] as { kind: string }).kind)).toEqual([
      "user",
      "admin",
    ]);
  });

  it("refuses to build a request client for a system ctx (§1.6)", () => {
    const { invoke } = recordingInvoker();
    expect(() => makeActorClient(invoke, systemCtx("req-1"))).toThrow(
      /may never act as ctx.kind='system'/,
    );
    expect(() => assertNotSystemCtx(systemCtx("req-1"))).toThrow();
    expect(() => assertNotSystemCtx(userCtx("u", "r"))).not.toThrow();
  });

  it("is not a thenable: awaiting the proxy itself does not hang", async () => {
    const { invoke } = recordingInvoker();
    const proxy = makeActorClient(invoke, userCtx("u", "r"))(
      PingActorDescriptor,
      "smoke",
    );
    await expect(Promise.resolve(proxy)).resolves.toBe(proxy);
  });
});
