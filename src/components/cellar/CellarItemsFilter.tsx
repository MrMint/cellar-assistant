import type { ItemTypeValue } from "@cellar-assistant/shared";
import {
  IconButton,
  Sheet,
  Stack,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/joy";
import { isNotNil } from "ramda";
import { ItemTypeIcon } from "@/components/common/ItemTypeIcon";

type CellarItemsFilterProps = {
  types?: ItemTypeValue[];
  counts?: {
    beers?: number;
    wines?: number;
    spirits?: number;
    coffees?: number;
    sakes?: number;
  };
  onTypesChange: (types: ItemTypeValue[]) => void;
};

export const CellarItemsFilter = ({
  types = [],
  counts = {},
  onTypesChange,
}: CellarItemsFilterProps) => {
  return (
    <Sheet
      variant="outlined"
      sx={{ borderRadius: "md", display: "flex", gap: 2, p: 0.5 }}
    >
      <ToggleButtonGroup
        variant="plain"
        spacing={0.5}
        value={types}
        onChange={(_event, newTypes) => {
          onTypesChange(newTypes);
        }}
        aria-label="text formatting"
      >
        <Tooltip title="Beer">
          <IconButton value={"BEER"} aria-label="Beer">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.beers) && (
                <Typography>{counts.beers}</Typography>
              )}
              <ItemTypeIcon type="BEER" />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Wine">
          <IconButton value={"WINE"} aria-label="Wine">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.wines) && (
                <Typography>{counts.wines}</Typography>
              )}
              <ItemTypeIcon type="WINE" />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Spirit">
          <IconButton value={"SPIRIT"} aria-label="Spirit">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.spirits) && (
                <Typography>{counts.spirits}</Typography>
              )}
              <ItemTypeIcon type="SPIRIT" />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Coffee">
          <IconButton value={"COFFEE"} aria-label="Coffee">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.coffees) && (
                <Typography>{counts.coffees}</Typography>
              )}
              <ItemTypeIcon type="COFFEE" />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Sake">
          <IconButton value={"SAKE"} aria-label="Sake">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.sakes) && (
                <Typography>{counts.sakes}</Typography>
              )}
              <ItemTypeIcon type="SAKE" />
            </Stack>
          </IconButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Sheet>
  );
};
