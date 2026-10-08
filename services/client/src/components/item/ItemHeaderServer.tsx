import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AddToTierListButton } from "@/components/tier-list/AddToTierListButton";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { AddToCellarActions } from "./AddToCellarActions";
import { ItemAppBar } from "./ItemAppBar";

type ItemHeaderServerProps = {
  itemId: string;
  itemName?: string;
  itemType: ApiItemType;
  cellars?: {
    id: string;
    name: string;
  }[];
  /** Kept from the rewrite: the creator's link to the edit page. */
  editHref?: string | null;
};

/**
 * `82450ad1:src/components/item/ItemHeaderServer.tsx`, restored.
 *
 * The header is now `ItemAppBar` (N26): Back, the old breadcrumbs ("Home /
 * Wines / <name>") from `md` up, Share, and the creator-only "Edit item" in
 * `⋯` (D7; decision 2 keeps the edit page, which the old header could not
 * reach). Under it, "Add to Tier List" (the tier-lists wave's restored
 * button) and "Add to Cellar" as before. The old `userId` gate goes: the
 * `(authenticated)` layout guarantees a viewer.
 */
export const ItemHeaderServer = ({
  itemType,
  itemId,
  itemName,
  cellars,
  editHref = null,
}: ItemHeaderServerProps) => {
  return (
    <div className="flex flex-col gap-3">
      <ItemAppBar
        parent="/"
        itemName={itemName ?? "loading..."}
        share={{ itemId, itemType }}
        editHref={editHref}
      />
      {/* Stretch, not items-start: the (still Joy, 36 px) tier-list button
          takes Add to Cellar's 44 px height instead of sitting short beside it. */}
      <div className="flex flex-wrap gap-2">
        <AddToTierListButton
          entityId={itemId}
          entityType={itemType.toLowerCase() as TierListEntityType}
          entityName={itemName ?? "this item"}
        />
        <AddToCellarActions
          itemType={itemType}
          itemId={itemId}
          cellars={cellars}
        />
      </div>
    </div>
  );
};
