/**
 * `MaintenanceActor` — §2.6's scheduled singleton. A8 built the orphan-file
 * reaper; **C4 added the dead-letter report**, the other half §2.6 asks for.
 *
 * > Orphans (never verified/attached) are reaped by `MaintenanceActor` via a
 * > scheduled outbox row. (§2.1 `FileActor`)
 * >
 * > `MaintenanceActor()` (singleton) | orphan-file reaper, dead-letter
 * > report; scheduled via `run_after` outbox rows. (§2.6)
 *
 * `files` rows whose PUT was never verified (`verified_at IS NULL`), are older
 * than 24h **and are attached to nothing** are provisional targets nobody
 * finished uploading to, or finished and never told anyone about. All three
 * clauses matter — see `findOrphans` for what the missing third one cost.
 *
 * G32 added a second kind of orphan: a **search photo** (`image-search`,
 * `SEARCH_PHOTO_KIND`), which is verified and then, by design, never
 * attached. `ItemSearchActor` discards one as soon as its search has used it;
 * this reaps any that slipped past that — a discard that failed, a photo
 * uploaded and never searched — once older than `SEARCH_PHOTO_TTL_MS`,
 * verified or not, and still only when nothing references it.
 * `reapOrphanFiles` finds them and, in one transaction:
 *
 *   - enqueues an `outbox` row targeting `FileActor(id).delete` for each —
 *     never deletes `files` directly (that table is `FileActor`'s, per
 *     `packages/db/src/writers.ts`; a direct write here would fail the
 *     single-writer containment test), and never calls `FileActor` in-turn
 *     either (see "Why this goes through the outbox" below);
 *   - arms its own next run, 24h out — conditionally, see "Scheduling".
 *
 * ## Why this does not extend `JobActor`
 *
 * `JobActor` (`actors/job-actor/index.ts`, A5) models a **finite** chain of
 * batches that ends in `completed`/`failed`/`cancelled`; once terminal, a job
 * id's `runBatch` refuses to run again (see its `TERMINAL` check), so it has
 * no way to represent "run again in 24h, forever" without minting a fresh job
 * id every cycle — at odds with `MaintenanceActor()` being a singleton.
 * `services/actors/src/lib/outbox.ts`'s own doc comment names this actor as the
 * example of `delayMs` — a plain method re-enqueuing itself — which is the
 * pattern used below. Category is still `"job"`, matching §2.6's table.
 *
 * ## Why this goes through the outbox instead of calling `FileActor` directly
 *
 * §8.5 reads as if a job actor may call an entity actor synchronously
 * ("job → entity / registry / search"), but `src/lib/system-ctx.test.ts`
 * enforces the narrower, actually-load-bearing rule from §1.6: **only**
 * `actors/outbox-actor.ts` and `actors/job-actor/` may construct a `system`
 * ctx — this actor is neither. A synchronous call to `FileActor.delete` needs
 * exactly that ctx (only the uploader, admin or system may delete a file), so
 * the reachable path is the one every other cross-aggregate operation in this
 * codebase already uses (§1.7): commit an `outbox` row and let `OutboxActor`
 * deliver it with a real `system` ctx. `enqueueOutbox`'s delivery is at least
 * once and `FileActor.delete` **returns without error** on a row that is
 * already gone, so a re-delivered reap is harmless.
 *
 * That last clause was false when it was written, in three separate ways, and
 * every one of them would have had the reaper manufacture dead letters *into
 * the report it owns* — switching on the alarm and filling it with its own
 * noise. All three are fixed; the paragraph above is now true:
 *
 *   1. `delete` began with `requireAggregate()`, which throws `NotFoundError`
 *      on a row already gone (`file-actor.ts`);
 *   2. `invokeActorMethod` could not read a `void` return — Dapr writes it as
 *      the body `undefined`, `JSON.parse` threw, and a *committed* delete was
 *      booked as a failure (`lib/sidecar.ts`). This was reachable only from
 *      here, because `FileActor.delete` is the first `Promise<void>` method
 *      this app ever delivered through the outbox;
 *   3. `findOrphans` selected files that were still attached, which cannot be
 *      deleted at all (every FK into `files` is `RESTRICT`/`NO ACTION`).
 *
 * Nos. 2 and 3 were found by arming this actor against the live stack and
 * watching what the outbox did — not by reading the code, which is worth
 * recording: all three were invisible to a type checker and to 1005 tests.
 *
 * ## Scheduling
 *
 * Each method keeps its own cycle alive by enqueuing its own next run:
 * `reapOrphanFiles` every 24h, `reportDeadLetters` every hour. They are
 * separate chains on purpose — a reap that starts failing must not also
 * silence the dead-letter report, which is the thing that would tell you the
 * reap is failing.
 *
 * Two things were missing, and both were the same bug wearing different
 * clothes: **nothing started the chains**, and **nothing stopped them
 * multiplying**.
 *
 * ### Starting them: a reminder, the way `OutboxActor` does it
 *
 * `MAINTENANCE_KEEP_ALIVE` (bottom of this file) declares one Dapr reminder on
 * this singleton, and `boot()` arms it beside `OutboxActor`'s drain reminder.
 * A reminder is idempotent *by name* — re-registering overwrites — so arming
 * it on every boot is safe, which is exactly why `OutboxActor` does the same.
 * Before this, the class doc here told you to run an `INSERT` by hand, nothing
 * and nobody ever did, and so `MaintenanceActor` had never run once: no orphan
 * was ever reaped and no dead letter was ever reported. The report is this
 * system's only alarm on the outbox, so the effect of not scheduling it was
 * that the alarm read "all clear" by virtue of being switched off.
 *
 * ### Stopping them multiplying: arm only what is not already armed
 *
 * The reminder does not *do* the work — it cannot, because the work needs a
 * `system` ctx and §1.6 says this actor may not construct one (see "Why this
 * goes through the outbox"). It arms the chains, and `OutboxActor` delivers
 * them with a real `system` ctx.
 *
 * Arming is `armCycle`, and it inserts **only if no live row for that
 * `(target_actor, target_id, method)` already exists**. That one `WHERE NOT
 * EXISTS` is what makes the whole scheme safe, in three separate places:
 *
 *   1. **Boot.** A restart re-registers the reminder and re-arms; a chain
 *      already ticking is left alone, so restarting does not add a chain.
 *   2. **Redelivery.** Delivery is at least once, so `reapOrphanFiles` *will*
 *      be delivered twice eventually. Unconditionally re-arming — which is
 *      what both methods used to do — forks one chain into two, each of which
 *      then re-arms itself: permanent, and cumulative over every redelivery,
 *      not a one-off. Conditionally, the second delivery finds the first
 *      delivery's row already pending and inserts nothing.
 *   3. **Convergence.** Two chains, however they arose, do not stay two: each
 *      one's next delivery sees the other's pending row and declines to
 *      re-arm, so the pair collapses back to a single chain. A fork is
 *      self-healing rather than permanent — which is the property that
 *      actually matters, because no guard can be perfectly atomic under a
 *      rolling deploy running two hosts at once.
 *
 * And the reminder is a **watchdog**, not just a starter: it fires hourly and
 * re-arms anything that is missing, so a chain lost to a dead letter, an
 * operator's `DELETE`, or a truncated table comes back by itself within the
 * hour instead of staying silently dead — which is the failure this whole
 * class of scheduled-singleton bug keeps producing.
 */
