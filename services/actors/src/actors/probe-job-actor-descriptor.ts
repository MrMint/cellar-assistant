/**
 * `ProbeJobActor`'s descriptor, in a module of its own for the same reason as
 * `maintenance-actor-descriptor.ts`: the outbox allow-list builds typed handles
 * from it, and importing the actor from there would be a value cycle through
 * `../lib/outbox.ts`.
 */
import type {
  ActorDescriptor,
  InternalJobActorInterface,
} from "@cellar-assistant/contracts";
import type { ProbeJobActorInterface } from "./probe-job-actor.ts";

export const ProbeJobActorDescriptor: ActorDescriptor<
  ProbeJobActorInterface,
  InternalJobActorInterface
> = {
  actorType: "ProbeJobActor",
  category: "job",
  methods: {
    start: {},
    get: {},
    cancel: {},
    armRestartProbe: {},
  },
  internalMethods: {
    runBatch: {},
    markFailed: {},
  },
};
