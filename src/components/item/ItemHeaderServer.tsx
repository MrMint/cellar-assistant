import type { ItemTypeValue } from "@cellar-assistant/shared";
import { Stack } from "@mui/joy";
import { HeaderBar } from "@/components/common/HeaderBar";
import { AddToTierListButton } from "@/components/tier-list/AddToTierListButton";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { AddToCellarActions } from "./AddToCellarActions";

type ItemHeaderServerProps = {
  itemId: string;
  itemName?: string;
  itemType: ItemTypeValue;
  userId?: string;
  cellars?: {
    id: string;
    name: string;
  }[];
};

export const ItemHeaderServer = ({
  itemType,
  itemId,
  itemName,
  userId,
  cellars,
}: ItemHeaderServerProps) => {
  return (
    <HeaderBar
      serverBreadcrumbs={{
        itemName: itemName ?? "loading...",
      }}
      endComponent={
        <Stack spacing={2} direction="row">
          {userId && (
            <AddToTierListButton
              entityId={itemId}
              entityType={itemType.toLowerCase() as TierListEntityType}
              entityName={itemName ?? "this item"}
              userId={userId}
            />
          )}
          <AddToCellarActions
            itemType={itemType}
            itemId={itemId}
            cellars={cellars}
          />
        </Stack>
      }
    />
  );
};