import {
  type ActorCategory,
  type Ctx,
  SEARCH_PHOTO_KIND,
  SEARCH_PHOTO_TTL_MS,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { deliveryOf } from "../lib/delivery.ts";
import { requirePrivileged } from "../lib/guards.ts";
import type { KeepAlive } from "../lib/keep-alive.ts";
import { enqueueOutbox, enqueueOutboxOnce } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import { type Event, emit } from "../lib/telemetry.ts";
import { MaintenanceActorDescriptor } from "./maintenance-actor-descriptor.ts";

export {
  MAINTENANCE_ACTOR_TYPE,
  MaintenanceActorDescriptor,
} from "./maintenance-actor-descriptor.ts";

/** The singleton's id — same convention as `OUTBOX_ACTOR_ID`. */
export const MAINTENANCE_ACTOR_ID = "singleton";
/** The method the scheduling outbox row targets. */
export const REAP_ORPHAN_FILES = "reapOrphanFiles";

/** target-stack §4 / migration-plan §2.1: the orphan cutoff. */
export const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
/** How often this actor reschedules itself (migration-plan §2.6). */
export const REAP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The watchdog reminder's name. Idempotent by name, like `DRAIN_REMINDER`.
 *
 * One reminder covers both chains rather than one reminder each: Dapr hands
 * `receiveReminder` the reminder's *state*, not its name, so a per-chain
 * reminder would have to round-trip a discriminator through the sidecar's
 * reminder-data encoding to say which chain fired. There is nothing to
 * discriminate — "arm whatever is not armed" is the same answer for both — so
 * the dispatch is not worth buying.
 */
export const MAINTENANCE_REMINDER = "maintenance";

/**
 * How often the watchdog checks that both chains are armed.
 *
 * Matched to the faster of the two cycles: a chain that dies is invisible
 * until something re-arms it, and waiting longer than the shortest interval
 * would let the dead-letter report skip a beat unnoticed.
 */
export const MAINTENANCE_REMINDER_PERIOD = "1h";

/** Delay before the watchdog's first firing. Long enough for the pool and
 * the sidecar's actor subsystem to be up, short enough to see at a deploy. */
export const MAINTENANCE_REMINDER_DUE = "30s";

/* -------------------------------------------------------------------------- */
/* C4: the dead-letter report                                                  */
/* -------------------------------------------------------------------------- */

/** The method the dead-letter report's scheduling outbox row targets. */
export const REPORT_DEAD_LETTERS = "reportDeadLetters";

/**
 * Hourly, not daily.
 *
 * A dead-lettered row is work the system accepted and then dropped on the
 * floor — a recipe never built, a menu never matched, a place never enriched.
 * §1.4 dead-letters at attempt 10 with `min(2s·2^(n-1), 10min)` backoff, so a
 * row reaches `dead` roughly 40 minutes after its first failure; a 24-hour
 * report would routinely be the better part of a day late.
 */
export const DEAD_LETTER_REPORT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How long a row may sit in `delivering` before it is *reported* as stuck.
 *
 * `OutboxActor`'s own reclaim sweep un-sticks a row after 10 minutes and
 * charges it an attempt (A5). Anything still `delivering` at twice that is a
 * sweep that is not running, which is an operational fault the reaper cannot
 * fix and must therefore surface.
 */
export const STUCK_DELIVERING_MS = 20 * 60 * 1000;

/** How many `(target_actor, method)` pairs one report names. */
export const DEAD_LETTER_REPORT_GROUPS = 20;

/**
 * The three events this alarm can raise. Three **names**, not one name with
 * three messages, because a name is the only part of an event an alert rule
 * can route on: `infra/` hangs a page off the regression, a ticket off the
 * ordinary alarm, and a dead-man's-switch off the absence of the heartbeat.
 * Folding them into one name would make all three the same alert.
 */
export const DEAD_LETTER_ALARM = "maintenance.dead_letters";
/** The heartbeat — see `deadLetterEvents`. */
export const DEAD_LETTER_CLEAR = "maintenance.dead_letters_clear";
/** A pair that was triaged and has dead-lettered again. */
export const DEAD_LETTER_REGRESSION = "maintenance.dead_letter_regression";
/** One operator acknowledgement, for the audit trail. */
export const DEAD_LETTER_ACKNOWLEDGED = "maintenance.dead_letters_acknowledged";

export type DeadLetterGroup = {
  readonly targetActor: string;
  readonly method: string;
  /**
   * **Unacknowledged** `dead` rows in this pair — the ones nobody has triaged,
   * which is the only number an operator can act on. `byTarget` only ever
   * lists pairs where this is non-zero.
   */
  readonly count: number;
  /**
   * Already-acknowledged `dead` rows in this pair; evidence, not work. Only
   * rows whose acknowledgement post-dates their latest death count here — see
   * `redied`.
   */
  readonly acknowledged: number;
  /**
   * Of `count`, the rows that *were* acknowledged, then requeued, and have
   * dead-lettered again under the same id. Their acknowledgement is older than
   * their latest death, so it describes a failure that is no longer the one on
   * the row, and they count as new. Each one is a regression on its own.
   */
  readonly redied: number;
  /**
   * Something that was triaged has died again: this pair has acknowledged rows
   * *and* unacknowledged ones, or holds a row that died again after its own
   * acknowledgement (`redied`). The loudest thing this alarm can say.
   */
  readonly regression: boolean;
  /** ISO-8601; the oldest *unacknowledged* row in this group. */
  readonly oldest: string;
  /** Truncated `last_error` of one unacknowledged row, for the log line. */
  readonly lastError: string | null;
};

export type DeadLetterReport = {
  /**
   * Every `status = 'dead'` row, counted independently of `byTarget`.
   *
   * Summing `byTarget` looks equivalent and is not: that list is `LIMIT
   * DEAD_LETTER_REPORT_GROUPS`, so past 20 distinct pairs the sum silently
   * became a count of the worst 20 — an alarm that under-reports exactly when
   * the backlog is worst and most varied.
   */
  readonly dead: number;
  /** Of those, the ones an operator has acknowledged (see `acknowledgeDeadLetters`). */
  readonly acknowledged: number;
  /** `dead - acknowledged`. **This is what the alarm fires on.** */
  readonly newDead: number;
  readonly stuckDelivering: number;
  /** Distinct `(target_actor, method)` pairs — again, the total, not `byTarget.length`. */
  readonly targets: number;
  /** Distinct pairs with at least one unacknowledged row. */
  readonly newTargets: number;
  /**
   * Distinct pairs where something triaged has died again: pairs that are
   * *both* acknowledged and newly dead, plus pairs holding a row that died
   * again after its own acknowledgement (`DeadLetterGroup.redied`).
   */
  readonly regressed: number;
  /** The worst `DEAD_LETTER_REPORT_GROUPS` unacknowledged pairs, most rows first. */
  readonly byTarget: readonly DeadLetterGroup[];
};

/**
 * One operator triage decision (`acknowledgeDeadLetters`).
 *
 * Every field except `by` narrows the set; together they are ANDed. Nothing
 * here can reach a row that is not already `status = 'dead'` — see the method.
 */
export type AcknowledgeDeadLetters = {
  /** Specific `outbox.id`s. `[]` acknowledges **nothing**, never everything. */
  readonly ids?: readonly string[];
  readonly targetActor?: string;
  readonly method?: string;
  /** ISO-8601; only rows created strictly before this instant. */
  readonly before?: string;
  /** Who is acknowledging: an operator handle, a ticket, a rollout name. */
  readonly by: string;
  /** Why. Free text, stored verbatim. */
  readonly note?: string;
};

export type AcknowledgeResult = {
  readonly acknowledged: number;
  readonly ids: readonly string[];
  /**
   * Of `ids`, the rows that already carried an acknowledgement older than
   * their latest death (requeued since, and dead again). That stale
   * acknowledgement was replaced by this one; the event names who wrote it.
   */
  readonly superseded: readonly string[];
};

export type OrphanFile = { readonly id: string; readonly createdAt: Date };
export type ReapResult = { readonly scheduled: readonly string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Does acknowledgement `a` cover the *current* death of outbox row `o`?
 *
 * Only if it was written at or after that death. An acknowledgement is a
 * decision about one failure, and a row can fail more than once under the same
 * id: an operator requeues a dead row (`status` back to `pending`), it is
 * delivered again, and it dies again. Nothing deletes the acknowledgement when
 * that happens — `outbox_dead_letter_acks` has no idea the row moved — so an
 * existence test (`a.outbox_id is not null`) let a triage decision about the
 * *first* death silence the second: acknowledge, requeue, re-kill, and the
 * report said `newDead=0, regressed=0` and beat all-clear. That is the
 * regression page failing on exactly the case it exists for.
 *
 * `o.updated_at` is the time of the latest death, and this depends on that
 * being true. It holds because every transition into `dead` —
 * `OutboxActor.#fail` and `OutboxActor.#reclaimStale` — writes
 * `updated_at = now()` in the same statement, nothing writes a `dead` row
 * afterwards (the claim reads `pending`, the reclaim `delivering`, the
 * retention sweep `delivered`), and `outbox` has no triggers. A requeue cannot
 * sneak under it either: the requeued row is claimed and then fails, and both
 * of those writes stamp `now()` again. Anything that ever writes
 * `status = 'dead'` some other way must stamp `updated_at` too, or its deaths
 * inherit whatever acknowledgement the row last had.
 *
 * `>=`, not `>`: an acknowledgement is only possible after the death has
 * committed, so in production the two never share a timestamp; they share one
 * only inside a single transaction, which is what every test in this repo
 * runs in. The race in the other direction — a death whose transaction started
 * after the acknowledging one did but committed before its snapshot — makes
 * the acknowledgement *older* than the death and so reads as unacknowledged:
 * loud, never silent, and cleared by acknowledging again.
 */
const ACK_COVERS_DEATH = sql`a.acknowledged_at >= o.updated_at`;

/**
 * Every `dead` row, classified once, for both halves of the report. One
 * definition rather than two copies of the join, because the totals and the
 * grouped list disagreeing about what "acknowledged" means is how an alarm
 * ends up paging on a number its own detail line contradicts.
 *
 * `redied` is the third state `ACK_COVERS_DEATH` creates: acknowledged once,
 * dead again since. It is not `acked`, so it counts as new; and it is a
 * regression by itself, whether or not its pair has other acknowledged rows.
 */
const DEAD_ROWS = sql`
  select o.target_actor, o.method, o.created_at, o.last_error,
         coalesce(${ACK_COVERS_DEATH}, false)                    as acked,
         (a.outbox_id is not null and not (${ACK_COVERS_DEATH})) as redied
  from public.outbox o
  left join public.outbox_dead_letter_acks a on a.outbox_id = o.id
  where o.status = 'dead'
`;

/**
 * What the report should say out loud — a pure function of the report, so the
 * alarm's *policy* is testable without a database, and so the decision "is this
 * silence or is this a page?" is one readable expression rather than a nest of
 * ternaries inside an `emit` call.
 *
 * Three rules, in the order they are emitted:
 *
 *  1. **A regression gets its own event**, first. A pair with both
 *     acknowledged and unacknowledged dead rows — or with a row that died
 *     again after its own acknowledgement — is a bug someone already
 *     decided was fixed, failing again; it is the single most valuable thing
 *     this alarm can report and it must not arrive as a slightly longer
 *     sentence inside the same event everything else uses. It is emitted
 *     *first* so a truncated log keeps it.
 *  2. **New dead letters are an ERROR.** `newDead`, not `dead`: the whole
 *     point of acknowledgement is that the alarm stops re-reporting failures
 *     someone has already looked at, while the rows themselves stay put.
 *     `stuckDelivering` is not acknowledgeable and is ORed in here — a row
 *     wedged in `delivering` is a sweep that is not running, which clears
 *     itself or is a live fault; there is nothing to triage.
 *  3. **Otherwise, a heartbeat.** Silence would be indistinguishable from an
 *     alarm that has been switched off — which is exactly the state this actor
 *     was in for the whole of its existence before it was ever scheduled. An
 *     INFO line an hour that names the standing backlog is the cheapest
 *     possible proof the channel still works, and it is what lets a
 *     dead-man's-switch alert exist at all.
 */
/** The three events the hourly report can emit. */
export type DeadLetterEvent = Event<
  | typeof DEAD_LETTER_REGRESSION
  | typeof DEAD_LETTER_CLEAR
  | typeof DEAD_LETTER_ALARM
>;

export const deadLetterEvents = (
  report: DeadLetterReport,
): DeadLetterEvent[] => {
  const events: DeadLetterEvent[] = [];
  const named = report.byTarget.filter((group) => group.regression);
  const list = (groups: readonly DeadLetterGroup[]): string =>
    groups.map((g) => `${g.targetActor}.${g.method}=${g.count}`).join(",");

  if (report.regressed > 0) {
    const worst = named[0];
    events.push({
      name: DEAD_LETTER_REGRESSION,
      severity: "ERROR",
      message:
        `REGRESSION: ${report.regressed} acknowledged outbox target(s) have ` +
        "dead-lettered again" +
        (named.length >= report.regressed
          ? ""
          : `, of which ${named.length} are named`) +
        (worst === undefined
          ? ""
          : `; worst: ${worst.targetActor}.${worst.method} ` +
            `(${worst.count} new, ${worst.acknowledged} acknowledged before` +
            (worst.redied === 0
              ? ""
              : `, ${worst.redied} of the new dead again after being ` +
                "acknowledged and requeued") +
            ")"),
      attributes: {
        regressed: report.regressed,
        new_dead: report.newDead,
        targets_named: named.length,
        targets: list(named),
      },
    });
  }

  const attributes = {
    dead: report.dead,
    new_dead: report.newDead,
    acknowledged: report.acknowledged,
    regressed: report.regressed,
    stuck_delivering: report.stuckDelivering,
    target_count: report.targets,
    new_target_count: report.newTargets,
    targets_named: report.byTarget.length,
    targets: list(report.byTarget),
  };

  if (report.newDead === 0 && report.stuckDelivering === 0) {
    events.push({
      name: DEAD_LETTER_CLEAR,
      severity: "INFO",
      message:
        report.dead === 0
          ? "outbox clear: no dead-lettered rows"
          : `outbox clear: 0 new dead-lettered row(s); all ${report.dead} ` +
            "acknowledged and kept as evidence",
      attributes,
    });
    return events;
  }

  const worst = report.byTarget[0];
  events.push({
    name: DEAD_LETTER_ALARM,
    severity: "ERROR",
    message:
      `outbox has ${report.newDead} new dead-lettered row(s) across ` +
      `${report.newTargets} target(s)` +
      // Said out loud rather than left to be inferred from a count that
      // happens to equal the limit: the list below is the worst N, and an
      // operator reading the line needs to know it is not the whole of what
      // the two numbers above describe.
      (report.newTargets <= report.byTarget.length
        ? ""
        : `, of which the worst ${report.byTarget.length} are named`) +
      (report.acknowledged === 0
        ? ""
        : `; ${report.acknowledged} further row(s) already acknowledged`) +
      (report.stuckDelivering === 0
        ? ""
        : `, and ${report.stuckDelivering} stuck in 'delivering' for over ` +
          `${Math.round(STUCK_DELIVERING_MS / 60_000)}m`) +
      (worst === undefined
        ? ""
        : `; worst: ${worst.targetActor}.${worst.method} (${worst.count})`),
    attributes,
  });
  return events;
};

/**
 * The watchdog's callable surface: its two self-arming chains, and the
 * operator's acknowledgement. Called by its own outbox rows, by the hourly
 * reminder, or by an admin — never by another process — so the contract lives
 * beside the class and its result types stay this module's.
 */
export type MaintenanceActorInterface = {
  reapOrphanFiles(
    ctx: Ctx,
    payload?: Record<string, unknown>,
  ): Promise<ReapResult>;
  reportDeadLetters(
    ctx: Ctx,
    payload?: Record<string, unknown>,
  ): Promise<DeadLetterReport>;
  acknowledgeDeadLetters(
    ctx: Ctx,
    payload: AcknowledgeDeadLetters,
  ): Promise<AcknowledgeResult>;
};

export class MaintenanceActor
  extends ActorBase
  implements MaintenanceActorInterface
{
  static readonly category: ActorCategory = MaintenanceActorDescriptor.category;

  /**
   * Arm the next run of `target`, **unless this chain is already armed**.
   *
   * The insert is one statement with a `WHERE NOT EXISTS`, rather than a read
   * followed by `enqueueOutbox`: a check in one statement and an insert in the
   * next is the race it is trying to close, and `enqueueOutbox` cannot express
   * a condition. (`outbox` is the one table §3 lets any actor insert into, so
   * writing it here needs no other permission.)
   *
   * `excludeRowId` is the delivery currently executing — the outbox row whose
   * delivery *is* this call, which is sitting in `delivering` while it runs and
   * would otherwise match the guard and convince this method that the chain is
   * already armed. That would not fork the chain; it would end it, which is
   * worse. It is `ctx.delivery.outboxId` (`deliveryOf`, `lib/delivery.ts`),
   * and `null` when a human forced the run.
   *
   * Returns the new row's id, or `null` if a cycle was already armed.
   *
   * The statement itself now lives in `lib/outbox.ts` as `enqueueOutboxOnce`:
   * `TierListActor` needed the same guard to stop one request flooding the
   * queue, and a race-critical `INSERT … WHERE NOT EXISTS` kept in two places
   * is one that drifts. `includeDelivering: true` is the difference that stays
   * here — for a self-arming chain the row currently being delivered *is* the
   * next cycle, which is the opposite of what a content-change enqueue wants.
   */
  protected async armCycle(
    tx: DbOrTx,
    target: (typeof OUTBOX_TARGETS)[
      | "MaintenanceActor.reapOrphanFiles"
      | "MaintenanceActor.reportDeadLetters"],
    delayMs: number,
    excludeRowId: string | null,
  ): Promise<string | null> {
    return enqueueOutboxOnce(
      tx,
      target,
      {
        targetId: this.key,
        // A delay on the database's clock, not `new Date(Date.now() + …)`:
        // `run_after` is compared against `now()` by the drainer, and this
        // actor need not share a host — let alone a clock — with it
        // (`OutboxActor` decision 7).
        delayMs,
      },
      { excludeRowId, includeDelivering: true },
    );
  }

  /**
   * The watchdog (class doc, "Scheduling"). Dapr's scheduler fires it hourly
   * and the firing is what activates this actor at all.
   *
   * It does no maintenance itself — it cannot, for want of a `system` ctx —
   * it only makes sure both chains are armed, and arms whichever is not. On a
   * healthy system that is two no-op statements an hour; on a system whose
   * chain has died, it is the thing that brings it back.
   *
   * Arms them *due now*: a chain that is missing is a chain that is overdue,
   * and the normal interval is re-established by the run itself.
   *
   * Never throws, for the same reason `OutboxActor.receiveReminder` does not:
   * the next tick is coming regardless, and a throwing handler just hands the
   * scheduler a retry policy nobody reasoned about.
   */
  override async receiveReminder(_data: string): Promise<void> {
    try {
      const armed = await this.tx(async (tx) => {
        return {
          reap: await this.armCycle(
            tx,
            OUTBOX_TARGETS["MaintenanceActor.reapOrphanFiles"],
            0,
            null,
          ),
          report: await this.armCycle(
            tx,
            OUTBOX_TARGETS["MaintenanceActor.reportDeadLetters"],
            0,
            null,
          ),
        };
      });
      const started = [
        armed.reap === null ? null : REAP_ORPHAN_FILES,
        armed.report === null ? null : REPORT_DEAD_LETTERS,
      ].filter((name): name is string => name !== null);
      if (started.length > 0) {
        emit({
          name: "maintenance.cycle_armed",
          severity: "INFO",
          message: `MaintenanceActor armed ${started.join(", ")}`,
          attributes: { armed: started.join(",") },
        });
      }
    } catch (error) {
      emit({
        name: "maintenance.reminder_failed",
        severity: "ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * The columns in other tables that point at `files`, read from the FK
   * catalog rather than listed here.
   *
   * There are six today (`item_image`, two on `item_onboardings`, two on
   * `menu_scans`, one on `place_google_photos`) and every one is `RESTRICT` or
   * `NO ACTION`, so a referenced row cannot be deleted at all. Hard-coding the
   * six would mean the seventh — added by whoever next attaches an image to
   * something — silently reintroduces the exact bug this fixes, and would
   * reintroduce it *as dead letters in the report this actor owns*. Postgres
   * already knows the list; asking it once a day costs nothing.
   */
  protected async referencingColumns(): Promise<
    readonly { table: string; column: string }[]
  > {
    const result = await this.db.execute<{
      table_name: string;
      column_name: string;
    }>(sql`
      select c.conrelid::regclass::text as table_name,
             a.attname::text            as column_name
      from pg_constraint c
      join lateral unnest(c.conkey) as k(attnum) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.contype = 'f' and c.confrelid = 'public.files'::regclass
      order by 1, 2
    `);
    return result.rows.map((row) => ({
      table: row.table_name,
      column: row.column_name,
    }));
  }

  /**
   * Every `files` row that is unverified, older than `cutoff`, **and attached
   * to nothing**. A plain read — job actors may read any table directly
   * (§1.1) — and deliberately its own step so the selection logic is testable
   * on its own.
   *
   * §2.1 defines an orphan as "never verified/attached" and this only ever
   * checked the first half. The second half is not cosmetic: every FK into
   * `files` is `RESTRICT`/`NO ACTION`, so `FileActor.delete` on an attached row
   * raises a `DrizzleQueryError`, which the outbox retries ten times and then
   * dead-letters. Measured the first time this actor was ever scheduled: seven
   * such rows, every one of them a file that a `menu_scans` row still points
   * at — i.e. not an orphan at all, merely an upload whose `verify` never ran.
   *
   * Plus, verified or not, every **search photo** (`metadata.kind =
   * 'image-search'`, which `FileActor.createUploadTarget` records) older than
   * `searchPhotoCutoff` and attached to nothing — the safety net under
   * `ItemSearchActor`'s discard (class doc). One attached since is a real
   * image now and is left alone, by the same clause as everything else.
   * Left unfixed, switching this actor on would have added a fresh dead letter
   * per attached file per day, into the one report that exists to be believed.
   */
  protected async findOrphans(
    cutoff: Date,
    searchPhotoCutoff: Date,
  ): Promise<OrphanFile[]> {
    const referents = await this.referencingColumns();
    // Identifiers come from `pg_constraint`, already quoted by `regclass`;
    // nothing here is caller-supplied.
    const unattached = referents.map(
      (ref) =>
        sql`not exists (select 1 from ${sql.raw(ref.table)} r
              where r.${sql.raw(`"${ref.column}"`)} = f.id)`,
    );
    const result = await this.db.execute<{ id: string; created_at: Date }>(sql`
      select f.id, f.created_at
      from public.files f
      where (
          (f.verified_at is null
            and f.created_at < ${cutoff.toISOString()}::timestamptz)
          or (f.metadata ->> 'kind' = ${SEARCH_PHOTO_KIND}
            and f.created_at < ${searchPhotoCutoff.toISOString()}::timestamptz)
        )
        ${sql.join(
          unattached.map((clause) => sql` and ${clause}`),
          sql``,
        )}
    `);
    return result.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Finds orphans and, in one transaction, enqueues a `FileActor.delete` for
   * each plus its own next run 24h out (class doc: "Why this goes through the
   * outbox"). System/admin only — the only caller is `OutboxActor`, once
   * something has bootstrapped the first row, or an operator forcing a run.
   *
   * The self-reschedule is written alongside whatever deletions were found, so
   * a crash after this commits still leaves the next cycle armed — but it is
   * written *conditionally* (`armCycle`): at-least-once delivery means this
   * exact call will eventually run twice, and an unconditional insert would
   * fork the chain permanently rather than cost one extra cycle.
   *
   * A redelivery therefore costs one extra `findOrphans` read and, for any
   * orphan still listed, one extra `FileActor.delete` — which is a no-op on a
   * row already gone (`file-actor.ts`) and so does *not* dead-letter. Never an
   * orphan going unreaped, and never a second chain.
   */
  async reapOrphanFiles(
    ctx: Ctx,
    _payload: Record<string, unknown> = {},
  ): Promise<ReapResult> {
    requirePrivileged(
      ctx,
      "MaintenanceActor.reapOrphanFiles is system/admin only",
    );

    const cutoff = new Date(Date.now() - ORPHAN_AGE_MS);
    const searchPhotoCutoff = new Date(Date.now() - SEARCH_PHOTO_TTL_MS);
    const orphans = await this.findOrphans(cutoff, searchPhotoCutoff);
    const self = deliveryOf(ctx)?.outboxId ?? null;

    await this.tx(async (tx) => {
      for (const orphan of orphans) {
        await enqueueOutbox(tx, OUTBOX_TARGETS["FileActor.delete"], {
          targetId: orphan.id,
        });
      }
      await this.armCycle(
        tx,
        OUTBOX_TARGETS["MaintenanceActor.reapOrphanFiles"],
        REAP_INTERVAL_MS,
        self,
      );
    });

    if (orphans.length > 0) {
      emit({
        name: "maintenance.reap_scheduled",
        severity: "INFO",
        message: `MaintenanceActor scheduled ${orphans.length} orphan file deletion(s)`,
        attributes: { scheduled: orphans.length },
      });
    }

    return { scheduled: orphans.map((o) => o.id) };
  }

  /* ---------------------------------------------------------------------- */
  /* C4: the dead-letter report                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * §2.6's second maintenance duty: say out loud what the outbox gave up on.
   *
   * Nothing in the system notices a dead-lettered row today. `OutboxActor`
   * marks it `dead` and moves on, and `outbox` has no reader — so the failure
   * mode is silence, which is the one failure mode an at-least-once queue must
   * not have. This groups `status = 'dead'` by `(target_actor, method)` and
   * emits one of the three events `deadLetterEvents` defines; the LGTM stack
   * in `infra/` is where the alert rules hang off their names.
   *
   * **It fixes nothing and retries nothing, on purpose.** Re-driving a dead
   * row is a decision about *that* aggregate — whether the call is still
   * meaningful, whether the state it assumed still holds — and this actor
   * knows nothing about any of them. Automatic retry here would resurrect a
   * ten-attempt failure into an eleventh, forever.
   *
   * Like `reapOrphanFiles`, it re-arms itself in the same transaction it
   * reports in, so a crash still leaves the next cycle scheduled, and like
   * `reapOrphanFiles` it re-arms **conditionally**.
   *
   * The comment that used to sit here said a redelivery "costs one extra read
   * and one extra cycle". That was wrong, and wrong in the direction that
   * matters: the re-arm was unconditional, so a redelivery did not cost *one*
   * extra cycle, it permanently forked one hourly chain into two — each of
   * which re-armed itself, so the cost compounded with every redelivery
   * instead of washing out. Now the second delivery finds the first's row
   * already pending and inserts nothing, so the sentence is finally true: one
   * extra read, one extra telemetry event, one chain.
   *
   * ## Counting and listing are two questions, and now two queries
   *
   * `dead` was derived by summing `byTarget`, which is
   * `LIMIT DEAD_LETTER_REPORT_GROUPS`. Under 20 distinct
   * `(target_actor, method)` pairs the two agree and the bug is invisible;
   * past 20 the ERROR line — the only alarm anything raises about the outbox
   * at all — reported the total of its worst 20 rather than the total, and
   * did so precisely when a backlog is worst and most varied. The bound was
   * never wrong: `DEAD_LETTER_REPORT_GROUPS`' own doc scopes it to "how many
   * pairs one report *names*". It was being asked a question it does not
   * answer.
   *
   * ## New and already-seen are two questions, and now two numbers
   *
   * The reaper never deletes a `dead` row, because the row is the evidence.
   * So an alarm that fires on `dead` re-reports every failure ever, forever —
   * and an alarm that fires hourly about bugs that were fixed weeks ago stops
   * being read, which is precisely the outcome it exists to prevent. Measured
   * 2026-09-20: 23 dead rows, every one predating the fix that closed its own
   * cause. A 100% false-positive rate, hourly.
   *
   * `acknowledgeDeadLetters` is the way out that does not involve deleting
   * anything: an operator annotates specific rows, and the alarm fires on
   * `newDead` — the rows nobody has annotated. `dead` is still reported, in
   * the heartbeat, so the standing backlog never disappears from view; it
   * just stops being an ERROR.
   *
   * The asymmetry is deliberate and is the whole design:
   *
   *   - **suppression is per row, and per death.** An acknowledgement names
   *     ids that already exist and have already died, so it cannot reach into
   *     the future — including the future of its *own* row: a row that is
   *     requeued and dies again keeps its id, and the acknowledgement it
   *     carries is older than its new death, so it no longer counts
   *     (`ACK_COVERS_DEATH`).
   *   - **amplification is per pair.** A pair holding both acknowledged and
   *     unacknowledged rows is a *regression* — something triaged, failing
   *     again — and gets its own event name, its own alert rule, and the word
   *     REGRESSION at the front of the line. So is a pair holding a row that
   *     died again after its own acknowledgement, even if it is the pair's
   *     only row.
   *
   * A naive "seen this `(actor, method)` pair before" rule gets the first half
   * backwards and silences exactly the second.
   */
  async reportDeadLetters(
    ctx: Ctx,
    _payload: Record<string, unknown> = {},
  ): Promise<DeadLetterReport> {
    requirePrivileged(
      ctx,
      "MaintenanceActor.reportDeadLetters is system/admin only",
    );

    const [{ rows: totals }, { rows: groups }, { rows: stuck }] = [
      // Counted separately from the grouped list below, and that separation is
      // the point. `byTarget` is `LIMIT DEAD_LETTER_REPORT_GROUPS`, whose own
      // doc scopes that bound to "how many `(target_actor, method)` pairs one
      // report *names*" — so summing it answered a different question than the
      // one the ERROR line asks. With more than 20 distinct pairs the system's
      // only outbox alarm quietly reported the total of its worst 20.
      //
      // Written as CTEs so each of the five numbers is its own line and reads
      // like the definition it is — `regressed` in particular, which is a set
      // intersection and would be unreadable as the arithmetic identity
      // (`newTargets + ackTargets - targets`) that would also produce it.
      await this.db.execute<{
        dead: string | number;
        acknowledged: string | number;
        targets: string | number;
        new_targets: string | number;
        regressed: string | number;
      }>(sql`
        with d as (${DEAD_ROWS}),
        pairs as (
          select target_actor, method,
                 count(*) filter (where not acked) as new_count,
                 count(*) filter (where acked)     as ack_count,
                 count(*) filter (where redied)    as redied_count
          from d group by target_actor, method
        )
        select (select count(*) from d)                        as dead,
               (select count(*) from d where acked)            as acknowledged,
               (select count(*) from pairs)                    as targets,
               (select count(*) from pairs where new_count > 0) as new_targets,
               (select count(*) from pairs
                 where new_count > 0
                   and (ack_count > 0 or redied_count > 0))    as regressed
      `),
      // `having new_count > 0`: an acknowledged pair drops out of the list an
      // operator is asked to act on, and reappears — flagged as a regression —
      // the moment one of its rows dies again, whether that is a new row or an
      // acknowledged one requeued under the same id. The `filter`s make every
      // aggregate here a question about the *unacknowledged* rows alone, which
      // is what "worst" now means.
      await this.db.execute<{
        target_actor: string;
        method: string;
        count: string | number;
        acknowledged: string | number;
        redied: string | number;
        oldest: string | Date;
        last_error: string | null;
      }>(sql`
        with d as (${DEAD_ROWS})
        select target_actor, method,
               count(*) filter (where not acked)       as count,
               count(*) filter (where acked)           as acknowledged,
               count(*) filter (where redied)          as redied,
               min(created_at) filter (where not acked) as oldest,
               (array_agg(last_error) filter (
                  where not acked and last_error is not null))[1]
                 as last_error
        from d
        group by target_actor, method
        having count(*) filter (where not acked) > 0
        order by count(*) filter (where not acked) desc,
                 target_actor asc, method asc
        limit ${DEAD_LETTER_REPORT_GROUPS}
      `),
      // `now()`, not a host-clock cutoff. `updated_at` is written by the
      // database, and this actor is not guaranteed to run on the same host as
      // whichever drainer wrote it; a host clock a few seconds fast or slow
      // silently moves the alarm's threshold. Same fix, same reason, as
      // `OutboxActor.#fail`'s `run_after`.
      await this.db.execute<{ count: string | number }>(sql`
        select count(*) as count from public.outbox
        where status = 'delivering'
          and updated_at < now() - make_interval(
                secs => ${STUCK_DELIVERING_MS / 1000}::double precision)
      `),
    ];

    const byTarget: DeadLetterGroup[] = groups.map((row) => ({
      targetActor: row.target_actor,
      method: row.method,
      count: Number(row.count),
      acknowledged: Number(row.acknowledged),
      redied: Number(row.redied),
      regression: Number(row.acknowledged) > 0 || Number(row.redied) > 0,
      oldest: new Date(row.oldest).toISOString(),
      lastError: row.last_error?.slice(0, 500) ?? null,
    }));
    const dead = Number(totals[0]?.dead ?? 0);
    const acknowledged = Number(totals[0]?.acknowledged ?? 0);
    const targets = Number(totals[0]?.targets ?? 0);
    const newTargets = Number(totals[0]?.new_targets ?? 0);
    const regressed = Number(totals[0]?.regressed ?? 0);
    const stuckDelivering = Number(stuck[0]?.count ?? 0);

    await this.tx(async (tx) => {
      await this.armCycle(
        tx,
        OUTBOX_TARGETS["MaintenanceActor.reportDeadLetters"],
        DEAD_LETTER_REPORT_INTERVAL_MS,
        deliveryOf(ctx)?.outboxId ?? null,
      );
    });

    const report: DeadLetterReport = {
      dead,
      acknowledged,
      newDead: dead - acknowledged,
      stuckDelivering,
      targets,
      newTargets,
      regressed,
      byTarget,
    };
    for (const event of deadLetterEvents(report)) emit(event);
    return report;
  }

  /**
   * Triage: mark specific dead rows as seen, so the hourly alarm stops
   * counting them. **Nothing is deleted and nothing is modified** — the
   * acknowledgement is a row in `outbox_dead_letter_acks` beside the evidence,
   * carrying who, when and why.
   *
   * ## Why acknowledgement is manual
   *
   * The alternative — rows aging out of the alarm after N hours on their own —
   * fails in the one way this alarm may not: an undiagnosed failure goes quiet
   * on a timer, and the silence is indistinguishable from a fix. That is the
   * same bug as the one being fixed here, one level up, and it is worse,
   * because nobody has to be present for it to happen.
   *
   * Manual's failure mode — nobody acknowledges anything — is *loud*: the
   * alarm keeps firing, which is the pre-change status quo and not a
   * regression from it. The cost of neglect stays visible, and stays with the
   * person who can pay it.
   *
   * ## Why a row and not a pair
   *
   * `ids` names `outbox.id`s and so does the table's primary key. A
   * `(target_actor, method)` mute would be easier to operate and would
   * suppress the single most valuable thing this alarm can say — a bug someone
   * already fixed, failing again. Keyed by row, a regression arrives in one of
   * two shapes, and neither is covered by an earlier acknowledgement:
   *
   *   - a **new row**, with an id no prior acknowledgement could have named;
   *   - an **acknowledged row, requeued, dead again** under the *same* id. The
   *     id alone would match here — this doc used to say a regression is
   *     "a *new* row with an id no prior acknowledgement could have named",
   *     and that was false for exactly this case — so the report also asks
   *     *when*: an acknowledgement covers a row only if it post-dates the
   *     row's latest death (`ACK_COVERS_DEATH`).
   *
   * Either way it is unacknowledged and the alarm raises it under its own
   * event name (`deadLetterEvents`).
   *
   * ## Acknowledging a row that died again
   *
   * The second shape has to be acknowledgeable too, or fixing it would leave
   * a page that can never clear: its stale acknowledgement already holds the
   * primary key. So `on conflict` replaces an acknowledgement **only when it no
   * longer covers the row** — older than the row's latest death — and returns
   * that row as `superseded`, with the replaced author in the event. The old
   * decision was about a failure the row no longer carries (the requeue and
   * the second death overwrote its `last_error` and `attempts`), so nothing
   * the ledger still describes is lost by overwriting it.
   *
   * ## The one invariant that makes a broad filter safe
   *
   * `status = 'dead'` is ANDed into every call and cannot be overridden, so
   * even `{ by }` with no filter at all — which is exactly the backfill of an
   * existing, already-diagnosed population — can only ever reach rows that
   * have *already* died. It cannot pre-acknowledge a `pending` or
   * `delivering` row into silence, which is the one way this method could
   * defeat its own alarm.
   *
   * For an acknowledgement that still covers its row, it is idempotent and
   * first-writer-wins: a re-run acknowledges 0 and leaves the original author,
   * time and note intact, so a repeated rollout cannot rewrite the record of
   * who decided what.
   */
  async acknowledgeDeadLetters(
    ctx: Ctx,
    payload: AcknowledgeDeadLetters,
  ): Promise<AcknowledgeResult> {
    requirePrivileged(
      ctx,
      "MaintenanceActor.acknowledgeDeadLetters is system/admin only",
    );
    const by = payload.by?.trim() ?? "";
    if (by === "") {
      // An acknowledgement with no author is a rumour: it silences an alarm
      // and names nobody to ask about it.
      throw new ValidationError("acknowledgeDeadLetters requires `by`");
    }
    const bad = (payload.ids ?? []).filter((id) => !UUID.test(id));
    if (bad.length > 0) {
      throw new ValidationError(`not an outbox row id: ${bad.join(", ")}`);
    }

    const filters = [sql`o.status = 'dead'`];
    if (payload.ids !== undefined) {
      // `[]` matches nothing rather than everything — the difference between
      // "acknowledge these zero rows" and "acknowledge the whole backlog", and
      // worth one branch that says `false` out loud rather than an `in ()`
      // that is a syntax error, or an `any()` that quietly drops the filter.
      // (Drizzle expands a JS array in a template into a parenthesised
      // *parameter list*, not one array parameter, so `any(${ids})` does not
      // mean what it reads as.)
      filters.push(
        payload.ids.length === 0
          ? sql`false`
          : sql`o.id in (${sql.join(
              payload.ids.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
      );
    }
    if (payload.targetActor !== undefined) {
      filters.push(sql`o.target_actor = ${payload.targetActor}`);
    }
    if (payload.method !== undefined) {
      filters.push(sql`o.method = ${payload.method}`);
    }
    if (payload.before !== undefined) {
      filters.push(sql`o.created_at < ${payload.before}::timestamptz`);
    }

    // The outer `select` joins the ledger as it stood *before* this statement:
    // every part of one statement shares a snapshot, so `prior` is the
    // acknowledgement an upsert just replaced, or null for a fresh insert.
    // The conflict `where` is `not ACK_COVERS_DEATH`, spelled out because the
    // alias there is the existing ledger row and the row's death time has to
    // be looked up.
    const { rows } = await this.db.execute<{
      outbox_id: string;
      superseded_by: string | null;
    }>(sql`
      with upserted as (
        insert into public.outbox_dead_letter_acks as a
          (outbox_id, target_actor, method, acknowledged_by, note)
        select o.id, o.target_actor, o.method, ${by}, ${payload.note ?? null}
        from public.outbox o
        where ${sql.join(filters, sql` and `)}
        on conflict (outbox_id) do update set
          acknowledged_at = now(),
          acknowledged_by = excluded.acknowledged_by,
          note            = excluded.note,
          target_actor    = excluded.target_actor,
          method          = excluded.method
        where a.acknowledged_at < (
          select o.updated_at from public.outbox o where o.id = excluded.outbox_id
        )
        returning outbox_id
      )
      select u.outbox_id, prior.acknowledged_by as superseded_by
      from upserted u
      left join public.outbox_dead_letter_acks prior
        on prior.outbox_id = u.outbox_id
    `);

    const ids = rows.map((row) => row.outbox_id);
    const replaced = rows.filter((row) => row.superseded_by !== null);
    const superseded = replaced.map((row) => row.outbox_id);
    const priorAuthors = [...new Set(replaced.map((row) => row.superseded_by))];
    emit({
      name: DEAD_LETTER_ACKNOWLEDGED,
      severity: "INFO",
      message:
        `${ids.length} dead-lettered outbox row(s) acknowledged by ${by}` +
        (payload.note === undefined ? "" : `: ${payload.note}`) +
        (superseded.length === 0
          ? ""
          : ` (${superseded.length} had died again since an earlier ` +
            `acknowledgement by ${priorAuthors.join(", ")}, which this replaces)`),
      attributes: {
        acknowledged: ids.length,
        superseded: superseded.length,
        superseded_by: priorAuthors.join(","),
        by,
        target_actor: payload.targetActor ?? "",
        method: payload.method ?? "",
      },
    });
    return { acknowledged: ids.length, ids, superseded };
  }
}

/**
 * The watchdog's clock, declared on this actor's registry entry and armed at
 * boot by `boot()` (`src/lib/keep-alive.ts` has the retry and the reasoning).
 *
 * Nothing ever invokes this actor, so without a reminder nothing activates it
 * and the chains never start. §2.6's singleton was once registered and then
 * left with no clock at all, which is why it had never run.
 */
export const MAINTENANCE_KEEP_ALIVE: KeepAlive = {
  actorId: MAINTENANCE_ACTOR_ID,
  reminder: MAINTENANCE_REMINDER,
  dueTime: MAINTENANCE_REMINDER_DUE,
  period: MAINTENANCE_REMINDER_PERIOD,
  event: "maintenance",
  what: "maintenance watchdog",
  consequence:
    "orphan files will not be reaped and dead letters will not be reported",
};
