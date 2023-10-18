import { Link as MuiLink } from "@mui/joy";
import NextLink from "next/link";
import { ComponentProps, ComponentPropsWithoutRef } from "react";

const Link = (
  props: Omit<
    ComponentPropsWithoutRef<typeof MuiLink<typeof NextLink>>,
    "component"
  >,
) => <MuiLink {...props} component={NextLink} />;

export default Link;
