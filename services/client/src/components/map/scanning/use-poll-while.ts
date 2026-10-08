"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_GIVE_UP_MS, pollDelayMs } from "./scan-progress";

/**
 * Re-run `poll` while `active`, on `pollDelayMs`'s backing-off schedule, and
 * give up after `POLL_GIVE_UP_MS` rather than spin forever (N06a).
 *
 * The loop is one effect keyed on `active`: each answer that leaves `active`
 * true lets the next timer run, and the answer that makes it false tears the
 * loop down. `poll` is read through a ref so a new closure every render does
 * not restart the clock. `restart()` clears a give-up and starts over — the
 * "Check again" a stalled screen offers.
 */
export function usePollWhile(
  active: boolean,
  poll: () => unknown,
): { readonly gaveUp: boolean; readonly restart: () => void } {
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const [gaveUp, setGaveUp] = useState(false);
  const [epoch, setEpoch] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `epoch` is the restart signal; it is read by being a dependency.
  useEffect(() => {
    if (!active) return;
    // A new run starts with a fresh clock, so a give-up from an earlier run
    // (the scanner's previous scan, say) does not show on this one.
    setGaveUp(false);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let attempt = 0;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_GIVE_UP_MS) {
        setGaveUp(true);
        return;
      }
      await pollRef.current();
      attempt += 1;
      if (!cancelled) timer = setTimeout(tick, pollDelayMs(attempt));
    };
    timer = setTimeout(tick, pollDelayMs(attempt));
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [active, epoch]);

  const restart = useCallback(() => {
    setGaveUp(false);
    setEpoch((value) => value + 1);
  }, []);

  return { gaveUp: active && gaveUp, restart };
}
