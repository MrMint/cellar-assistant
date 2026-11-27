"use client";

import { useState } from "react";
import { IconButton } from "@/components/app/IconButton";
import { More } from "@/components/app/icons";
import { ItemAppBar } from "../ItemAppBar";
import { ItemMenu, type ItemMenuProps } from "./ItemMenu";

/**
 * The item page's bar and its menu disc together: Back and `⋯` as glass
 * discs over the hero on a phone, the plain bar with crumbs from `md`. In
 * the desktop pane (`pane`), whose own chrome closes it, only the `⋯`.
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
  return (
    <>
      {pane ? (
        <div className="flex justify-end">
          <IconButton
            aria-label="More actions"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <More aria-hidden />
          </IconButton>
        </div>
      ) : (
        <ItemAppBar
          parent={parent}
          cellarName={cellarName}
          itemName={menu.itemName}
          onMore={() => setOpen(true)}
        />
      )}
      <ItemMenu {...menu} open={open} onOpenChange={setOpen} />
    </>
  );
}
