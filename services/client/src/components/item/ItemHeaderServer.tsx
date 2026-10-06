import { Stack } from "@mui/joy";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { HeaderBar } from "@/components/common/HeaderBar";
import { AddToTierListButton } from "@/components/tier-list/AddToTierListButton";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { AddToCellarActions } from "./AddToCellarActions";
import { EditItemButton } from "./EditItemButton";

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
 * Breadcrumbs ("Home / Wines / <name>"), "Add to Tier List" (the tier-lists
 * wave's restored button) and "Add to Cellar" as before. The old `userId`
 * gate goes: the `(authenticated)` layout guarantees a viewer. Added: the creator-only "Edit item" (decision 2 keeps the edit
 * page; the old header had no way to reach it).
 */
export const ItemHeaderServer = ({
  itemType,
  itemId,
  itemName,
  cellars,
  editHref = null,
}: ItemHeaderServerProps) => {
  return (
    <HeaderBar
      serverBreadcrumbs={{
        itemName: itemName ?? "loading...",
      }}
      endComponent={
        <Stack spacing={2} direction="row">
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
          {editHref !== null && <EditItemButton href={editHref} enabled />}
        </Stack>
      }
    />
  );
};
