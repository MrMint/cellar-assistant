"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppBar, type AppBarAction } from "@/components/app/AppBar";
import { More, ShareOut } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { generateBreadcrumbs } from "@/components/common/breadcrumbs";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { ItemShareSheet } from "./ItemShare";

export type ItemAppBarProps = {
  /** Where Back goes on a cold deep link (no in-app page behind this one). */
  parent: string;
  /** A visible title (the edit page); the item page leaves it to the hero. */
  title?: string;
  /** For the desktop breadcrumbs, as `ServerBreadcrumbs` took them. */
  cellarName?: string;
  itemName?: string;
  /** Share this item (the edit page): opens the share sheet with its QR. */
  share?: { itemId: string; itemType: ApiItemType };
  /**
   * The item page's menu disc: when set, the bar's one action is `⋯`, and
   * below `md` the bar floats over the hero photo as glass discs.
   */
  onMore?: () => void;
};

/**
 * The item and edit pages' header (N26): a real Back, the old crumbs from
 * `md` up (`generateBreadcrumbs`, unchanged) and one trailing action.
 *
 * On the item page that action is the menu disc (Cellars-Pour's menu, with
 * Share in it), and on a phone the bar is the hero's glass discs (KIT § 2
 * "Top bar and discs"). From `md` it is the plain bar with the crumbs.
 *
 * No title on the item page: the hero under it carries the name as the
 * page's heading, and a second heading with the same name would only be
 * read twice.
 */
export function ItemAppBar({
  parent,
  title,
  cellarName,
  itemName,
  share,
  onMore,
}: ItemAppBarProps) {
  const pathname = usePathname();
  const desktop = useMediaQuery(breakpointUp("md"));
  const [sharing, setSharing] = useState(false);

  const action: AppBarAction | undefined =
    onMore !== undefined
      ? { label: "More actions", icon: More, onSelect: onMore }
      : share !== undefined
        ? { label: "Share", icon: ShareOut, onSelect: () => setSharing(true) }
        : undefined;

  return (
    <>
      <AppBar
        title={title}
        parent={parent}
        tone={onMore !== undefined && !desktop ? "photo" : "page"}
        breadcrumbs={generateBreadcrumbs(pathname ?? "", cellarName, itemName)}
        actions={[action]}
      />
      {share !== undefined && onMore === undefined && (
        <ItemShareSheet
          open={sharing}
          onOpenChange={setSharing}
          itemId={share.itemId}
          itemType={share.itemType}
          itemName={itemName ?? title ?? "This drink"}
        />
      )}
    </>
  );
}
