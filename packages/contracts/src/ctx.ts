/**
 * `Ctx` is the first argument of every actor method (migration plan §8.2).
 *
 * Resolvers never decide visibility; they build a `Ctx` from the verified JWT
 * and pass it through. `system` is constructed only by `OutboxActor` and job
 * actors. `admin` comes from a better-auth role claim.
 */
export type CtxKind = "user" | "admin" | "system";

/**
 * Which outbox delivery a turn **is** — minted by `OutboxActor` alone
 * (`deliveryArgs` in `services/actors/src/actors/outbox-actor.ts`), on the
 * `system` ctx it invokes a row's target with, and never forwarded: the actor
 * host's typed client strips it from every onward call
 * (`services/actors/src/lib/delivery.ts`, `forwardCtx`), so a delivery that
 * calls another actor does not lend that actor its identity.
 *
 * It replaced reading "am I a delivery, and which one" out of an
 * `outbox:<uuid>` prefix on `requestId` — a correlation string that also
 * travelled to every actor the delivery called, and that a request once got to
 * choose.
 */
export type Delivery = {
  /** The `outbox.id` being delivered. */
  readonly outboxId: string;
  /** This attempt's number, from 1. */
  readonly attempt: number;
  /**
   * If this attempt fails, the outbox will not try again: a retryable failure
   * now dead-letters the row (`attempt` is the last one the drainer allows).
   * A permanent failure is final on any attempt, which this cannot know.
   */
  readonly final: boolean;
};

export type Ctx = {
  viewerId: string | null;
  kind: CtxKind;
  /**
   * Correlation only — logs, traces, and nothing else. No actor may derive an
   * identity or an idempotency key from it (`services/actors` enforces that
   * by scan); a delivery's identity is {@link Ctx.delivery}.
   */
  requestId: string;
  /**
   * Present only on the `system` ctx `OutboxActor` delivers with. See
   * {@link Delivery}. The wire boundary refuses it on any other kind.
   */
  readonly delivery?: Delivery;
  /**
   * The `outbox.id` whose delivery this turn descends from — the row being
   * delivered, or, on a call a delivery made, the row that call descends
   * from. **Attribution only** (whose action an outbox-driven spend is
   * booked to); never authority and never an idempotency key. Unlike
   * `delivery` it survives forwarding, because "who caused this spend" is a
   * property of the whole chain. `system` ctx only.
   */
  readonly causedBy?: string;
};

/** An anonymous (unauthenticated) request context. */
export const anonymousCtx = (requestId: string): Ctx => ({
  viewerId: null,
  kind: "user",
  requestId,
});

/** A signed-in user's request context. */
export const userCtx = (viewerId: string, requestId: string): Ctx => ({
  viewerId,
  kind: "user",
  requestId,
});

/**
 * An administrator's request context. `admin` comes from a better-auth role
 * claim; it is not derivable from a plain user's token.
 */
export const adminCtx = (viewerId: string, requestId: string): Ctx => ({
  viewerId,
  kind: "admin",
  requestId,
});

/**
 * A system context. Only `OutboxActor` and job actors may construct this — it
 * bypasses every visibility rule in `@cellar-assistant/policy`.
 */
export const systemCtx = (requestId: string): Ctx => ({
  viewerId: null,
  kind: "system",
  requestId,
});

export const isSystem = (ctx: Ctx): boolean => ctx.kind === "system";
export const isAdmin = (ctx: Ctx): boolean => ctx.kind === "admin";
