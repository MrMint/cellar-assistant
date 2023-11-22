import {
  Divider,
  IconButton,
  Sheet,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/joy";
import { ItemType } from "@shared/gql/graphql";
import { useState } from "react";
import { FaBeer, FaCocktail, FaCoffee, FaWineGlass } from "react-icons/fa";

type CellarItemsFilterProps = {
  types?: ItemType[];
  onTypesChange: (types: ItemType[]) => void;
};

export const CellarItemsFilter = ({
  types = [],
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
            <FaBeer />
          </IconButton>
        </Tooltip>
        <Tooltip title="Wine">
          <IconButton value={ItemType.Wine} aria-label="Wine">
            <FaWineGlass />
          </IconButton>
        </Tooltip>
        <Tooltip title="Spirit">
          <IconButton value={ItemType.Spirit} aria-label="Spirit">
            <FaCocktail />
          </IconButton>
        </Tooltip>
        <Tooltip title="Coffee">
          <IconButton value={ItemType.Coffee} aria-label="Coffee">
            <FaCoffee />
          </IconButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Sheet>
  );
};
