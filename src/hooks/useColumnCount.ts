"use client";

import { breakpointUp, useMediaQuery } from "./useMediaQuery";

/**
 * Returns the number of columns in the cellar items grid based on current
 * viewport width. Mirrors the MUI Joy Grid breakpoints:
 *   xs: 6/12 = 2 cols (or 1 if <=6 items)
 *   sm: 6/12 = 2 cols
 *   md: 4/12 = 3 cols
 *   lg: 3/12 = 4 cols
 *   xl: 2/12 = 6 cols
 */
export function useColumnCount(itemCount: number): number {
  const isSm = useMediaQuery(breakpointUp("sm"));
  const isMd = useMediaQuery(breakpointUp("md"));
  const isLg = useMediaQuery(breakpointUp("lg"));
  const isXl = useMediaQuery(breakpointUp("xl"));

  if (isXl) return 6;
  if (isLg) return 4;
  if (isMd) return 3;
  if (isSm) return 2;
  return itemCount > 6 ? 2 : 1;
}
