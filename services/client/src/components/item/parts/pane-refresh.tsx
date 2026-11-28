"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext } from "react";

/**
 * F-156: the desktop pane (`ItemPane`) reads the item through urql's
 * `useQuery`, so a `router.refresh()` after a write re-reads the server page
 * underneath but never the pane. The pane puts its query's re-run here, and
 * the item's own writers refresh through `useRefreshAfterWrite`, which does
 * both. On the item page there is no pane: it is the router's refresh alone.
 */
const PaneRefreshContext = createContext<(() => void) | null>(null);

export const PaneRefreshProvider = PaneRefreshContext.Provider;

/** What a write in the item's sections calls once it has landed. */
export function useRefreshAfterWrite(): () => void {
  const router = useRouter();
  const pane = useContext(PaneRefreshContext);
  return useCallback(() => {
    router.refresh();
    pane?.();
  }, [router, pane]);
}
