/**
 * A turn's delivery identity, and the one way to derive a key from it.
 *
 * ## What this replaced
 *
 * "Am I an outbox delivery, and which one?" used to be answered by parsing
 * `ctx.requestId`: `OutboxActor` delivered with `systemCtx("outbox:<uuid>")`
 * and `outboxRowId(ctx)` unwrapped the prefix. Three things were wrong with
 * that, and each one had already happened:
 *
 *  1. **`requestId` is correlation, and correlation travels.** A delivery that
 *     called another actor forwarded its ctx, so the callee saw the same
 *     `outbox:<uuid>` and could key *its* writes on the caller's row — a job
 *     lent its identity to every actor it touched, and one delivery making ten
 *     calls handed all ten the same key (the budget-reservation bug
 *     `BudgetActor`'s doc tells).
 *  2. **A request chose it.** Before `services/api` sanitised the header, a
 *     browser's `x-request-id: outbox:<uuid>` was a redelivery downstream.
 *  3. **A key named nothing.** `input.cellarItemId ?? outboxRowId(ctx)` used
 *     the row id itself as a row id, so two different things one delivery
 *     created would have collided on it, and a reader could not tell from the
 *     call site what the key covered.
 *
 * Now `OutboxActor` mints `ctx.delivery = { outboxId, attempt, final }` on the
 * one ctx it delivers with (`deliveryArgs`, unit-tested directly), the wire
 * boundary accepts it only on a `system` ctx (`isWellFormedCtx`), the typed
 * client strips it from every forward ({@link forwardCtx}), and a key is
 * derived with a stated purpose ({@link idempotencyKey}). `requestId` is
 * correlation and nothing else; `delivery.test.ts` fails if an actor module
 * reads it.
 *
 * ## Attribution is a different thing, and it does travel
 *
 * `ctx.causedBy` is the outbox row a turn descends from. It exists for spend
 * attribution (`lib/outbox.ts`, "Attribution, which is not authority") —
 * "which viewer's action is this spend part of?" — and that question is about
 * the whole chain, so {@link forwardCtx} keeps it. It is never an idempotency
 * key and never authority.
 */
import type { Ctx, Delivery } from "@cellar-assistant/contracts";
import { derivedUuid } from "./derived-uuid.ts";

/**
 * A uuid as Postgres renders one: canonical, lower-case. What `user.id`,
 * `outbox.id` and every other id this host compares **as a string** look like
 * — an upper-case spelling is the same row to Postgres and a different value to
 * `===`.
 */
export const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === "string" && CANONICAL_UUID.test(value);

/** Is `value` a {@link Delivery} as `OutboxActor` mints one? */
export const isWellFormedDelivery = (value: unknown): value is Delivery => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const { outboxId, attempt, final } = value as Record<string, unknown>;
  return (
    isCanonicalUuid(outboxId) &&
    typeof attempt === "number" &&
    Number.isInteger(attempt) &&
    attempt >= 1 &&
    typeof final === "boolean"
  );
};

/**
 * The delivery this turn is, or `null`. Only a `system` ctx can be one — the
 * wire boundary already refuses `delivery` on any other kind, and this does
 * not rely on that for a call made in-process.
 */
export const deliveryOf = (ctx: Ctx): Delivery | null =>
  ctx.kind === "system" && isWellFormedDelivery(ctx.delivery)
    ? ctx.delivery
    : null;

/**
 * The outbox row this turn descends from, for **attribution only**, or `null`.
 * `system` only, for the same reason as {@link deliveryOf}.
 */
export const causedByOf = (ctx: Ctx): string | null => {
  if (ctx.kind !== "system") return null;
  const cause = ctx.causedBy ?? ctx.delivery?.outboxId;
  return isCanonicalUuid(cause) ? cause : null;
};

/**
 * A deterministic id for one thing this delivery does, stable across the
 * outbox's redeliveries of the same row — or `null` when the turn is not a
 * delivery, in which case the caller supplies its own (usually a fresh
 * `randomUUID()`).
 *
 * `purpose` says **what the key covers**, and must be a constant: two
 * different things one delivery creates get two different keys, and the
 * call site reads as a statement of what it is idempotent on. `scope`
 * narrows it further when one delivery does the same kind of thing more than
 * once (per item in a batch, per endpoint). The derivation is
 * `derivedUuid(outboxId, JSON of [purpose, ...scope])`, so no choice of
 * scope values can collide two different lists onto one key.
 *
 * It is **never** the outbox row id itself. That is what the old
 * `input.cellarItemId ?? outboxRowId(ctx)` did, and it made a row id and a
 * queue id the same value by accident.
 *
 * Call it only in a method the outbox delivers (or a job's `processBatch`):
 * `forwardCtx` strips `delivery` from every onward call, so anywhere else the
 * answer is always `null`. `delivery.test.ts` ("idempotencyKey call sites")
 * holds every call site to that, and inventories the ones that are not.
 */
export const idempotencyKey = (
  ctx: Ctx,
  purpose: string,
  ...scope: readonly string[]
): string | null => {
  if (purpose.length === 0) {
    throw new Error("idempotencyKey: purpose must say what the key covers");
  }
  const delivery = deliveryOf(ctx);
  if (delivery === null) return null;
  return derivedUuid(
    `outbox-delivery:${delivery.outboxId}`,
    JSON.stringify([purpose, ...scope]),
  );
};

/**
 * The ctx an actor-to-actor call carries: the caller's, **minus `delivery`**.
 *
 * The callee is not the delivery — it is something the delivery called — so
 * it may not derive keys from the delivery's row, and a key it needs to be
 * stable across redeliveries is passed to it explicitly, derived by the
 * caller with {@link idempotencyKey}. `causedBy` survives (attribution is a
 * property of the chain); on a delivery that somehow lacks it, it is filled
 * from the delivery's row so attribution does not end at the first hop.
 *
 * Applied by `internal(ctx)` (`./internal-client.ts`) to every call, so no
 * call site can forget it.
 */
export const forwardCtx = (ctx: Ctx): Ctx => {
  const { delivery, causedBy, ...rest } = ctx;
  const cause = causedBy ?? delivery?.outboxId;
  return cause === undefined ? rest : { ...rest, causedBy: cause };
};
