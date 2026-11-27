"use client";

import { useEffect, useState } from "react";
import { useClient } from "urql";
import { Link } from "@/components/app/Link";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemPageHref } from "./adapter";
import { ItemPageView } from "./ItemPageView";
import type { PageQuery } from "./page-lists";
import { type ItemPageData, loadItemPageData } from "./parts/load-item-page";

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
 * the menu as a plain `⋯` — read in the browser through the urql client with
 * the page's own loader (`loadItemPageData`), so the pane and the page never
 * disagree. C1 mounts it in F2a's `DesktopPane`.
 */
export function ItemPane({ itemId, itemType, cellarId }: ItemPaneProps) {
  const client = useClient();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    const query = (async (document, variables) => {
      const result = await client
        .query(document, variables ?? {}, { requestPolicy: "network-only" })
        .toPromise();
      if (result.error !== undefined) throw result.error;
      return result.data;
    }) as PageQuery;
    loadItemPageData(query, itemType, itemId).then(
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
  }, [client, itemId, itemType]);

  if (state.phase === "ready") {
    return (
      <div data-testid="item-pane">
        <ItemPageView
          {...state.data}
          selected={null}
          parent={cellarId === undefined ? "/" : `/cellars/${cellarId}/items`}
          pane
        />
      </div>
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
