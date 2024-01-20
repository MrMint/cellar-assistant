import {
  IconButton,
  Sheet,
  Stack,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/joy";
import { ItemType } from "@shared/gql/graphql";
import { isNotNil } from "ramda";
import { FaBeer, FaCocktail, FaCoffee, FaWineGlass } from "react-icons/fa";

type CellarItemsFilterProps = {
  types?: ItemType[];
  counts?: {
    beers?: number;
    wines?: number;
    spirits?: number;
    coffees?: number;
  };
  onTypesChange: (types: ItemType[]) => void;
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
        onChange={(event, newTypes) => {
          onTypesChange(newTypes);
        }}
        aria-label="text formatting"
      >
        <Tooltip title="Beer">
          <IconButton value={ItemType.Beer} aria-label="Beer">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.beers) && (
                <Typography>{counts.beers}</Typography>
              )}
              <FaBeer />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Wine">
          <IconButton value={ItemType.Wine} aria-label="Wine">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.wines) && (
                <Typography>{counts.wines}</Typography>
              )}
              <FaWineGlass />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Spirit">
          <IconButton value={ItemType.Spirit} aria-label="Spirit">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.spirits) && (
                <Typography>{counts.spirits}</Typography>
              )}
              <FaCocktail />
            </Stack>
          </IconButton>
        </Tooltip>
        <Tooltip title="Coffee">
          <IconButton value={ItemType.Coffee} aria-label="Coffee">
            <Stack direction="row" gap={0.5} alignItems="center">
              {isNotNil(counts.coffees) && (
                <Typography>{counts.coffees}</Typography>
              )}
              <FaCoffee />
            </Stack>
          </IconButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Sheet>
  );
};
