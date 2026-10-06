/**
 * Test wiring: a schema executed against a stub sidecar.
 *
 * `execute` from `graphql` is used rather than an HTTP round trip so the tests
 * stay fast; `src/e2e.test.ts` covers the real yoga + sidecar path when the
 * compose stack is up.
 */
import type {
  ActorDescriptor,
  ActorInterface,
  ActorInvoker,
} from "@cellar-assistant/contracts";
import { anonymousCtx, makeActorClient } from "@cellar-assistant/contracts";
import type { ViewerClaims } from "./auth/jwt.ts";
import type { ApiContext } from "./context.ts";

export type RecordedCall = {
  actorType: string;
  actorId: string;
  method: string;
  args: unknown[];
};

/**
 * A stub sidecar: records every invocation and answers from a lookup table
 * keyed `ActorType.method`. The handler is given the actor id first, because
 * for an entity actor the id *is* the argument (`ItemActor("wine:…").get()`).
 */
export const stubSidecar = (
  handlers: Record<string, (actorId: string, ...args: unknown[]) => unknown>,
) => {
  const calls: RecordedCall[] = [];
  const invoke = (async (
    descriptor: ActorDescriptor<ActorInterface>,
    actorId: string,
    method: string,
    ...args: unknown[]
  ) => {
    calls.push({ actorType: descriptor.actorType, actorId, method, args });
    const handler = handlers[`${descriptor.actorType}.${method}`];
    if (handler === undefined) {
      throw new Error(`no stub for ${descriptor.actorType}.${method}`);
    }
    return handler(actorId, ...args);
  }) as unknown as ActorInvoker;
  return { invoke, calls };
};

export const testContext = (
  invoke: ActorInvoker,
  viewer: ViewerClaims | null = null,
): ApiContext => {
  const ctx =
    viewer === null
      ? anonymousCtx("req-test")
      : {
          viewerId: viewer.id,
          kind:
            viewer.role === "admin" ? ("admin" as const) : ("user" as const),
          requestId: "req-test",
        };
  return { ctx, viewer, actor: makeActorClient(invoke, ctx) };
};
