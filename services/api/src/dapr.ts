import type {
  ActorDescriptor,
  ActorInterface,
  ActorInvoker,
} from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  invokeActorOverSidecar,
  isActorError,
  SidecarError,
} from "@cellar-assistant/contracts";
import { config } from "./config.ts";
import { reportActorInvocationFailed } from "./events.ts";

/**
 * The API's only way to reach the domain: an actor invocation through its own
 * Dapr sidecar.
 *
 * This talks to the sidecar's HTTP API through the transport both sides share
 * (`invokeActorOverSidecar` in `@cellar-assistant/contracts`) rather than
 * through `@dapr/dapr`'s actor client. Not because that client needs the
 * concrete actor class — it does not; `ActorProxyBuilder` reads only the
 * class's `.name` (`@dapr/dapr` 3.18.0, `actors/client/ActorProxyBuilder.js:34`;
 * docs/architecture/dapr-sdk-gaps.md G14). It is that, at 3.18.0, a typed
 * actor error resolves as a *successful* value (G1), a call cannot be given a
 * timeout (G2) — and this module's whole job is the per-method timeout —
 * `await proxy` calls a remote method named `then` (G3), and every builder
 * waits on sidecar health again (G4). What this module adds is the API's own:
 * the timeout, the failure telemetry, and the opaque `ActorInvocationError`.
 *
 * Resolvers do not call this directly — they call the typed proxies in
 * `@cellar-assistant/contracts` (`context.actor(...)`), which bind `ctx`.
 */
const sidecarBase = `http://${config.daprHost}:${config.daprPort}/v1.0`;

/**
 * How long this hop waits for `descriptor.method`: the method's own
 * `timeoutMs` from its descriptor, or `DEFAULT_ACTOR_TIMEOUT_MS` (15s).
 *
 * §8.5: "Anything over a few seconds is outbox-driven, not request-driven. The
 * exceptions are `ItemOnboardingActor.start` and `PlaceCreationActor` (the user
 * is waiting on an AI result); set the API's actor-invocation timeout to 120s
 * for those calls." Those two are declared on their descriptors in
 * `@cellar-assistant/contracts`, beside every other method's bound, and the
 * actor host's own client reads the same table — so the API and an actor
 * calling the same method wait the same time.
 *
 * This used to be a local `LONG_RUNNING` set of `"Actor.method"` strings, and
 * it held `"PlaceCreationActor.create"` for a method called `createPlace`:
 * from `4e067928` on, the one call §8.5 sanctions as slow got the 15s default,
 * the API gave up on a synchronous AI review while the actor went on to commit
 * the place, and the user was told it failed. The method table is keyed by the
 * interface, so a misspelled key does not compile, and this function's
 * `method` is typed the same way (`dapr.test.ts` holds a `@ts-expect-error`).
 */
export const timeoutFor = <
  TInterface extends ActorInterface,
  TInternal extends ActorInterface,
>(
  descriptor: ActorDescriptor<TInterface, TInternal>,
  method: keyof (TInterface & TInternal) & string,
): number => actorMethodTimeout(descriptor, method);

export class ActorInvocationError extends Error {
  readonly actorType: string;
  readonly actorId: string;
  readonly method: string;
  readonly status: number;

  constructor(
    actorType: string,
    actorId: string,
    method: string,
    status: number,
    body: string,
  ) {
    super(`${actorType}/${actorId}.${method} failed (${status}): ${body}`);
    this.name = "ActorInvocationError";
    this.actorType = actorType;
    this.actorId = actorId;
    this.method = method;
    this.status = status;
  }
}

/**
 * `ctx.requestId`, read off the first argument. `makeActorClient` always puts
 * `ctx` there, but this function's signature does not promise it, so it is
 * checked rather than assumed.
 */
const requestIdOf = (first: unknown): string => {
  const requestId = (first as { requestId?: unknown } | null)?.requestId;
  return typeof requestId === "string" ? requestId : "unknown";
};

/** `AbortSignal.timeout` rejects with a `TimeoutError` DOMException. */
const isTimeout = (cause: unknown): boolean => {
  const name = (cause as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
};

export const invokeActor: ActorInvoker = async <
  TInterface extends ActorInterface,
  TMethod extends keyof TInterface & string,
>(
  descriptor: ActorDescriptor<TInterface>,
  actorId: string,
  method: TMethod,
  ...args: Parameters<TInterface[TMethod]>
): Promise<Awaited<ReturnType<TInterface[TMethod]>>> => {
  const failure = (
    kind: "status" | "timeout" | "network",
    status?: number,
    body?: string,
  ): void =>
    reportActorInvocationFailed({
      requestId: requestIdOf((args as readonly unknown[])[0]),
      actorType: descriptor.actorType,
      method,
      kind,
      status,
      body,
    });

  try {
    // The shared transport (`@cellar-assistant/contracts`, `invocation.ts`):
    // one URL builder and one response rule for this hop and the actors' own.
    // It reads `DAPR_ERROR_RESPONSE_HEADER` before the status (A7b — a `200`
    // carrying it is a failure), and a `void` method's literal `undefined`
    // body as `undefined` rather than a `SyntaxError` (which once reported a
    // committed `FileActor.delete` as failed).
    return (await invokeActorOverSidecar({
      baseUrl: sidecarBase,
      actorType: descriptor.actorType,
      actorId,
      method,
      args,
      timeoutMs: timeoutFor(descriptor, method),
      apiToken: config.daprApiToken,
    })) as Awaited<ReturnType<TInterface[TMethod]>>;
  } catch (cause) {
    // A typed actor error (`{ code, message }`) is re-raised as itself so that
    // `plugin-errors` can map it onto the field's `<Command>Result` union.
    if (isActorError(cause)) throw cause;
    // Anything else that came back is an infrastructure failure and stays
    // opaque.
    if (cause instanceof SidecarError) {
      failure("status", cause.status, cause.body);
      throw new ActorInvocationError(
        descriptor.actorType,
        actorId,
        method,
        cause.status,
        cause.body,
      );
    }
    // Never reached the actor, or never heard back. Rethrown untouched: the
    // masker turns it into "Unexpected error." and `graphql.unexpected_error`
    // records it again from the GraphQL side, under the same request id.
    failure(isTimeout(cause) ? "timeout" : "network");
    throw cause;
  }
};
