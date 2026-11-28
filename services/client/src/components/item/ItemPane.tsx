"use client";

import { useCallback, useEffect, useState } from "react";
import { useClient, useQuery } from "urql";
import { More } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { GlassDisc } from "@/components/app/overlays/GlassDisc";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemPageHref } from "./adapter";
import { ItemPageQuery } from "./fragments";
import { ItemPageView } from "./ItemPageView";
import { ItemMenu } from "./parts/ItemMenu";
import { type ItemPageData, loadItemPageData } from "./parts/load-item-page";
import { PaneRefreshProvider, paneQuery } from "./parts/pane-refresh";

export type ItemPaneProps = {
  itemId: string;
  itemType: ApiItemType;
  /** The cellar the pane opened from, when it opened from one. */
  cellarId?: string;
  /**
   * H-115: the item's read, when the pane's owner lifted it (so `⋯` in the
   * desktop pane's own glass discs, `ItemPaneMenu`, shares it). Without one
   * the pane reads for itself and keeps its own `⋯`.
   */
  source?: ItemPaneSource;
};

/** What the pane reads: its state, and the re-run a write calls. */
export type ItemPaneSource = { state: State; refresh: () => void };

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: ItemPageData };

/**
 * The item's read for the pane, lifted so a menu beside the pane can use it
 * (H-115). `pause` keeps a pane that was handed a source from reading twice.
 */
export function useItemPaneSource(
  itemId: string,
  itemType: ApiItemType,
  pause = false,
): ItemPaneSource {
  // urql's own hook, so only the answer for the current item lands (the
  // no-to-promise rule). F-156: the lists then read past their first 100
  // through the same client (`paneQuery`; a stale answer is dropped by
  // `live` below), and a write in the pane's sections re-runs this query
  // (`PaneRefreshProvider`), since `router.refresh()` never reaches it.
  const client = useClient();
  const [result, reexecute] = useQuery({
    query: ItemPageQuery,
    variables: { itemId, type: itemType },
    requestPolicy: "cache-and-network",
    pause,
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
    loadItemPageData(paneQuery(client), itemType, itemId, data).then(
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
  }, [client, data, error, itemId, itemType]);

  return { state, refresh };
}

/**
 * The item's body inside the desktop pane (MC-panes, L32): the item page's
 * own sections (`ItemPageView`, `pane`) at pane width — no bar and no bleed,
 * the menu as a plain `⋯` — read in the browser with urql's `useQuery` and
 * the page's own loader (`loadItemPageData`), so the pane and the page never
 * disagree. C1 mounts it in F2a's `DesktopPane`.
 */
export function ItemPane({
  itemId,
  itemType,
  cellarId,
  source,
}: ItemPaneProps) {
  const own = useItemPaneSource(itemId, itemType, source !== undefined);
  const { state, refresh } = source ?? own;
  if (state.phase === "ready") {
    return (
      <PaneRefreshProvider value={refresh}>
        <div
          data-testid="item-pane"
          // H-115: with the menu in the pane's discs, ItemTop's own `⋯` row
          // (the first child of the pane body) is not drawn.
          className={
            source === undefined
              ? undefined
              : "[&_[data-testid=item-pane-body]>:first-child]:hidden"
          }
        >
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

/**
 * H-115: the item's `⋯` as a glass disc for `DesktopPane`'s `more` slot,
 * with the item's menu, from the read the pane's owner lifted.
 */
export function ItemPaneMenu({ source }: { source: ItemPaneSource }) {
  const [open, setOpen] = useState(false);
  const { state, refresh } = source;
  const data = state.phase === "ready" ? state.data : null;
  return (
    <>
      <GlassDisc
        aria-label="More actions"
        aria-haspopup="dialog"
        disabled={data === null}
        onClick={() => setOpen(true)}
      >
        <More aria-hidden />
      </GlassDisc>
      {data !== null && (
        <PaneRefreshProvider value={refresh}>
          <ItemMenu
            open={open}
            onOpenChange={setOpen}
            itemId={data.item.itemId}
            itemType={data.item.type}
            itemName={data.item.name}
            editHref={data.editHref}
            addableCellars={data.addableCellars}
            held={data.bottles.length}
            selected={null}
            myReview={data.item.myReview}
          />
        </PaneRefreshProvider>
      )}
    </>
  );
}
