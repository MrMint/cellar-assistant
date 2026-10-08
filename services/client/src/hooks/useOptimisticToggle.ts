"use client";

import {
  useCallback,
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
  /** A write is in flight. For `aria-busy`, never for disabling the control. */
  pending: boolean;
  toggle: () => void;
};

/**
 * A two-state control that answers the tap in the same frame (X24, design
 * §4.10: `useOptimistic` for every toggle).
 *
 * `value` is the state the page was given (a prop, a query); `commit` writes
 * the tapped state and reports what the server holds after it. Until it
 * answers, `on` is the tapped state. Then:
 *
 * - **ok** — the reported value (or the tapped one) becomes the confirmed
 *   state, so nothing flickers back while the page's own data catches up;
 * - **refused or thrown** — the optimistic state simply ends and `on` falls
 *   back to the confirmed one, and `onError` gets the message to show.
 *
 * Taps during a write are taken, not swallowed: each flips what is drawn and
 * sends its own write, and only the last write's answer is kept, so a late
 * answer to an earlier tap cannot undo a later one.
 *
 * A new `value` from the page (a refetch, a re-render with fresh props)
 * replaces the confirmed state.
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
  const latest = useRef(0);

  const toggle = useCallback(() => {
    const next = !on;
    const ticket = latest.current + 1;
    latest.current = ticket;
    startTransition(async () => {
      setOn(next);
      let result: ToggleCommitResult;
      try {
        result = await commit(next);
      } catch (error) {
        result = {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (ticket !== latest.current) return;
      if (result.ok) {
        const settled = result.value ?? next;
        startTransition(() => setConfirmed(settled));
      } else {
        onError?.(result.message);
      }
    });
  }, [on, commit, onError, setOn]);

  return { on, pending, toggle };
}
