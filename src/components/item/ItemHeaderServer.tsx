import type { ItemTypeValue } from "@cellar-assistant/shared";
import { Stack } from "@mui/joy";
import { HeaderBar } from "@/components/common/HeaderBar";
import { AddToCellarActions } from "./AddToCellarActions";

type ItemHeaderServerProps = {
  itemId: string;
  itemName?: string;
  itemType: ItemTypeValue;
  cellars?: {
    id: string;
    name: string;
  }[];
};

export const ItemHeaderServer = ({
  itemType,
  itemId,
  itemName,
  cellars,
}: ItemHeaderServerProps) => {
  return (
    <HeaderBar
      serverBreadcrumbs={{
        itemName: itemName ?? "loading...",
      }}
      endComponent={
        <Stack spacing={2} direction="row">
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
