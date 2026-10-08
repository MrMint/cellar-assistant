/**
 * Layout constants and utilities for map drawer offset calculations.
 * Used by MapLibreRenderer and extracted hooks to center flyTo
 * on the visible (unobscured) portion of the map.
 */

import type { ViewportInsets } from "../hooks/useViewportInsets";

export const DETAIL_PANEL_WIDTH = 400;
/** The old shell's rail and bar: only a fallback until the map is measured. */
export const SIDEBAR_WIDTH = 56;
export const MOBILE_NAV_HEIGHT = 50;

/**
 * The flyTo offset that centres a place on the part of the map the detail
 * panel (desktop) or the half-open sheet (mobile) leaves visible.
 *
 * With `insets` (the map's own box, `useViewportInsets`) the map ends where
 * the rail and the tab bar begin, and the drawer is placed against that box
 * (`PlaceDetailsDrawer`): the panel covers the map's first 400 px, and the
 * half sheet the bottom half of the map's height. Without them — before the
 * first measurement — the old shell's geometry, in which the map ran under a
 * 56 px rail and a 50 px bar.
 */
export function drawerOffsetFor({
  isDesktop,
  hasSidebar,
  viewportHeight,
  insets,
}: {
  isDesktop: boolean;
  hasSidebar: boolean;
  viewportHeight: number;
  insets?: ViewportInsets | null;
}): [number, number] {
  if (insets) {
    if (isDesktop) return [DETAIL_PANEL_WIDTH / 2, 0];
    const sheetHeight = (viewportHeight - insets.bottom) * 0.5;
    return [0, -sheetHeight / 2];
  }

  if (isDesktop) {
    const panelWidth = (hasSidebar ? SIDEBAR_WIDTH : 0) + DETAIL_PANEL_WIDTH;
    return [panelWidth / 2, 0];
  }

  // Mobile: bottom sheet at "half" covers ~50% of available height
  const sheetHeight = (viewportHeight - MOBILE_NAV_HEIGHT) * 0.5;
  return [0, -(MOBILE_NAV_HEIGHT + sheetHeight) / 2];
}

/**
 * Compute pixel offset so flyTo centers the place on the visible
 * (unobscured) portion of the map, accounting for the detail panel.
 */
export function getDrawerOffset(
  isDesktop: boolean,
  hasSidebar: boolean,
  insets?: ViewportInsets | null,
): [number, number] {
  if (typeof window === "undefined") return [0, 0];
  return drawerOffsetFor({
    isDesktop,
    hasSidebar,
    viewportHeight: window.innerHeight,
    insets,
  });
}
