/**
 * The A2 smoke actor, reached the way every other actor is reached.
 *
 * `Query.ping` is the plain form; `Mutation.ping` is the template for §8.3's
 * "mutations return `<Command>Result` unions via `plugin-errors`". Both go away
 * with `PingActor` once a real aggregate lands (B1) — copy the shape, not the
 * subject.
 *
 * ## Why there is an authorisation check on a smoke test
 *
 * Both fields used to take an arbitrary `actorId` from **any** caller, with no
 * `ctx` check of any kind. An unauthenticated request could therefore name a
 * fresh activation key on every call, and each one costs a real `PingActor`
 * activation held for Dapr's ten-minute idle timeout — an anonymous handle on
 * the placement table, reachable from the open internet. Aliasing made it
 * worse: one document could mint hundreds at once.
 *
 * So the activation a caller may address is now bounded by who they are.
 * Anonymous callers are refused outright; a signed-in user always lands on the
 * single {@link SMOKE_ACTIVATION} key, so the whole non-admin population shares
 * **one** activation no matter how many requests they send; and only an `admin`
 * ctx — a better-auth role claim, not something a plain token can assert — may
 * name a different one, which is the case the argument exists to serve.
 *
 * The argument keeps its place in the schema rather than being removed, and
 * that is a deliberately small blast radius rather than a judgement that it
 * belongs there: dropping `actorId`, or the whole field, moves
 * `packages/schema/schema.graphql`, `packages/schema/graphql-env.d.ts` and the
 * client's generated graphcache schema with it. **Deleting both fields is still
 * the right end state** — this module and `PingActor` have each carried a note
 * saying so since B1 landed, and no client document selects either one.
 */
import type { PingResult } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  isAdmin,
  PingActorDescriptor,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { builder } from "./builder.ts";

/**
 * The one activation every non-admin caller shares. Its name is the value the
 * field already defaulted to, so an authorised caller sees no change.
 */
export const SMOKE_ACTIVATION = "smoke";

/**
 * Resolves the activation key a caller is allowed to address.
 *
 * Throws `ForbiddenError` rather than returning a default silently: a smoke
 * probe that quietly answers about a *different* activation than the one it
 * named would make the turn counter — the whole point of the field — a lie.
 */
export const activationFor = (
  context: ApiContext,
  requested: string | null | undefined,
): string => {
  if (context.ctx.viewerId === null) {
    throw new ForbiddenError("sign in to reach PingActor");
  }
  if (requested === null || requested === undefined) {
    return SMOKE_ACTIVATION;
  }
  if (requested === SMOKE_ACTIVATION || isAdmin(context.ctx)) {
    return requested;
  }
  throw new ForbiddenError(
    `naming a PingActor activation is admin only; "${SMOKE_ACTIVATION}" is the ` +
      "activation every other caller shares. Omit actorId.",
  );
};

const Pong = builder.objectRef<PingResult>("Pong").implement({
  description: "A round trip through the Dapr sidecar into an actor turn.",
  fields: (t) => ({
    pong: t.exposeBoolean("pong"),
    message: t.exposeString("message"),
    actorId: t.exposeID("actorId"),
    at: t.expose("at", { type: "DateTime" }),
    turns: t.exposeInt("turns", {
      description: "Turns served by this activation; >1 proves it was reused.",
    }),
  }),
});

builder.queryField("ping", (t) =>
  t.field({
    type: Pong,
    description:
      "Invokes PingActor through the sidecar. Proves api -> sidecar -> placement -> actor host.",
    args: {
      actorId: t.arg.string({ required: false }),
      message: t.arg.string({ required: false }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(PingActorDescriptor, activationFor(context, args.actorId))
        .ping(args.message ?? "ping"),
  }),
);

builder.mutationField("ping", (t) =>
  t.field({
    type: Pong,
    description:
      "The `<Command>Result` template (§8.3): the payload, or one of the five typed errors.",
    // `errors: {}` takes the five default types configured on the builder and
    // generates `union PingResult = Pong | NotFoundError | ...`.
    errors: {},
    args: {
      actorId: t.arg.string({ required: false }),
      message: t.arg.string({ required: false }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(PingActorDescriptor, activationFor(context, args.actorId))
        .ping(args.message ?? "ping"),
  }),
);
