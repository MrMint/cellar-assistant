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
import {
  FaBeer,
  FaCocktail,
  FaCoffee,
  FaGlassWhiskey,
  FaWineGlass,
} from "react-icons/fa";

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
              <FaBeer />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Wine">
          <IconButton value={"WINE"} aria-label="Wine">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.wines) && (
                <Typography>{counts.wines}</Typography>
              )}
              <FaWineGlass />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Spirit">
          <IconButton value={"SPIRIT"} aria-label="Spirit">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.spirits) && (
                <Typography>{counts.spirits}</Typography>
              )}
              <FaCocktail />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Coffee">
          <IconButton value={"COFFEE"} aria-label="Coffee">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.coffees) && (
                <Typography>{counts.coffees}</Typography>
              )}
              <FaCoffee />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Sake">
          <IconButton value={"SAKE"} aria-label="Sake">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.sakes) && (
                <Typography>{counts.sakes}</Typography>
              )}
              <FaGlassWhiskey />
            </Stack>
          </IconButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Sheet>
  );
};
