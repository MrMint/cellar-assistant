import type { Map as MaplibreMap } from "maplibre-gl";
import { ITEM_TYPE_COLORS } from "../../constants/colors";

// Material Design icon SVG paths (viewBox 0 0 24 24)
const ICON_PATHS: Record<string, string> = {
  // Wine glass — tapered bowl, thin stem, flat base
  "poi-wine":
    "M9 2L7 9c0 2.76 2.24 5 5 5s5-2.24 5-5L15 2zM11 14v5H9v2h6v-2h-2v-5z",
  // MdSportsBar
  "poi-beer":
    "M19 9h-1V4H8v5H6c-1.1 0-2 .9-2 2v5c0 1.1.9 2 2 2h1v2h10v-2h1c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2-2zm-9-3h6v3h-6V6zm9 10c0 .55-.45 1-1 1h-1v-6h1c.55 0 1 .45 1 1v4zm-3 1H10v-7h6v7z",
  // MdLocalBar
  "poi-cocktail":
    "M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7 5.66 5h12.69l-1.78 2H7.43z",
  // MdLiquor
  "poi-spirit":
    "M3 14c0 1.3.84 2.4 2 2.82V20H3v2h6v-2H7v-3.18C8.16 16.4 9 15.3 9 14V6H3v8zm2-6h2v3H5V8zm15.64 1.35l-.85-.85c-.47-.47-1.23-.47-1.7 0l-.85.85c-.47.47-.47 1.24 0 1.71l.01.01H15v3.07c-.83.44-1.38 1.36-1.14 2.43.17.77.76 1.4 1.52 1.61 1.31.36 2.5-.6 2.62-1.83h2v-5.29h-1.85l.01-.01c.46-.47.46-1.23-.01-1.7zM18 15h-2v-2h2v2z",
  // MdLocalCafe
  "poi-coffee":
    "M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.9 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4v-2z",
  // MdRestaurant
  "poi-restaurant":
    "M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z",
  // MdLocalGroceryStore
  "poi-grocery":
    "M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z",
  // MdHotel
  "poi-hotel":
    "M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2V10c0-2.21-1.79-4-4-4z",
  // Default (same as restaurant)
  "poi-default":
    "M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z",
};

// ============================================================================
// Pin marker image generation
// ============================================================================

// Derive pin colors from the single source of truth, plus a "default" entry
const PIN_COLORS: Record<string, string> = {
  ...ITEM_TYPE_COLORS,
  default: "#808080",
};

// Compact teardrop pin (Google Maps proportions)
const PIN_WIDTH = 30;
const PIN_HEIGHT = 37;
const PIN_RENDER_WIDTH = PIN_WIDTH * 2;
const PIN_RENDER_HEIGHT = PIN_HEIGHT * 2;

// Compact teardrop with ~12% shorter tip
const PIN_PATH =
  "M15 0C6.716 0 0 6.716 0 15c0 4.8 10 13.6 12 15.3q3 2.6 6 0C20 28.6 30 19.8 30 15 30 6.716 23.284 0 15 0z";

function buildPinSVG(color: string, iconPath: string): string {
  const circleR = 12;
  const circleCX = 15;
  const circleCY = 14;
  const iconScale = 0.6;
  const iconTranslateX = circleCX - (24 * iconScale) / 2;
  const iconTranslateY = circleCY - (24 * iconScale) / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_RENDER_WIDTH}" height="${PIN_RENDER_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}">`,
    `<defs><filter id="s" x="-20%" y="-10%" width="140%" height="140%">`,
    `<feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="rgba(0,0,0,0.35)"/>`,
    `</filter></defs>`,
    `<path d="${PIN_PATH}" fill="white" stroke="#d0d0d0" stroke-width="0.5" filter="url(#s)"/>`,
    `<circle cx="${circleCX}" cy="${circleCY}" r="${circleR}" fill="${color}"/>`,
    `<g transform="translate(${iconTranslateX}, ${iconTranslateY}) scale(${iconScale})">`,
    `<path d="${iconPath}" fill="white"/>`,
    `</g>`,
    `</svg>`,
  ].join("");
}

function svgToImage(
  svg: string,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(width, height);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Generate and load all composite pin images into the map sprite.
 *
 * Produces (colors x icons) images — currently 7 x 9 = 63 combinations.
 * Each is a data-URI SVG decoded in-memory, no network requests involved.
 */
export async function loadPOIIcons(map: MaplibreMap): Promise<void> {
  const iconEntries = Object.entries(ICON_PATHS);
  const colorEntries = Object.entries(PIN_COLORS);

  const pinPromises = colorEntries.flatMap(([colorKey, colorHex]) =>
    iconEntries.map(async ([iconName, iconPath]) => {
      const pinName = `pin-${colorKey}-${iconName}`;
      if (map.hasImage(pinName)) return;

      const svg = buildPinSVG(colorHex, iconPath);
      const image = await svgToImage(svg, PIN_RENDER_WIDTH, PIN_RENDER_HEIGHT);
      if (!map.hasImage(pinName)) {
        map.addImage(pinName, image, { pixelRatio: 2 });
      }
    }),
  );

  await Promise.all(pinPromises);
}
