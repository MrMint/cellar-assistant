/**
 * `ProbeJobActor` — A5's acceptance harness, and the first `JobActor` subclass.
 *
 * It exists to prove two things that cannot be proved in-process, because both
 * are about what survives a process dying:
 *
 *  1. **The outbox is durable across a kill.** `start` writes its `jobs` row and
 *     the outbox row that schedules batch 0 in one transaction (§1.4), then —
 *     with `killAfterStart` — `SIGKILL`s its own host before `OutboxActor` can
 *     possibly drain. Compose restarts the container; the batch is delivered
 *     afterwards and the job runs to completion.
 *  2. **A reminder survives a restart of the app *and* its sidecar.**
 *     `armRestartProbe` registers a one-shot reminder some way in the future and
 *     records the current boot id. When the reminder fires, `receiveReminder`
 *     records the boot id it fires under. Two different boot ids is the proof,
 *     and it is a proof no re-registration on activation could fake.
 *
 * It is the A5 analogue of `PingActor` (A2's smoke actor) and should be deleted
 * with it once C4's real job actors exist.
 *
 * Note what a `JobActor` subclass does **not** contain: any write to `jobs`.
 * §3 gives that table to `JobActor`, whose module path owns every write site;
 * progress is returned from `processBatch`, and anything else goes through
 * `writeJob`. C4's actors look like this file, minus the kill switch.
 */
import type {
  ActorCategory,
  Ctx,
  InternalJobActorInterface,
  JobActorInterface,
  JobDto,
} from "@cellar-assistant/contracts";
import { ForbiddenError, ValidationError } from "@cellar-assistant/contracts";
import { requireSignedIn } from "../lib/guards.ts";
import { registerReminder } from "../lib/sidecar.ts";
import { emit } from "../lib/telemetry.ts";
import {
  type BatchInput,
  type BatchOutcome,
  JobActor,
} from "./job-actor/index.ts";
import { ProbeJobActorDescriptor } from "./probe-job-actor-descriptor.ts";

/**
 * New on every process start. The whole restart proof rests on this: a value
 * written before a restart cannot equal one written after it.
 */
const BOOT_ID = crypto.randomUUID();

export const RESTART_PROBE_REMINDER = "restart-probe";

/**
 * The kill switch is opt-in per environment, not just per call. It is a
 * deliberate crash of the actor host; an env flag keeps it impossible anywhere
 * it was not explicitly enabled, whatever a caller asks for.
 */
const killAllowed = (): boolean => process.env.ACTORS_PROBE_ALLOW_KILL === "1";

export type ProbePayload = {
  /** How many batches to run before completing. */
  readonly batches?: number;
  /** SIGKILL this process the instant `start` commits. Needs the env flag. */
  readonly killAfterStart?: boolean;
};

export type ProbeCursor = {
  readonly done: number;
  /** Set by `receiveReminder`; the restart proof reads these two. */
  readonly armedBootId?: string;
  readonly armedAt?: string;
  readonly firedBootId?: string;
  readonly firedAt?: string;
  /** `process.uptime()` when the reminder fired, in seconds. */
  readonly firedUptime?: number;
};

/**
 * A5's smoke probe: the shared job surface plus the one-shot restart probe.
 * Host-internal (nothing but its own registration and one outbox fixture
 * names it), so the contract lives beside the class.
 */
export type ProbeJobActorInterface = JobActorInterface<ProbePayload> & {
  armRestartProbe(ctx: Ctx, dueSeconds: number): Promise<ProbeCursor>;
};

export { ProbeJobActorDescriptor } from "./probe-job-actor-descriptor.ts";

