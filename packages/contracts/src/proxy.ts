/**
 * Typed actor proxies (migration plan A7).
 *
 * A resolver never builds a URL, never names a method as a string, and never
 * passes `ctx` by hand:
 *
 * ```ts
 * resolve: (_root, args, context) =>
 *   context.actor(CellarActorDescriptor, args.cellarId).get(),
 * ```
 *
 * `context.actor(...)` returns a proxy whose methods are the actor interface's
 * methods **minus their leading `Ctx`** (§8.2). The `Ctx` is bound once, when
 * the request context is built from the verified JWT, so a resolver cannot
 * forget it, cannot reorder it, and cannot forge one.
 *
 * The transport underneath is `services/api/src/dapr.ts` — an HTTP call to the
 * sidecar's actor endpoint with the arguments as a JSON array. `services/api`
 * deliberately does not use `@dapr/dapr`'s actor proxy. Not because it needs
 * the concrete actor class (it reads only `.name`: 3.18.0,
 * `actors/client/ActorProxyBuilder.js:34`), but because at 3.18.0 a typed
 * actor error resolves as a success, a call takes no timeout, and `await`ing
 * the proxy calls a remote `then` — `docs/architecture/dapr-sdk-gaps.md` G1–G3.
 * The proxy below is ours: its errors come from the transport, which throws
 * them, the transport takes the descriptor's timeout, and `then` (with
 * `catch`, `finally`, `constructor`) is never trapped (`NON_METHODS`).
 */
import type {
  ActorDescriptor,
  ActorInterface,
  ActorInvoker,
  AnyActorDescriptor,
} from "./actors.ts";
import type { Ctx } from "./ctx.ts";

/** Drops the leading `Ctx` parameter an actor method declares. */
export type WithoutCtx<TArgs extends readonly unknown[]> =
  TArgs extends readonly [Ctx, ...infer TRest] ? TRest : never;

export type ActorProxy<TInterface extends ActorInterface> = {
  readonly [TMethod in keyof TInterface & string]: (
    ...args: WithoutCtx<Parameters<TInterface[TMethod]>>
  ) => Promise<Awaited<ReturnType<TInterface[TMethod]>>>;
};

/** What a resolver is handed on the GraphQL context. */
export type ActorClient = <TInterface extends ActorInterface>(
  descriptor: ActorDescriptor<TInterface>,
  actorId: string,
) => ActorProxy<TInterface>;

/**
 * §1.6: "`ctx.kind === 'system'` … is not derivable from a request."
 *
 * Enforced twice over. The JWT path cannot produce `system` (A6's
 * `definePayload` collapses the `role` claim to `admin` | `user`, and
 * `ctxFromClaims` maps anything that is not exactly `admin` to `user`), and
 * this assertion refuses to build a request-scoped actor client from a system
 * ctx even if some future code path manages to construct one.
 */
export const assertNotSystemCtx = (ctx: Ctx): void => {
  if (ctx.kind === "system") {
    throw new Error(
      "a request may never act as ctx.kind='system' (plan §1.6); " +
        "only OutboxActor and job actors construct a system ctx",
    );
  }
};

/**
 * Method names that must not be trapped: `await proxy` would otherwise see a
 * callable `then` and hang forever trying to resolve a thenable.
 */
const NON_METHODS = new Set(["then", "catch", "finally", "constructor"]);

/**
 * What a proxy hands its transport: the descriptor (for the actor type and
 * the method's metadata), the id, the method name, and the arguments with
 * `ctx` already first.
 */
export type RawActorInvoker = (
  descriptor: AnyActorDescriptor,
  actorId: string,
  method: string,
  args: readonly unknown[],
) => Promise<unknown>;

/**
 * A typed proxy over one actor, with `ctx` bound. Both clients are built on
 * this: the API's request-scoped {@link makeActorClient}, and the actor
 * host's own `internal(ctx)` (`services/actors/src/lib/internal-client.ts`),
 * which types its proxies over the descriptor's internal interface too.
 *
 * The one unavoidable hole is here and not at the call sites: TypeScript
 * cannot prove that `[ctx, ...args]` reconstructs the method's parameters, or
 * that the transport's `unknown` is its result, for an unresolved generic. The
 * {@link ActorProxy} mapped type is what makes each *call site* type-safe,
 * which is where it matters.
 */
export const actorProxy = <TInterface extends ActorInterface>(
  invoke: RawActorInvoker,
  ctx: Ctx,
  descriptor: AnyActorDescriptor,
  actorId: string,
): ActorProxy<TInterface> =>
  new Proxy({} as ActorProxy<TInterface>, {
    get: (_target, property) => {
      if (typeof property !== "string" || NON_METHODS.has(property)) {
        return undefined;
      }
      return (...args: readonly unknown[]) =>
        invoke(descriptor, actorId, property, [ctx, ...args]);
    },
  });

/**
 * Builds the request-scoped actor client. Called once per request, after the
 * JWT has been verified.
 */
export const makeActorClient = (
  invoke: ActorInvoker,
  ctx: Ctx,
): ActorClient => {
  assertNotSystemCtx(ctx);

  // `ActorInvoker` takes the arguments spread, with `ctx` among them; the
  // cast is the same unprovable reconstruction `actorProxy` documents.
  const raw: RawActorInvoker = (descriptor, actorId, method, args) =>
    invoke(
      descriptor as ActorDescriptor<ActorInterface>,
      actorId,
      method,
      ...(args as Parameters<ActorInterface[string]>),
    );

  return <TInterface extends ActorInterface>(
    descriptor: ActorDescriptor<TInterface>,
    actorId: string,
  ): ActorProxy<TInterface> =>
    actorProxy<TInterface>(raw, ctx, descriptor, actorId);
};
