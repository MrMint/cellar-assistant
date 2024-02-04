import { Link as MuiLink } from "@mui/joy";
import NextLink from "next/link";
import { ComponentPropsWithoutRef } from "react";

export const Link = (
  props: Omit<
    ComponentPropsWithoutRef<typeof MuiLink<typeof NextLink>>,
    "component"
  >,
) => <MuiLink {...props} component={NextLink} />;
