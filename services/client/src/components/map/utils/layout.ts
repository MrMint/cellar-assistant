/**
 * Layout constants and utilities for map drawer offset calculations.
 * Used by MapLibreRenderer and extracted hooks to center flyTo
 * on the visible (unobscured) portion of the map.
 */

export const DETAIL_PANEL_WIDTH = 400;
export const SIDEBAR_WIDTH = 56;
export const MOBILE_NAV_HEIGHT = 50;

/**
 * Compute pixel offset so flyTo centers the place on the visible
 * (unobscured) portion of the map, accounting for the detail panel.
 */
export function getDrawerOffset(
  isDesktop: boolean,
  hasSidebar: boolean,
): [number, number] {
  if (typeof window === "undefined") return [0, 0];

  if (isDesktop) {
    const panelWidth = (hasSidebar ? SIDEBAR_WIDTH : 0) + DETAIL_PANEL_WIDTH;
    return [panelWidth / 2, 0];
  }

  // Mobile: bottom sheet at "half" covers ~50% of available height
  const vh = window.innerHeight;
  const sheetHeight = (vh - MOBILE_NAV_HEIGHT) * 0.5;
  return [0, -(MOBILE_NAV_HEIGHT + sheetHeight) / 2];
}
