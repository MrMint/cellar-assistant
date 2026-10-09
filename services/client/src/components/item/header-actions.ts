/**
 * What the item page's `⋯` holds (X09: the ActionBar's overflow; design §2
 * "Detail screens": Edit, Share and Delete live in `⋯`, Delete last, with a
 * confirm behind it). A plain module so the rule is testable without opening
 * a sheet that a static render never mounts.
 *
 * - **Add to tier list** and **Share** for everyone — the old header's
 *   buttons, moved under the thumb.
 * - **Edit item** for the item's creator only (D7) — `updateItem` refuses
 *   anyone else, so it is left out rather than drawn disabled.
 * - **Delete bottle** only on a bottle's URL, for that cellar's owner, and
 *   always last. The catalog item itself has no delete.
 */
export type ItemOverflowAction = "tierList" | "share" | "edit" | "delete";

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
  const entries: ItemOverflowEntry[] = [
    { action: "tierList", label: "Add to tier list" },
    { action: "share", label: "Share" },
  ];
  if (editHref !== null) entries.push({ action: "edit", label: "Edit item" });
  if (canDelete)
    entries.push({
      action: "delete",
      label: "Delete bottle",
      destructive: true,
    });
  return entries;
}
