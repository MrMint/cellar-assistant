/**
 * What the actor host does with an error nothing caught.
 *
 * ## The policy
 *
 * - **An unhandled rejection is reported and the host keeps running.**
 *   `process.unhandled_rejection`, severity ERROR.
 * - **An uncaught exception is reported, flushed, and the host exits 1.**
 *   `process.fatal`, severity ERROR, posted to the collector *before* the
 *   exit so Grafana sees why the host went down (`emitAndFlush`, 2s at most).
 *   A rejected top-level `await` in `index.ts` arrives here too under Bun —
 *   measured, 1.4.2 — so a boot that fails still exits instead of idling
 *   half-started.
 *
 * ## Why they differ
 *
 * Both runtimes' default is to exit on either. For an uncaught *exception*
 * that is right and stays: a synchronous throw escaped every frame, and Node's
 * own guidance is that the process is in an unknown state afterwards.
 *
 * An unhandled *rejection* is a different animal. It is one async operation
 * whose failure nobody awaited — the operation is lost, the process is not
 * corrupted. What exiting buys here is nothing, and what it costs is every
 * in-flight turn of every actor on the host: that is exactly how one request
 * carrying `sake:not-a-uuid` became a host crash ten minutes later
 * (`./actor-route-guard.ts`). Nothing an actor does depends on the process
 * dying for correctness — Postgres is the only truth (§1.3), every write is
 * one transaction, and the outbox redelivers what did not finish (§1.4). So
 * an exit converts a lost operation into many lost operations, and hands any
 * caller who can provoke a rejection a way to take the host down on demand.
 *
 * The rejection is not swallowed: it is an ERROR event, alertable in Grafana
 * as `{service_name="actors"} | event_name="process.unhandled_rejection"`, and
 * each one is a bug to fix where it was raised. The known sources have been
 * fixed at the source — the SDK's route handlers are settled by
 * `installActorRouteGuard` — so this is the backstop, not the mechanism.
 *
 * Neither event carries the error's message. See `./telemetry.ts`'s rules.
 */
import {
  emit,
  emitAndFlush,
  errorAttributes,
  stackFrames,
} from "./telemetry.ts";

/** The two things this needs from `process`, so a test can hand it a fake. */
export type GuardedProcess = {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): unknown;
  on(
    event: "uncaughtException",
    listener: (error: unknown, origin?: string) => void,
  ): unknown;
};

export type ProcessGuardOptions = {
  readonly proc?: GuardedProcess;
  readonly exit?: (code: number) => void;
};

/**
 * Install both listeners. Call once, first thing in `index.ts`, before
 * anything that can reject.
 */
export const installProcessGuards = ({
  proc = process,
  exit = (code) => process.exit(code),
}: ProcessGuardOptions = {}): void => {
  proc.on("unhandledRejection", (reason: unknown) => {
    const attributes = errorAttributes(reason);
    emit({
      name: "process.unhandled_rejection",
      severity: "ERROR",
      message: `unhandled rejection: ${attributes["error.name"]}; the host keeps running`,
      attributes,
      localDetail: stackFrames(reason),
    });
  });

  let exiting = false;
  proc.on("uncaughtException", (error: unknown, origin?: string) => {
    // A second throw while the first is still flushing must not start a
    // second flush, nor exit before the first event is out.
    if (exiting) return;
    exiting = true;
    const attributes = errorAttributes(error);
    void emitAndFlush({
      name: "process.fatal",
      severity: "ERROR",
      message: `uncaught exception: ${attributes["error.name"]}; the host is exiting`,
      attributes: {
        ...attributes,
        "process.origin":
          origin === "unhandledRejection" ? "unhandledRejection" : "exception",
      },
      localDetail: stackFrames(error),
    }).finally(() => exit(1));
  });
};
