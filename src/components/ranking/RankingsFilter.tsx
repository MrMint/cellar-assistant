import { IconButton, Sheet, ToggleButtonGroup, Tooltip } from "@mui/joy";
import { MdGroup, MdPerson } from "react-icons/md";

export enum RankingsFilterValue {
  ME = "ME",
  FRIENDS = "FRIENDS",
}

type RankingsFilterProps = {
  types?: RankingsFilterValue[];
  onTypesChange: (types: RankingsFilterValue[]) => void;
};

export const RankingsFilter = ({
  types = [],
  onTypesChange,
}: RankingsFilterProps) => {
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
        <Tooltip title="Your Scores">
          <IconButton value={RankingsFilterValue.ME} aria-label="Your Scores">
            <MdPerson />
          </IconButton>
        </Tooltip>
        <Tooltip title="Friends Scores">
          <IconButton
            value={RankingsFilterValue.FRIENDS}
            aria-label="Friends Scores"
          >
            <MdGroup />
          </IconButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Sheet>
  );
};
