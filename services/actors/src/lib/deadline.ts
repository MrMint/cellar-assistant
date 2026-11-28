/**
 * A bound on how long a request-driven turn waits on something it does not
 * control — first used for `PlaceCreationActor`'s AI review (N09), which X27
 * has since moved out of the request path altogether.
 *
 * Lives here, not beside the actor: `registry.test.ts` holds every class
 * declared under `src/actors` to be a registered actor.
 */

/** The awaited work did not answer within its deadline. */
export class DeadlineExceededError extends Error {
  override readonly name = "DeadlineExceededError";
}

/**
 * `work`, or `onTimeout()`'s error once `ms` have passed — whichever is first.
 *
 * Hand `work` as a function and it is given an `AbortSignal` that fires when
 * the deadline does (its `reason` is `onTimeout()`'s error), so the losing
 * work is actually **cancelled** — for the AI reviewer that means the HTTP
 * request is aborted and the metering wrapper stops booking it as a call
 * somebody is waiting on (N09). A bare promise cannot be cancelled; it is
 * left to finish on its own.
 *
 * Either way the losing work's eventual rejection is swallowed here rather
 * than surfacing as an unhandled rejection after the caller has moved on. A
 * non-positive or non-finite `ms` means "no deadline", and the signal then
 * never fires.
 */
export const withDeadline = <T>(
  work: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  ms: number,
  onTimeout: () => Error,
): Promise<T> => {
  const controller = new AbortController();
  const running = typeof work === "function" ? work(controller.signal) : work;
  if (!Number.isFinite(ms) || ms <= 0) return running;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = onTimeout();
      controller.abort(error);
      reject(error);
    }, ms);
  });
  running.catch(() => undefined);
  return Promise.race([running, deadline]).finally(() => clearTimeout(timer));
};