export class ProbeJobActor
  extends JobActor<ProbeCursor, ProbePayload>
  implements ProbeJobActorInterface, InternalJobActorInterface
{
  static override readonly category: ActorCategory =
    ProbeJobActorDescriptor.category;

  protected readonly kind = "a5-probe";

  protected async processBatch(
    _ctx: Ctx,
    input: BatchInput<ProbeCursor, ProbePayload>,
  ): Promise<BatchOutcome<ProbeCursor>> {
    const batches = input.payload.batches ?? 1;
    const done = (input.cursor?.done ?? 0) + 1;
    return {
      cursor: { ...input.cursor, done },
      processed: 1,
      total: batches,
      done: done >= batches,
    };
  }

  /**
   * Any signed-in caller, or system — the rule every job used to inherit from
   * `JobActor.start`, kept here explicitly because this is an acceptance
   * harness a person drives by hand. (The kill switch is gated separately,
   * by environment, below.)
   */
  protected authorizeStart(ctx: Ctx): void {
    requireSignedIn(ctx, "start a probe job");
  }

  /**
   * The kill-before-delivery proof. Everything up to the `SIGKILL` is the base
   * class's ordinary `start`: one transaction holding the job row and the
   * outbox row that schedules batch 0.
   */
  override async start(ctx: Ctx, payload: ProbePayload): Promise<JobDto> {
    const job = await super.start(ctx, payload);

    if (payload.killAfterStart === true) {
      if (!killAllowed()) {
        throw new ForbiddenError(
          "killAfterStart needs ACTORS_PROBE_ALLOW_KILL=1; it crashes the " +
            "actor host on purpose",
        );
      }
      emit({
        name: "probe.kill",
        severity: "WARN",
        message: `killing the actor host after committing job ${this.key}`,
        attributes: { "job.id": this.key, "probe.boot_id": BOOT_ID },
      });
      // SIGKILL first: it skips index.ts's graceful shutdown, which is the
      // point — nothing gets to flush, drain or deliver.
      //
      // **It does not land.** `node src/index.ts` is PID 1 in its container,
      // and the kernel discards signals sent to PID 1 from inside its own PID
      // namespace unless PID 1 installed a handler — SIGKILL included. Measured
      // here: the process emitted this event, returned a 200, and kept running.
      // (`docker kill` works, because that signal comes from the host's
      // namespace.) So the next line is the one that actually ends the process,
      // and it is still abrupt: no handler runs, no socket is flushed, no
      // in-flight turn finishes.
      process.kill(process.pid, "SIGKILL");
      process.exit(137);
    }
    return job;
  }

  /**
   * Arm the reminder-durability probe: create the job row if needed, record the
   * current boot id, and register a **one-shot** reminder `dueSeconds` out.
   *
   * One-shot on purpose. A periodic reminder re-registered on activation proves
   * nothing about durability, because activation happens on the way to the
   * first firing.
   */
  async armRestartProbe(ctx: Ctx, dueSeconds: number): Promise<ProbeCursor> {
    if (!Number.isFinite(dueSeconds) || dueSeconds < 1 || dueSeconds > 3_600) {
      throw new ValidationError("dueSeconds must be between 1 and 3600");
    }
    if (this.aggregate === null) {
      await this.start(ctx, { batches: 1 });
    }
    // `requireReadableJob`, not an owner check that answers `Forbidden`: a
    // non-owner used to be told "not yours to arm" about a real job and
    // "not found" about a missing one, which is a job-id oracle. The base
    // concealment answers both the same way (`refuseAsAbsent`).
    const job = this.requireReadableJob(ctx);

    const cursor = this.cursorOf(job);
    const armed: ProbeCursor = {
      ...(cursor.value ?? { done: 0 }),
      armedBootId: BOOT_ID,
      armedAt: new Date().toISOString(),
    };
    await this.writeJob({ cursor: { batch: cursor.batch, value: armed } });
    await this.reload();

    await registerReminder(
      this.getActorType(),
      this.key,
      RESTART_PROBE_REMINDER,
      { dueTime: `${dueSeconds}s`, data: { armedBootId: BOOT_ID } },
    );

    emit({
      name: "probe.reminder_armed",
      severity: "INFO",
      message: `restart probe armed for +${dueSeconds}s on job ${this.key}`,
      attributes: { "job.id": this.key, "probe.boot_id": BOOT_ID },
    });
    return armed;
  }

  /**
   * The reminder landed. Record *which process* it landed in.
   *
   * `OutboxActor` uses its reminder purely as a keep-alive; this one carries a
   * measurement instead, and is the only reminder in the system that does.
   * §1.4's "no reminder carries domain intent" still holds: a probe is not
   * domain intent.
   */
  override async receiveReminder(_data: string): Promise<void> {
    try {
      await this.reload();
      const job = this.requireJob();
      const cursor = this.cursorOf(job);
      const fired: ProbeCursor = {
        ...(cursor.value ?? { done: 0 }),
        firedBootId: BOOT_ID,
        firedAt: new Date().toISOString(),
        firedUptime: Math.round(process.uptime()),
      };
      await this.writeJob({ cursor: { batch: cursor.batch, value: fired } });
      emit({
        name: "probe.reminder_fired",
        severity: "INFO",
        message: `restart probe fired on job ${this.key}`,
        attributes: {
          "job.id": this.key,
          "probe.boot_id": BOOT_ID,
          "probe.armed_boot_id": cursor.value?.armedBootId ?? "unknown",
          "probe.uptime_s": Math.round(process.uptime()),
        },
      });
    } catch (error) {
      emit({
        name: "probe.reminder_failed",
        severity: "ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
