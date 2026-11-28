/**
 * What the item page's menu disc holds (Cellars-Pour's menu, CROSS-LOT "Item
 * ⋯ menu"). A plain module so the rules are testable without a sheet:
 *
 * - **Add to a list**, the **add** ("Add another to Home") and **Share** for
 *   everyone; the add is left out when you have no cellar to add to.
 * - **Move to another cellar** for your own bottle on its URL, when you have
 *   another cellar (MC-move, L13).
 * - **Edit details** for the item's creator (D7): `updateItem` refuses anyone
 *   else, so it is left out rather than drawn disabled.
 * - Last, after a rule: **Delete this bottle** for your own bottle, else
 *   **Remove my rating** for an item you rated and own none of (L7). Never
 *   both: owned bottles keep Delete.
 */
export type ItemMenuAction =
  | "list"
  | "add"
  | "share"
  | "move"
  | "edit"
  | "delete"
  | "removeRating";

export type ItemMenuEntry = {
  action: ItemMenuAction;
  label: string;
  /** Sits after the rule, last. */
  last?: true;
  destructive?: true;
};

/** The add's words: the one cellar by name, or the plain verb for several. */
export function addLabel(
  cellars: readonly { id: string; name: string }[],
  held: number,
): string | null {
  const [only, ...rest] = cellars;
  if (only === undefined) return null;
  if (rest.length === 0) {
    return held > 0 ? `Add another to ${only.name}` : `Add to ${only.name}`;
  }
  return held > 0 ? "Add another bottle" : "Add to cellar";
}

export function itemMenu({
  addLabel: add,
  editHref,
  ownedBottle,
  canMove,
  canRemoveRating,
}: {
  addLabel: string | null;
  editHref: string | null;
  /** The bottle the URL names is yours. */
  ownedBottle: boolean;
  /** You have a cellar other than the bottle's. */
  canMove: boolean;
  canRemoveRating: boolean;
}): ItemMenuEntry[] {
  const entries: ItemMenuEntry[] = [{ action: "list", label: "Add to a list" }];
  if (add !== null) entries.push({ action: "add", label: add });
  entries.push({ action: "share", label: "Share" });
  if (ownedBottle && canMove) {
    entries.push({ action: "move", label: "Move to another cellar" });
  }
  if (editHref !== null)
    entries.push({ action: "edit", label: "Edit details" });
  if (ownedBottle) {
    entries.push({
      action: "delete",
      label: "Delete this bottle",
      last: true,
      destructive: true,
    });
  } else if (canRemoveRating) {
    entries.push({
      action: "removeRating",
      label: "Remove my rating",
      last: true,
    });
  }
  return entries;
}
