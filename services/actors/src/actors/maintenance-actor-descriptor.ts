/**
 * `MaintenanceActor`'s descriptor, in a module of its own so the outbox
 * allow-list (`../lib/outbox-targets.ts`) can build typed handles from it
 * without importing the actor — which imports `../lib/outbox.ts`, which imports
 * the allow-list: a value cycle that would leave this `const` uninitialised
 * for whichever module loaded first. Everything here is a literal, and the
 * interface is a type-only import, so nothing here reaches back.
 */
import type { ActorDescriptor } from "@cellar-assistant/contracts";
import type { MaintenanceActorInterface } from "./maintenance-actor.ts";

/** Dapr actor type name — the class name `src/actors/registry.ts` registers. */
export const MAINTENANCE_ACTOR_TYPE = "MaintenanceActor";

/** `job`: an unbounded scheduled singleton (§2.6), not a `JobActor` chain. */
export const MaintenanceActorDescriptor: ActorDescriptor<MaintenanceActorInterface> =
  {
    actorType: MAINTENANCE_ACTOR_TYPE,
    category: "job",
    methods: {
      reapOrphanFiles: {},
      reportDeadLetters: {},
      acknowledgeDeadLetters: {},
    },
  };
