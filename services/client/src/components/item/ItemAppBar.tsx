"use client";

import { usePathname } from "next/navigation";
import { AppBar } from "@/components/app/AppBar";
import { Share } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { generateBreadcrumbs } from "@/components/common/breadcrumbs";
import { useItemShare } from "./ItemShare";

export type ItemAppBarProps = {
  /** Where Back goes on a cold deep link (no in-app page behind this one). */
  parent: string;
  /** A visible title (the edit page); the item page leaves it to the hero. */
  title?: string;
  /** For the desktop breadcrumbs, as `ServerBreadcrumbs` took them. */
  cellarName?: string;
  itemName?: string;
  /** Share this item: the bar's trailing action. */
  share?: { itemId: string; itemType: ApiItemType };
};

/**
 * The item and edit pages' header (N26): a real Back, the old crumbs from
 * `md` up (`generateBreadcrumbs`, unchanged) and Share. Client-only because
 * Share is a callback.
 *
 * X09 moved the page's `⋯` (Add to tier list, Share, Edit item, Delete
 * bottle) down into the ActionBar, in the thumb zone, so this bar keeps no
 * overflow of its own — two `⋯` on one screen would be two menus to learn.
 * Share stays here too, as the conventional top-right affordance.
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
}: ItemAppBarProps) {
  const pathname = usePathname();
  const shareItem = useItemShare({
    itemId: share?.itemId ?? "",
    itemType: share?.itemType ?? "WINE",
    itemName,
  });

  return (
    <AppBar
      title={title}
      parent={parent}
      breadcrumbs={generateBreadcrumbs(pathname ?? "", cellarName, itemName)}
      actions={
        share === undefined
          ? []
          : [
              {
                label: "Share",
                icon: Share,
                onSelect: () => void shareItem(),
              },
            ]
      }
    />
  );
}
