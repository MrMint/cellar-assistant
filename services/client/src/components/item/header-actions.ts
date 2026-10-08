/**
 * What the item and bottle pages' `⋯` holds (N26, D7; design §2 "Detail
 * screens": Edit, Share, Move and Delete live in `⋯`, Delete last, a confirm
 * behind it). A plain module so the rule is testable without opening a menu
 * that a static render never mounts.
 *
 * - **Edit item** for the item's creator only — `updateItem` refuses anyone
 *   else. The Joy header drew a disabled "Edit item" for everyone else; an
 *   overflow cannot hold a disabled row, so it is left out instead.
 * - **Delete item** on a bottle page, for the cellar's owner only (the Joy
 *   button was disabled for anyone else), and always last.
 *
 * Share is not here: it is the bar's one trailing action (an icon button
 * named "Share"), as `AppBar`'s own example has it.
 */
export type ItemOverflowAction = "edit" | "delete";

export type ItemOverflowEntry = {
  action: ItemOverflowAction;
  label: string;
  destructive?: true;
};

export function itemOverflow({
  editHref,
  canDelete = false,
}: {
  editHref: string | null;
  canDelete?: boolean;
}): ItemOverflowEntry[] {
  const entries: ItemOverflowEntry[] = [];
  if (editHref !== null) entries.push({ action: "edit", label: "Edit item" });
  if (canDelete)
    entries.push({ action: "delete", label: "Delete item", destructive: true });
  return entries;
}
