/**
 * A keep-alive's telemetry prefix: a string `P` for which both
 * `P.reminder_armed` and `P.reminder_failed` are catalogued events.
 */
export type KeepAliveEvent = {
  [P in EventName]: P extends `${infer Prefix}.reminder_armed`
    ? `${Prefix}.reminder_failed` extends EventName
      ? Prefix
      : never
    : never;
}[EventName];

/**
 * Keep-alive reminders: the clock for an actor nothing ever invokes.
 *
 * `OutboxActor` and `MaintenanceActor` are called by no request and no other
 * actor, so nothing would ever activate them, so without a reminder they would
 * never run. Registering one from outside the actor is what starts the cycle:
 * the scheduler fires it, the firing activates the actor, and the activation
 * keeps it alive (§2.7).
 *
 * That line was once missing for `MaintenanceActor` — registered, so
 * *callable*, and never armed, so never *run*. The orphan reaper and the
 * dead-letter report had not executed once in nine days, and the outbox's only
 * alarm read "all clear" because it was switched off. So a keep-alive is now
 * **declared** on the actor's registry entry (`src/actors/registry.ts`) and
 * armed by `boot()` for every entry that declares one, through
 * {@link armKeepAlive} — one retry loop where there used to be two
 * copy-pasted ones.
 *
 * Re-registering the same reminder name overwrites, so arming on every boot is
 * idempotent and can never produce a second clock — and *because* it is, it
 * says nothing about whether reminders survive a restart. The measurement that
 * does is `ProbeJobActor`'s one-shot probe; see `target-stack.md` §7.
 * Reminders live in the Scheduler service (Dapr ≥ 1.15), not in the actor
 * state store.
 */
import type { EventName } from "./events.ts";
import type { ReminderSpec } from "./sidecar.ts";
import { emit } from "./telemetry.ts";

export type KeepAlive = {
  /** The singleton the reminder is registered on. */
  readonly actorId: string;
  /** The reminder's name. Re-registering it replaces it. */
  readonly reminder: string;
  /** Delay before the first firing, as a Dapr duration. */
  readonly dueTime: string;
  /** Interval between firings, as a Dapr duration. */
  readonly period: string;
  /**
   * The telemetry prefix: `<event>.reminder_armed` on success,
   * `<event>.reminder_failed` when every attempt failed. Alert rules and
   * runbooks name these events (`maintenance.reminder_failed` is in
   * `infra/grafana/provisioning/alerting/outbox-and-actor-alerts.yaml`), so
   * they are part of the contract, not decoration — and so both names must
   * be entries in `EVENTS` (`./events.ts`): the type admits only a prefix
   * whose two events are catalogued.
   */
  readonly event: KeepAliveEvent;
  /** What the reminder is, for the log line: "drain reminder". */
  readonly what: string;
  /** What stops happening if it is never armed, for the failure message. */
  readonly consequence: string;
};

export type RegisterReminder = (
  actorType: string,
  actorId: string,
  name: string,
  spec: ReminderSpec,
) => Promise<void>;

export type ArmRetry = {
  readonly attempts: number;
  readonly waitMs: number;
};

/**
 * The sidecar's actor subsystem is not ready the instant the app's HTTP server
 * is; a minute of retries covers a cold placement service.
 */
export const DEFAULT_ARM_RETRY: ArmRetry = { attempts: 30, waitMs: 2_000 };

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Register `keepAlive` on `actorType`, retrying until the sidecar accepts it.
 *
 * Resolves `true` once armed and `false` after the last failed attempt —
 * never rejects, because the caller (`boot()`) does not await it: the host has
 * to finish starting for the sidecar to become ready at all. A failure is
 * reported as `<event>.reminder_failed` at `ERROR`, which is what an operator
 * sees instead of an actor that silently never runs.
 */
export const armKeepAlive = async (
  registerReminder: RegisterReminder,
  actorType: string,
  keepAlive: KeepAlive,
  retry: ArmRetry = DEFAULT_ARM_RETRY,
): Promise<boolean> => {
  for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
    try {
      await registerReminder(actorType, keepAlive.actorId, keepAlive.reminder, {
        dueTime: keepAlive.dueTime,
        period: keepAlive.period,
      });
      emit({
        name: `${keepAlive.event}.reminder_armed`,
        severity: "INFO",
        message: `${keepAlive.what} every ${keepAlive.period} (attempt ${attempt})`,
      });
      return true;
    } catch (error) {
      if (attempt === retry.attempts) {
        emit({
          name: `${keepAlive.event}.reminder_failed`,
          severity: "ERROR",
          message:
            `could not arm the ${keepAlive.what}; ${keepAlive.consequence}: ` +
            messageOf(error),
        });
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, retry.waitMs));
    }
  }
  return false;
};
