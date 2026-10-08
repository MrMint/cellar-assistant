"use client";

import { usePathname, useRouter } from "next/navigation";
import { AppBar, type AppBarOverflowItem } from "@/components/app/AppBar";
import { Share } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { generateBreadcrumbs } from "@/components/common/breadcrumbs";
import { itemOverflow } from "./header-actions";
import { ItemShareDialog, useItemShare } from "./ItemShare";

export type ItemAppBarProps = {
  /** Where Back goes on a cold deep link (no in-app page behind this one). */
  parent: string;
  /** A visible title (the edit page); the item pages leave it to the hero. */
  title?: string;
  /** For the desktop breadcrumbs, as `ServerBreadcrumbs` took them. */
  cellarName?: string;
  itemName?: string;
  /** Share this item: the bar's trailing action. */
  share?: { itemId: string; itemType: ApiItemType };
  /** The creator's edit page: "Edit item" in `⋯`. */
  editHref?: string | null;
  /** "Delete item" in `⋯`, last (a bottle page, for the cellar's owner). */
  onDelete?: () => void;
};

/**
 * The item, bottle and edit pages' header (N26) — what `HeaderBar` with
 * `ServerBreadcrumbs` was: a real Back, the old crumbs from `md` up
 * (`generateBreadcrumbs`, unchanged), Share, and `⋯` with Edit and Delete
 * (`itemOverflow`). Client-only because the overflow's rows are callbacks.
 *
 * No title on the item and bottle pages: the details card right under it
 * carries the name as the page's heading, and a second heading with the same
 * name would only be read twice.
 */
export function ItemAppBar({
  parent,
  title,
  cellarName,
  itemName,
  share,
  editHref = null,
  onDelete,
}: ItemAppBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sharing = useItemShare({
    itemId: share?.itemId ?? "",
    itemType: share?.itemType ?? "WINE",
  });

  const overflow: AppBarOverflowItem[] = itemOverflow({
    editHref,
    canDelete: onDelete !== undefined,
  }).map(({ action, label, destructive }) => ({
    label,
    destructive,
    onSelect:
      action === "edit"
        ? () => {
            if (editHref !== null) router.push(editHref);
          }
        : () => onDelete?.(),
  }));

  return (
    <>
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
                  onSelect: () => void sharing.share(),
                },
              ]
        }
        overflow={overflow}
      />
      {share !== undefined && (
        <ItemShareDialog
          open={sharing.open}
          onOpenChange={sharing.setOpen}
          url={sharing.url}
        />
      )}
    </>
  );
}
