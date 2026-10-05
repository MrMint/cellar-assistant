/**
 * The typed client for one actor calling another — §8.5's sanctioned
 * synchronous edges (entity → `BudgetActor`, registry → entity, job →
 * entity/search, …) — built from the same descriptors `services/api` uses.
 *
 * ```ts
 * const hits = await internal(ctx)(ItemSearchActorDescriptor, id).all(input);
 * ```
 *
 * ## What it replaced
 *
 * Every such call used to be `invokeActorMethod("BarcodeActor", code,
 * "ensure", [ctx, { type }], 15_000) as { code: string }` — ~29 sites, each
 * naming its actor and method as strings, restating a timeout, and casting the
 * `unknown` back to whatever it hoped the method returned. Nothing checked any
 * of it: a renamed method, a changed argument or a changed result type
 * compiled everywhere. Here the method and its arguments are checked against
 * the descriptor's interfaces (public **and** internal — this is the one
 * client that may name `BudgetActor.reserveForModel`), the result type is the
 * method's own, and the timeout is the method's `timeoutMs` from the
 * descriptor, which the API reads too.
 *
 * ## `ctx` is bound once, and may be `system`
 *
 * Unlike the API's `makeActorClient`, this does not refuse a `system` ctx:
 * `OutboxActor` and the job actors construct one (§1.6), and the calls they
 * make on its behalf are exactly what it exists for. What this cannot do is
 * *mint* one — it forwards the ctx the calling turn already holds.
 *
 * ## `ctx.delivery` does not cross
 *
 * Every call carries {@link forwardCtx}`(ctx)`: the caller's ctx minus
 * `delivery`. A delivery that calls another actor is not lending that actor
 * its identity — the callee did not get delivered, and deriving a key from
 * the caller's outbox row is how one delivery's ten calls all came to share
 * one key. A callee that needs a key stable across redeliveries is handed one
 * explicitly, derived by the caller with `idempotencyKey`. `causedBy`
 * (attribution) does cross. See `./delivery.ts`.
 *
 * ## Still a seam
 *
 * Each actor keeps its injectable function type (`PlaceCreator`,
 * `BudgetReserver`, …) with a `dapr*` default built on this client, because
 * the no-sidecar test harness substitutes an in-process fake there. Those
 * defaults are now one line each.
 */
import {
  type ActorDescriptor,
  type ActorInterface,
  type ActorProxy,
  actorMethodTimeout,
  actorProxy,
  type Ctx,
  type RawActorInvoker,
} from "@cellar-assistant/contracts";
import { forwardCtx } from "./delivery.ts";
import { invokeActorMethod } from "./sidecar.ts";

export type InternalActorClient = <
  TInterface extends ActorInterface,
  TInternal extends ActorInterface,
>(
  descriptor: ActorDescriptor<TInterface, TInternal>,
  actorId: string,
) => ActorProxy<TInterface & TInternal>;

/** Through this host's own sidecar, bounded by the method's own timeout. */
const viaSidecar: RawActorInvoker = (descriptor, actorId, method, args) =>
  invokeActorMethod(
    descriptor.actorType,
    actorId,
    method,
    args,
    actorMethodTimeout(descriptor, method),
  );

export const internal =
  (ctx: Ctx): InternalActorClient =>
  <TInterface extends ActorInterface, TInternal extends ActorInterface>(
    descriptor: ActorDescriptor<TInterface, TInternal>,
    actorId: string,
  ): ActorProxy<TInterface & TInternal> =>
    actorProxy<TInterface & TInternal>(
      viaSidecar,
      forwardCtx(ctx),
      descriptor,
      actorId,
    );
