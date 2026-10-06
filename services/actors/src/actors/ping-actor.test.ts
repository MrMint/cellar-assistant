import { userCtx } from "@cellar-assistant/contracts";
import { ActorId, DaprClient } from "@dapr/dapr";
import { beforeEach, describe, expect, it } from "vitest";
import { PingActor } from "./ping-actor.ts";

/**
 * Precursor to the A4 in-memory harness: actors are plain classes, so they can
 * be driven without Dapr, without a sidecar and without a database.
 */
const newActor = (id: string): PingActor =>
  // The DaprClient constructor opens no connection; nothing here reaches a
  // sidecar because PingActor never touches the state manager.
  new PingActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(id),
  );

describe("PingActor", () => {
  let actor: PingActor;

  beforeEach(async () => {
    actor = newActor("smoke-1");
    await actor.onActivate();
  });

  it("is a reference actor per §8.3", () => {
    expect(PingActor.category).toBe("reference");
    expect(PingActor.name).toBe("PingActor");
  });

  it("echoes the message and reports its own id", async () => {
    const result = await actor.ping(userCtx("viewer-1", "req-abc"), "hello");
    expect(result.pong).toBe(true);
    expect(result.actorId).toBe("smoke-1");
    expect(result.message).toContain("hello");
    expect(result.message).toContain("req-abc");
    expect(Date.parse(result.at)).not.toBeNaN();
  });

  it("counts turns within one activation", async () => {
    const ctx = userCtx("viewer-1", "req-abc");
    expect((await actor.ping(ctx, "a")).turns).toBe(1);
    expect((await actor.ping(ctx, "b")).turns).toBe(2);
  });

  it("resets turn state on re-activation", async () => {
    await actor.ping(userCtx("viewer-1", "r1"), "a");
    await actor.onActivate();
    expect((await actor.ping(userCtx("viewer-1", "r2"), "b")).turns).toBe(1);
  });

  it("keeps per-actor-id state separate", async () => {
    const other = newActor("smoke-2");
    await other.onActivate();
    await actor.ping(userCtx("v", "r"), "a");
    const result = await other.ping(userCtx("v", "r"), "a");
    expect(result.actorId).toBe("smoke-2");
    expect(result.turns).toBe(1);
  });

  // TODO(A4): the single-writer test (§1.2) and the static import-graph test
  // (§8.5) live in this app once real actors exist.
});
