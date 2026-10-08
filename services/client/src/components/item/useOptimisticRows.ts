"use client";

import { useCallback, useMemo, useOptimistic, useState } from "react";

/**
 * Rows the page was given, newest first, with the ones this client has
 * written and the page has not caught up with yet (`held`) in front. A held
 * row drops out the moment the page's own rows carry its id, so it is never
 * drawn twice.
 */
export const mergeHeldRows = <T extends { id: string }>(
  held: readonly T[],
  rows: readonly T[],
): T[] => {
  const known = new Set(rows.map((row) => row.id));
  return [...held.filter((row) => !known.has(row.id)), ...rows];
};

/**
 * A list that takes additions before the server confirms them (X24): the
 * check-in list on a bottle page.
 *
 * - `add(rows)` inside a transition draws them at once, marked pending; they
 *   go away by themselves if the action ends without `hold`ing them (a
 *   refused write).
 * - `hold(rows)` keeps written rows on screen until the page's next render
 *   of `rows` includes them (a `router.refresh()` is on its way), so a
 *   confirmed row never blinks out between the write and the refresh.
 * - `isPending(id)` says whether a drawn row is still unconfirmed.
 */
export function useOptimisticRows<T extends { id: string }>(
  rows: readonly T[],
): {
  shown: readonly T[];
  add: (added: readonly T[]) => void;
  hold: (written: readonly T[]) => void;
  isPending: (id: string) => boolean;
} {
  const [held, setHeld] = useState<readonly T[]>([]);
  const base = useMemo(() => mergeHeldRows(held, rows), [held, rows]);
  const [shown, add] = useOptimistic<readonly T[], readonly T[]>(
    base,
    (current, added) => [...added, ...current],
  );
  const confirmed = useMemo(() => new Set(base.map((row) => row.id)), [base]);
  const hold = useCallback((written: readonly T[]) => {
    setHeld((current) => [...written, ...current]);
  }, []);
  const isPending = useCallback(
    (id: string) => !confirmed.has(id),
    [confirmed],
  );
  return { shown, add, hold, isPending };
}
