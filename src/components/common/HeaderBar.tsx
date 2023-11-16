import { Breadcrumbs, CircularProgress, Stack } from "@mui/joy";
import { ReactNode } from "react";
import { MdSearch } from "react-icons/md";
import { DebounceInput } from "./DebouncedInput";
import Link from "./Link";

type HeaderBarProps = {
  breadcrumbs?: { url: string; text: string }[];
  endComponent?: ReactNode;
  onSearchChange?: (value: string) => void;
  isSearching?: boolean;
};

const HeaderBar = ({
  breadcrumbs = [],
  endComponent,
  isSearching = false,
  onSearchChange = () => {},
}: HeaderBarProps) => {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ justifyContent: "space-between", alignItems: "center" }}
    >
      <Breadcrumbs size="sm">
        {breadcrumbs.map((x) => (
          <Link key={x.text} href={x.url}>
            {x.text}
          </Link>
        ))}
      </Breadcrumbs>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <DebounceInput
          debounceTimeout={300}
          startDecorator={
            !isSearching ? <MdSearch /> : <CircularProgress size="sm" />
          }
          placeholder="Search"
          handleDebounce={onSearchChange}
        />
        {endComponent}
      </Stack>
    </Stack>
  );
};

export default HeaderBar;
