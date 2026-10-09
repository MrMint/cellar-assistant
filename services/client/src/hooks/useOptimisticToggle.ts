"use client";

import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

/** What a toggle's write reports: the state the server now holds, or why not. */
export type ToggleCommitResult =
  | { ok: true; value?: boolean }
  | { ok: false; message: string };

export type OptimisticToggle = {
  /** What to draw: the tapped state at once, the server's once it answers. */
  on: boolean;
  /**
   * A write is in flight. For `aria-busy` and for `TogglePop`'s "this turn-on
   * is the user's" — never for disabling the control.
   */
  pending: boolean;
  toggle: () => void;
};

/**
 * How many writes in one run may come back on the wrong side of what was
 * asked (the server reporting a state other than the one written) before the
 * hook stops chasing it and shows what the server says.
 */
const MAX_MISSES = 2;

/**
 * A two-state control that answers the tap in the same frame (X24, design
 * §4.10: `useOptimistic` for every toggle).
 *
 * `value` is the state the page was given (a prop, a query); `commit(next)`
 * asks the server for `next` and reports what it holds afterwards (`value`,
 * when the write says; otherwise `next` is taken as written). `on` is the
 * tapped state from the tap's own frame. Then:
 *
 * - **ok** — what the server reported becomes the confirmed state, so nothing
 *   flickers back while the page's own data catches up;
 * - **refused or thrown** — `on` falls back to the last state the server
 *   confirmed, and `onError` gets the message to show.
 *
 * **One write at a time.** Taps during a write are taken, not swallowed: each
 * flips what is drawn, and when the write in flight answers, the hook writes
 * again only if the last tapped state is not what the server now holds. So
 * three quick taps cost at most two writes, a late answer can never undo a
 * later tap, and an earlier write that landed is never mistaken for one that
 * did not (a refusal falls back to what the server actually holds, not to
 * the state before the first tap). It also makes the hook safe over a write
 * that *flips* rather than sets (`toggleFavorite`): writes never overlap, so
 * each one is sent knowing the state it flips from.
 *
 * A new `value` from the page (a refetch, a re-render with fresh props)
 * replaces the confirmed state. The hook's state belongs to one subject:
 * a caller that reuses one instance for another item or place must key it.
 */
export function useOptimisticToggle({
  value,
  commit,
  onError,
}: {
  value: boolean;
  commit: (next: boolean) => Promise<ToggleCommitResult>;
  onError?: (message: string) => void;
}): OptimisticToggle {
  const [confirmed, setConfirmed] = useState(value);
  const [given, setGiven] = useState(value);
  if (given !== value) {
    // The page's own data moved: adopt it (React's "adjust state on a prop
    // change" pattern, during render rather than in an effect).
    setGiven(value);
    setConfirmed(value);
  }
  const [on, setOn] = useOptimistic(confirmed);
  const [pending, startTransition] = useTransition();

  /** The last tapped state, while a run has not reached it. */
  const wanted = useRef<boolean | null>(null);
  /**
   * What the server holds, as far as this hook knows: the page's value, then
   * each write's answer. A page value that arrives mid-run is not taken — it
   * may predate the write in flight, and a stale "from" would make a flipping
   * write flip the wrong way.
   */
  const held = useRef(value);
  /** The run in flight, which later taps wait on instead of writing. */
  const running = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (running.current === null) held.current = value;
  }, [value]);

  const run = useCallback((): Promise<void> => {
    if (running.current !== null) return running.current;
    const work = (async () => {
      let refusal: string | null = null;
      let misses = 0;
      while (wanted.current !== null && wanted.current !== held.current) {
        const want = wanted.current;
        let result: ToggleCommitResult;
        try {
          result = await commit(want);
        } catch (error) {
          result = {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
        if (!result.ok) {
          refusal = result.message;
          break;
        }
        held.current = result.value ?? want;
        if (held.current !== want) {
          misses += 1;
          if (misses >= MAX_MISSES) break;
        }
      }
      wanted.current = null;
      running.current = null;
      const settled = held.current;
      startTransition(() => setConfirmed(settled));
      if (refusal !== null) onError?.(refusal);
    })();
    running.current = work;
    return work;
  }, [commit, onError]);

  const toggle = useCallback(() => {
    const next = !on;
    wanted.current = next;
    // A run already in flight picks the new state up when its write answers.
    startTransition(async () => {
      setOn(next);
      await run();
    });
  }, [on, run, setOn]);

  return { on, pending, toggle };
}
