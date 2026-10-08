/**
 * The basemap (N22).
 *
 * Dark by default (D21: the app is dark, and the light CARTO "voyager" map was
 * the one bright surface in it). The map machine's `isDarkMode` starts true;
 * the map controls still switch to the light style.
 *
 * Before a style's first frame the WebGL canvas is transparent, so whatever
 * sits behind it shows — which was the cream flash on opening the map. The
 * container is painted with the theme's surface colour instead
 * ({@link MAP_CANVAS_BACKGROUND}), so the first frame is the app's own dark.
 */

export const CARTO_LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
export const CARTO_DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const basemapStyle = (isDarkMode: boolean): string =>
  isDarkMode ? CARTO_DARK_STYLE : CARTO_LIGHT_STYLE;

/** The surface token, as a CSS value MapLibre's container can take. */
export const MAP_CANVAS_BACKGROUND = "var(--ca-surface-1)";
