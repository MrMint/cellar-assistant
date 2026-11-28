"use client";

import { useState } from "react";
import { ItemAppBar } from "../ItemAppBar";
import { ItemMenu, type ItemMenuProps } from "./ItemMenu";

/**
 * The item page's bar and its menu disc together: Back and `⋯` as glass
 * discs over the hero on a phone, the plain bar with crumbs from `md`. In
 * the desktop pane (`pane`) it draws nothing: the pane's own chrome closes
 * it, and `ItemPane` draws the item's `⋯` (H-136).
 */
export function ItemTop({
  parent,
  cellarName,
  pane = false,
  ...menu
}: Omit<ItemMenuProps, "open" | "onOpenChange"> & {
  parent: string;
  cellarName?: string;
  pane?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (pane) return null;
  return (
    <>
      <ItemAppBar
        parent={parent}
        cellarName={cellarName}
        itemName={menu.itemName}
        onMore={() => setOpen(true)}
      />
      <ItemMenu {...menu} open={open} onOpenChange={setOpen} />
    </>
  );
}
