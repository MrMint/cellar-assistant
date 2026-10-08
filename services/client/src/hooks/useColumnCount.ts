"use client";

import { breakpointUp, useMediaQuery } from "./useMediaQuery";

/**
 * The cellar items grid's column count at the current viewport width, for
 * the virtualizer; `cellarItemsGridClass` is the same rule in CSS, and the
 * two change together:
 *
 *   below sm: 2 · sm: 2 · md: 3 · lg: 4 · xl: 6
 *
 * The restored grid dropped to one column on a phone for six bottles or
 * fewer; with the BottleCard's 3:4 plate (N13b) one column is a single
 * bottle per screen, so a phone always shows two.
 */
export function useColumnCount(): number {
  const isMd = useMediaQuery(breakpointUp("md"));
  const isLg = useMediaQuery(breakpointUp("lg"));
  const isXl = useMediaQuery(breakpointUp("xl"));

  if (isXl) return 6;
  if (isLg) return 4;
  if (isMd) return 3;
  return 2;
}
