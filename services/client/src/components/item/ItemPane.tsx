"use client";

import { Link } from "@/components/app/Link";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemPageHref } from "./adapter";

export type ItemPaneProps = {
  itemId: string;
  itemType: ApiItemType;
  /** The cellar the pane opened from, when it opened from one. */
  cellarId?: string;
};

/**
 * The item's body inside the desktop pane (MC-panes, L32). C1 mounts it in
 * F2a's `DesktopPane`; C2 owns this file and replaces this stub's body with
 * the item page's sections at pane width.
 */
export function ItemPane({ itemId, itemType }: ItemPaneProps) {
  return (
    <div className="flex flex-col gap-3 p-4" data-testid="item-pane">
      <Link
        href={itemPageHref(itemType, itemId)}
        className="t-body text-act-ink"
      >
        Open the full page
      </Link>
    </div>
  );
}
