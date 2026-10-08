/**
 * A bound on how long a request-driven turn waits on something it does not
 * control — first used for `PlaceCreationActor`'s AI review (N09).
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
 * The losing `work` is not cancelled (a seam like the AI reviewer takes no
 * signal), so
 * its eventual rejection is swallowed here rather than surfacing as an
 * unhandled rejection after the creation has already gone ahead. A
 * non-positive or non-finite `ms` means "no deadline".
 */
export const withDeadline = <T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> => {
  if (!Number.isFinite(ms) || ms <= 0) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  work.catch(() => undefined);
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
};
