/**
 * What a compensation is told when the outbox gives up on a row
 * (`services/actors/src/lib/outbox-targets.ts`, "Compensations").
 *
 * The drainer builds it, in SQL, in the statement that dead-letters the row
 * (`services/actors/src/lib/outbox.ts`, `insertCompensations`), and delivers
 * it as the payload of the target's declared `onDead` method — so the keys
 * here and the keys of that `jsonb_build_object` are one contract.
 */
export type DeadDeliveryReason =
  /** The attempt budget ran out (`MAX_ATTEMPTS`). */
  | "attempts"
  /** A failure no retry can clear (`VALIDATION`), on any attempt. */
  | "permanent"
  /**
   * The host died mid-delivery on the last attempt: the reclaim sweep
   * dead-lettered the row and the target never heard about it.
   */
  | "reclaim";

export const DEAD_DELIVERY_REASONS: readonly DeadDeliveryReason[] = [
  "attempts",
  "permanent",
  "reclaim",
];

export type DeadDeliveryNotice = {
  /** The `outbox.id` that went `dead`. What the compensation is idempotent on. */
  readonly deadOutboxId: string;
  /** Its method — the one the compensating actor was running when it died. */
  readonly deadMethod: string;
  readonly reason: DeadDeliveryReason;
  /** The dead row's payload, verbatim: e.g. a `runBatch`'s `{ batch }`. */
  readonly deadPayload?: unknown;
};

/**
 * A compensation's answer. `false` is not a failure — it is the idempotent
 * "nothing to do": the owner was already terminal (the failing turn wrote it
 * itself), has moved on past the row that died, or does not exist.
 */
export type CompensationResult =
  | { readonly compensated: true }
  | {
      readonly compensated: false;
      readonly reason: "absent" | "terminal" | "stale";
    };
