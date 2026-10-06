/**
 * "Only the newest answer may land" — for component state that more than one
 * request writes.
 *
 * `await` hands control back to React, so two requests writing the same state
 * interleave: a slow one that *started* first can *finish* last and overwrite a
 * newer answer with an older one. Nothing about that is visible in the code of
 * either request, which is why each page that polls or pages its own data
 * needs the rule spelled out once. Two did without it:
 *
 * - `RecipeVersionsTab` — the 15s poll can finish after the re-read a vote
 *   triggers, and put back the tally and the viewer's own-vote marker from
 *   before the vote.
 * - `RankingsBoard` — a "Load more" still in flight when the filter changes
 *   lands after the reset and appends the old filter's rows and cursor.
 *
 * A monotonic generation rather than `AbortController`: urql's `toPromise()`
 * does not cancel the request anyway, and the question that matters is not
 * "did it finish" but "is it still the newest thing anyone asked for".
 *
 * No `"use client"` and no React: the rule is plain data, so it is unit-tested
 * here (`latest-only.test.ts`) rather than through a renderer this repo does
 * not have.
 */

export type LatestOnly = {
  /**
   * Start a request. The returned check is true until anything calls `begin`
   * or `invalidate` again — test it after every `await`, before writing state.
   */
  begin(): () => boolean;
  /**
   * Make every request in flight stale without starting a new one — for a
   * reset (a filter change) after which none of their answers is wanted.
   */
  invalidate(): void;
};

export const createLatestOnly = (): LatestOnly => {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      const mine = generation;
      return () => mine === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
};

/**
 * `load`, then `apply` its answer — unless a newer `begin` or an `invalidate`
 * happened while it was loading, in which case the answer is dropped whole.
 *
 * Resolves true when it applied. `apply` is the only place a caller writes
 * state, which is the point: an answer lands entirely or not at all, never a
 * first page from one request and a second from another.
 */
export const runLatest = async <T>(
  gate: LatestOnly,
  load: () => Promise<T>,
  apply: (value: T) => void,
): Promise<boolean> => {
  const isCurrent = gate.begin();
  const value = await load();
  if (!isCurrent()) return false;
  apply(value);
  return true;
};
