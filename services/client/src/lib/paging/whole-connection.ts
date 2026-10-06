/**
 * The rules for reading a connection to its end on the client — without
 * React, so they can be tested the way `paged-connection.ts` is.
 *
 * The old UI read some lists unbounded (a Hasura relationship or a
 * subscription has no page): `/friends`' three lists, and the co-owner picker
 * on the cellar forms. The API pages at 100, so a client view that shows the
 * whole list walks it — {@link nextWalkStep} decides, after each answer,
 * whether to ask for the next page. {@link visibleRows} keeps a refresh from
 * flickering: a list that is re-read in the background (a poll, a refresh
 * after a write) goes back to its first page for a moment, and the last list
 * that was read to the end stays on screen until the new walk finishes.
 */
import type { PagedState } from "./paged-connection";

/** A runaway guard, not a product limit: 50 pages of 100 is 5,000 rows. */
export const MAX_WALK_PAGES = 50;

type WalkState = Pick<
  PagedState<unknown, unknown, unknown>,
  "rows" | "status" | "failure" | "hasNextPage" | "canLoadMore"
>;

/**
 * - `load` — ask for the next page now.
 * - `wait` — a request is in flight; its answer decides.
 * - `done` — the end was reached, a request failed (no retry loop: the
 *   failure is shown and a retry is the caller's), or the page guard tripped.
 */
export type WalkStep = "load" | "wait" | "done";

export const nextWalkStep = (
  state: WalkState,
  pageSize: number,
  maxPages: number = MAX_WALK_PAGES,
): WalkStep => {
  if (state.status !== "idle") return "wait";
  if (state.failure !== null) return "done";
  if (!state.hasNextPage) return "done";
  if (Math.ceil(state.rows.length / pageSize) >= maxPages) return "done";
  return state.canLoadMore ? "load" : "done";
};

/**
 * What to show: the rows held once the walk is done, and until then the last
 * list that was read to the end — or, on the very first walk, whatever has
 * arrived so far (there is nothing older to show instead).
 */
export const visibleRows = <TRow>(
  rows: readonly TRow[],
  step: WalkStep,
  settled: readonly TRow[] | null,
): readonly TRow[] => (step === "done" ? rows : (settled ?? rows));
