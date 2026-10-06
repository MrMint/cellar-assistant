/**
 * `boot()` does what `index.ts` used to do by hand, and does all of it.
 *
 * Behavioural, against a fake server and a fake sidecar, with the real
 * registry. The two defects this exists to keep fixed were both a line that
 * was not there: `MaintenanceActor` registered and never armed (nine days of
 * an alarm reading "all clear" because it was off), and a seam never
 * installed (AI place review dark behind a green suite). The old guards could
 * only parse `index.ts` for the calls; these run them.
 */
import type { ActorId, DaprClient } from "@dapr/dapr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTOR_REGISTRY, type RegistryEntry } from "./actors/registry.ts";
import type { ReminderSpec } from "./lib/sidecar.ts";

const log: string[] = [];
const events: { name: string; severity: string; message: string }[] = [];

vi.mock("./lib/ai/install.ts", () => ({
  installAI: vi.fn(() => {
    log.push("installAI");
  }),
}));
vi.mock("./lib/overture.ts", () => ({
  installOverture: vi.fn(() => {
    log.push("installOverture");
  }),
}));
vi.mock("./lib/telemetry.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/telemetry.ts")>()),
  emit: vi.fn((event: { name: string; severity: string; message: string }) => {
    events.push(event);
  }),
}));

const { boot } = await import("./boot.ts");
const { installAI } = await import("./lib/ai/install.ts");

type ActorClass = RegistryEntry["actorClass"];
type Armed = {
  readonly actorType: string;
  readonly actorId: string;
  readonly name: string;
  readonly spec: ReminderSpec;
};

const fakeServer = () => {
  const registered: ActorClass[] = [];
  return {
    registered,
    actor: {
      registerActor: vi.fn(async (actorClass: ActorClass) => {
        log.push(`register:${actorClass.name}`);
        registered.push(actorClass);
      }),
      getRegisteredActors: vi.fn(async () =>
        registered.map((actorClass) => actorClass.name),
      ),
    },
    start: vi.fn(async () => {
      log.push("start");
    }),
  };
};

/** A sidecar whose first `failures` reminder registrations are refused. */
const fakeSidecar = (failures = 0) => {
  const armed: Armed[] = [];
  let refused = 0;
  return {
    armed,
    attempts: () => armed.length + refused,
    registerReminder: vi.fn(
      async (
        actorType: string,
        actorId: string,
        name: string,
        spec: ReminderSpec,
      ) => {
        if (refused < failures) {
          refused += 1;
          throw new Error("actor runtime not ready");
        }
        log.push(`arm:${actorType}`);
        armed.push({ actorType, actorId, name, spec });
      },
    ),
  };
};

const FAST = { attempts: 3, waitMs: 0 };

beforeEach(() => {
  log.length = 0;
  events.length = 0;
  vi.mocked(installAI).mockImplementation(() => {
    log.push("installAI");
    return { installed: false, reason: "test" };
  });
});

describe("boot()", () => {
  it("installs AI and Overture, registers every actor once in order, then starts", async () => {
    const server = fakeServer();
    const { registered, keepAlives } = await boot(server, fakeSidecar(), {
      retry: FAST,
    });
    await keepAlives;

    const beforeArming = log.filter((line) => !line.startsWith("arm:"));
    expect(beforeArming).toEqual([
      "installAI",
      "installOverture",
      ...ACTOR_REGISTRY.map(({ actorClass }) => `register:${actorClass.name}`),
      "start",
    ]);
    expect(registered).toEqual(
      ACTOR_REGISTRY.map(({ actorClass }) => actorClass.name),
    );
  });

  it("arms the outbox drain and the maintenance watchdog, after the server starts", async () => {
    const sidecar = fakeSidecar();
    const { keepAlives } = await boot(fakeServer(), sidecar, { retry: FAST });

    expect(await keepAlives).toEqual([
      { actorType: "OutboxActor", reminder: "drain", armed: true },
      { actorType: "MaintenanceActor", reminder: "maintenance", armed: true },
    ]);
    // Named individually, not derived from the registry: the defect was a
    // keep-alive nobody declared, and a derived expectation would shrink
    // along with the registry.
    expect(sidecar.armed).toEqual([
      {
        actorType: "OutboxActor",
        actorId: "singleton",
        name: "drain",
        spec: { dueTime: "2s", period: "2s" },
      },
      {
        actorType: "MaintenanceActor",
        actorId: "singleton",
        name: "maintenance",
        spec: { dueTime: "30s", period: "1h" },
      },
    ]);
    expect(log.indexOf("start")).toBeLessThan(log.indexOf("arm:OutboxActor"));
    expect(events.map((event) => event.name).sort()).toEqual([
      "maintenance.reminder_armed",
      "outbox.reminder_armed",
    ]);
  });

  it("keeps retrying a sidecar that is not ready yet", async () => {
    // Two refusals, spread across the two keep-alives' first attempts.
    const sidecar = fakeSidecar(2);
    const { keepAlives } = await boot(fakeServer(), sidecar, { retry: FAST });

    expect((await keepAlives).every((outcome) => outcome.armed)).toBe(true);
    expect(sidecar.attempts()).toBe(4);
    expect(events.map((event) => event.message).join("\n")).toMatch(
      /\(attempt 2\)/,
    );
  });

  it("gives up without rejecting, and says so at ERROR under the alerted name", async () => {
    const sidecar = fakeSidecar(Number.POSITIVE_INFINITY);
    const { keepAlives } = await boot(fakeServer(), sidecar, { retry: FAST });

    expect(await keepAlives).toEqual([
      { actorType: "OutboxActor", reminder: "drain", armed: false },
      { actorType: "MaintenanceActor", reminder: "maintenance", armed: false },
    ]);
    // Three attempts each, and no more.
    expect(sidecar.attempts()).toBe(6);
    const failed = events.filter((event) => event.severity === "ERROR");
    expect(failed.map((event) => event.name).sort()).toEqual([
      "maintenance.reminder_failed",
      "outbox.reminder_failed",
    ]);
    expect(
      failed.find((event) => event.name === "outbox.reminder_failed")?.message,
    ).toBe(
      "could not arm the drain reminder; the outbox will not drain: " +
        "actor runtime not ready",
    );
  });

  it("registers nothing and never starts when the AI configuration is incomplete", async () => {
    vi.mocked(installAI).mockImplementation(() => {
      throw new Error("AI_PROVIDER=gemini but GEMINI_API_KEY is unset");
    });
    const server = fakeServer();
    const sidecar = fakeSidecar();

    await expect(boot(server, sidecar, { retry: FAST })).rejects.toThrow(
      /GEMINI_API_KEY/,
    );
    expect(server.actor.registerActor).not.toHaveBeenCalled();
    expect(server.start).not.toHaveBeenCalled();
    expect(sidecar.registerReminder).not.toHaveBeenCalled();
  });

  it("hands Dapr classes it can construct the way Dapr does", () => {
    // `new Cls(daprClient, actorId)` and nothing else: every other constructor
    // parameter is a defaulted seam. A required third parameter would compile
    // against `RegistryEntry` only by accident, so check the arity.
    for (const { actorClass } of ACTOR_REGISTRY) {
      const construct: new (client: DaprClient, id: ActorId) => unknown =
        actorClass;
      expect(construct.length, actorClass.name).toBeLessThanOrEqual(2);
    }
  });
});
