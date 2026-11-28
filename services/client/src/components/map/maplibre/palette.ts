import {
  color as dark,
  itemTypeColor,
  itemTypeColorLight,
  light,
  type Palette,
} from "@/lib/tokens";
import type { PlaceKind } from "../core/map-places";

/**
 * The map's colours, from the kit's tokens (L23): MapLibre paint and the pin
 * sprites cannot read a CSS variable, so they read `lib/tokens`, the values
 * `globals.css` mirrors, in the theme the map is drawn in. Nothing here is a
 * raw colour; a token change reaches the map.
 */
export type MapTheme = "dark" | "light";

export type MapPalette = {
  theme: MapTheme;
  /** The pin's body and a cluster's disc: the card surface. */
  pinBody: string;
  /** A cluster's ring and count. */
  clusterRim: string;
  clusterInk: string;
  /** Each kind's ring and glyph (Map board: pins coloured by kind). */
  kind: Readonly<Record<PlaceKind, string>>;
  /** Pin labels and their halo. */
  label: string;
  labelHover: string;
  halo: string;
  /** The pin's drop shadow. */
  shadow: string;
  /** "You are here" and its ring. */
  here: string;
  hereRing: string;
  /** The want-to-try badge. */
  badgeBody: string;
  badgeInk: string;
};

/**
 * Kinds by hue, taken from the type hues so the map shares the app's: coffee
 * its own, bar the cool sake hue, food the wine hue; anything else the glyph
 * colour. `text` tones: they are drawn as thin rings and glyphs on the card.
 */
export function mapPalette(theme: MapTheme): MapPalette {
  const p: Palette = theme === "light" ? light : dark;
  const hues = theme === "light" ? itemTypeColorLight : itemTypeColor;
  return {
    theme,
    pinBody: p.surface1,
    clusterRim: p.edge2,
    clusterInk: p.ink1,
    kind: {
      coffee: hues.COFFEE.text,
      bar: hues.SAKE.text,
      food: hues.WINE.text,
      other: p.glyph,
    },
    label: p.ink1,
    labelHover: p.actInk,
    halo: p.bg,
    shadow: dark.bg,
    here: p.here,
    hereRing: p.onGlass,
    badgeBody: p.bg,
    badgeInk: p.ink1,
  };
}
