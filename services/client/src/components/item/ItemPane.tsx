"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "urql";
import { Link } from "@/components/app/Link";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemPageHref } from "./adapter";
import { ItemPageQuery } from "./fragments";
import { ItemPageView } from "./ItemPageView";
import { type ItemPageData, loadItemPageData } from "./parts/load-item-page";
import { PaneRefreshProvider } from "./parts/pane-refresh";

export type ItemPaneProps = {
  itemId: string;
  itemType: ApiItemType;
  /** The cellar the pane opened from, when it opened from one. */
  cellarId?: string;
};

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: ItemPageData };

/**
 * The item's body inside the desktop pane (MC-panes, L32): the item page's
 * own sections (`ItemPageView`, `pane`) at pane width — no bar and no bleed,
 * the menu as a plain `⋯` — read in the browser with urql's `useQuery` and
 * the page's own loader (`loadItemPageData`), so the pane and the page never
 * disagree. C1 mounts it in F2a's `DesktopPane`.
 */
export function ItemPane({ itemId, itemType, cellarId }: ItemPaneProps) {
  // urql's own hook, so only the answer for the current item lands (the
  // no-to-promise rule); the lists then stop at their first page of 100
  // (reading past them is F-156's hand-off). F-156: a write in the pane's
  // sections re-runs this query (`PaneRefreshProvider`), since
  // `router.refresh()` never reaches it.
  const [result, reexecute] = useQuery({
    query: ItemPageQuery,
    variables: { itemId, type: itemType },
    requestPolicy: "cache-and-network",
  });
  const [state, setState] = useState<State>({ phase: "loading" });
  const refresh = useCallback(
    () => reexecute({ requestPolicy: "network-only" }),
    [reexecute],
  );
  const { data, error } = result;

  useEffect(() => {
    if (error !== undefined && data === undefined) {
      setState({ phase: "error", message: error.message });
      return;
    }
    if (data === undefined) {
      setState({ phase: "loading" });
      return;
    }
    let live = true;
    loadItemPageData(null, itemType, itemId, data).then(
      (loaded) => {
        if (!live) return;
        setState(
          loaded.ok
            ? { phase: "ready", data: loaded.data }
            : { phase: "error", message: loaded.error.message },
        );
      },
      () => {
        if (live) setState({ phase: "error", message: "It didn’t load." });
      },
    );
    return () => {
      live = false;
    };
  }, [data, error, itemId, itemType]);

  if (state.phase === "ready") {
    return (
      <PaneRefreshProvider value={refresh}>
        <div data-testid="item-pane">
          <ItemPageView
            {...state.data}
            selected={null}
            parent={cellarId === undefined ? "/" : `/cellars/${cellarId}/items`}
            pane
          />
        </div>
      </PaneRefreshProvider>
    );
  }
  return (
    <div
      data-testid="item-pane"
      aria-busy={state.phase === "loading" || undefined}
      className="flex flex-col gap-4 p-4"
    >
      {state.phase === "loading" ? (
        <>
          <span className="aspect-square w-40 animate-pulse rounded-lg bg-skel" />
          <span className="h-7 w-3/4 animate-pulse rounded-md bg-skel" />
          <span className="h-5 w-1/2 animate-pulse rounded-md bg-skel" />
        </>
      ) : (
        <>
          <p role="alert" className="t-body text-ink">
            Can’t open this drink · {state.message}
          </p>
          <Link
            href={itemPageHref(itemType, itemId)}
            className="t-body text-act-ink"
          >
            Open the full page
          </Link>
        </>
      )}
    </div>
  );
}
