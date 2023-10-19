import { Breadcrumbs, Input, Stack } from "@mui/joy";
import { MdSearch } from "react-icons/md";
import Link from "./Link";
import { ReactNode } from "react";

type HeaderBarProps = {
  breadcrumbs?: { url: string; text: string }[];
  endComponent?: ReactNode;
};

const HeaderBar = ({ breadcrumbs = [], endComponent }: HeaderBarProps) => {
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
        <Input startDecorator={<MdSearch />} placeholder="Search" disabled />
        {endComponent}
      </Stack>
    </Stack>
  );
};

export default HeaderBar;
