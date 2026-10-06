/**
 * "Will the outbox deliver this again?" — asked by a target method that is
 * failing, so it can tell *retrying* from *finished* in its own row.
 *
 * ## Why a target has to ask at all
 *
 * `OutboxActor` owns the retry. A target that throws is redelivered with
 * backoff until `MAX_ATTEMPTS`, or dead-lettered at once if the failure is
 * one no retry can clear (`isPermanentFailure`). Neither outcome reaches the
 * target: the drainer marks its own row `dead` and invokes nobody. So a
 * target whose domain row has a terminal state — `jobs.status = 'failed'`,
 * `menu_scans.processing_status = 'failed'` — only ever gets to write it from
 * inside the failing turn, *before* it rethrows. That is what this answers.
 *
 * Getting it wrong in either direction was a real defect:
 *
 *  - `JobActor.runBatch` never wrote `failed` at all, so a job whose batch
 *    dead-lettered stayed `running` forever and a poll never ended.
 *  - `MenuScanActor.process` wrote `failed` on *every* failed attempt and
 *    `processing` again on the retry, so a scan's status flapped for the
 *    whole ~17-minute backoff ladder, telling the user "failed" nine times
 *    about a scan that might still succeed.
 *
 * ## The rule, which is the drainer's own
 *
 * A failure is final when `OutboxActor.#fail` will make the row `dead`:
 *
 *  - **permanent** — `isPermanentFailure(error)`, the same classifier the
 *    drainer applies, so a `ValidationError` is final on attempt 1;
 *  - **attempts** — this is the delivery's last attempt: `ctx.delivery.final`,
 *    which `OutboxActor` computes from `outbox.attempts` when it mints the
 *    ctx (`deliveryArgs`), not from any count the target keeps — a reclaim
 *    (the host died mid-delivery) charges an attempt without the target ever
 *    hearing about it. A `final` delivery is still confirmed against the row
 *    (below), because the flag was true when the delivery *started*;
 *  - **not a delivery** — an admin forcing the method by hand, or a system
 *    turn that is not the outbox's. Nothing will ever retry it, so its
 *    failure is the last word by definition.
 *
 * A `final` delivery whose row cannot be found, is no longer `delivering`, or
 * has been charged another attempt since this one was minted (the reclaim
 * sweep took it back, so a later delivery — or a dead letter the drainer
 * compensates for — is coming) is **not** final: the outbox, not this turn,
 * decides. A delivery that is not `final` needs no read at all: attempts only
 * grow, and a reclaim of it leaves `#fail` nothing to record.
 *
 * ## What it cannot see: a delivery that never returns
 *
 * If the host dies mid-delivery on the *last* attempt, `#reclaimStale`
 * dead-letters the row without invoking anything, and the target never gets
 * the turn in which it would have written `failed`. That case is the
 * drainer's: a target that declares `onDead` in `OUTBOX_TARGETS` gets a
 * compensating row in the same statement that makes its row `dead`.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { isPermanentFailure, MAX_ATTEMPTS } from "../actors/outbox-actor.ts";
import type { DbOrTx } from "./db.ts";
import { deliveryOf } from "./delivery.ts";

/** Why a failure is the last one, or `null` when the outbox will retry it. */
export type FinalFailure = "permanent" | "attempts" | "not-a-delivery";

/**
 * Is `error`, thrown in `ctx`'s turn, the failure that ends the work? See the
 * module doc for the three reasons it can be, and the one case it cannot see.
 */
export const finalDeliveryFailure = async (
  db: DbOrTx,
  ctx: Ctx,
  error: unknown,
): Promise<FinalFailure | null> => {
  if (isPermanentFailure(error)) return "permanent";

  const delivery = deliveryOf(ctx);
  if (delivery === null) return "not-a-delivery";
  if (!delivery.final) return null;

  // Still this delivery's claim? `status = 'delivering'` and the attempt count
  // it was minted with: a row the reclaim sweep has taken back is pending
  // (or already dead, and compensated by the drainer), and its next event —
  // not this turn — is the one that decides.
  const { rows } = await db.execute<{ attempts: number }>(sql`
    select attempts from public.outbox
    where id = ${delivery.outboxId}::uuid
      and status = 'delivering'
      and attempts = ${delivery.attempt - 1}
  `);
  if (rows[0] === undefined) return null;
  // `#fail` charges this failure as `attempts + 1` and dead-letters at the
  // cap; `final` said that is this attempt, and the row still agrees.
  return delivery.attempt >= MAX_ATTEMPTS ? "attempts" : null;
};
