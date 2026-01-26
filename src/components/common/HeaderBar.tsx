import { CircularProgress, Stack } from "@mui/joy";
import { isNotNil } from "ramda";
import type { ReactNode } from "react";
import { MdSearch } from "react-icons/md";
import { DebounceInput } from "./DebouncedInput";
import { ServerBreadcrumbs } from "./ServerBreadcrumbs";

type HeaderBarProps = {
  // Server breadcrumbs with optional context
  serverBreadcrumbs?: {
    cellarName?: string;
    itemName?: string;
    recipeName?: string;
  };
  // End component (buttons, actions, etc.)
  endComponent?: ReactNode;
  // Search functionality
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
  defaultSearchValue?: string;
};

export const HeaderBar = ({
  serverBreadcrumbs,
  endComponent,
  isSearching = false,
  onSearchChange,
  defaultSearchValue = "",
}: HeaderBarProps) => {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ justifyContent: "space-between", alignItems: "center" }}
    >
      {serverBreadcrumbs ? (
        <ServerBreadcrumbs
          cellarName={serverBreadcrumbs.cellarName}
          itemName={serverBreadcrumbs.itemName}
          recipeName={serverBreadcrumbs.recipeName}
        />
      ) : (
        <div /> // Spacer when no breadcrumbs
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {isNotNil(onSearchChange) && (
          <DebounceInput
            defaultValue={defaultSearchValue}
            debounceTimeout={300}
            startDecorator={
              !isSearching ? <MdSearch /> : <CircularProgress size="sm" />
            }
            placeholder="Search"
            handleDebounce={onSearchChange}
          />
        )}
        {endComponent}
      </Stack>
    </Stack>
  );
};
