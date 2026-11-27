/**
 * The kit's own glyphs (KIT § 1 "Kind glyphs", § 2): the six kinds, a place's
 * food and bar kinds, the recipe's tumbler and the owner's crown. Drawn on
 * Lucide's 24 grid and built with `createLucideIcon`, so each is an `AppIcon`
 * and takes the same props (`strokeWidth`, `className`, `aria-hidden`) as
 * the rest of `app/icons.ts`.
 */
import { createLucideIcon, type IconNode } from "lucide-react";

const path = (d: string): IconNode[number] => ["path", { d, key: d }];

export const BeerGlyph = createLucideIcon("kit-beer", [
  path("M5 7h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"),
  path("M15 10h2.5a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H15"),
  path("M8.5 11v5M11.5 11v5"),
  path("M5 7a2.5 2.5 0 0 1 2.5-3h5A2.5 2.5 0 0 1 15 7"),
]);

export const WineGlyph = createLucideIcon("kit-wine", [
  path("M8 3h8v5a4 4 0 0 1-8 0z"),
  path("M12 12v8M8.5 20h7"),
]);

export const SpiritGlyph = createLucideIcon("kit-spirit", [
  path("M4 4h16l-8 9z"),
  path("M12 13v7M8 20h8"),
]);

export const CoffeeGlyph = createLucideIcon("kit-coffee", [
  path("M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"),
  path("M16 9h1.5a2.5 2.5 0 0 1 0 5H16"),
  path("M4 21h13"),
]);

export const TeaGlyph = createLucideIcon("kit-tea", [
  path("M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"),
  path("M16 10h1.5a2.5 2.5 0 0 1 0 5H16"),
  path("M4 21h13M10.5 9V4.5l3 1.5"),
]);

export const SakeGlyph = createLucideIcon("kit-sake", [
  path("M10 3h4v3c2.2 1.6 4 4.2 4 8a6 6 0 0 1-12 0c0-3.8 1.8-6.4 4-8z"),
]);

/** A place that serves food. */
export const FoodGlyph = createLucideIcon("kit-food", [
  path("M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"),
  path("M17 21V3c-2 1-3.5 3.5-3.5 7v3H17"),
]);

/** A bar, and the recipe face's tumbler (KIT amendments: "Recipe face"). */
export const TumblerGlyph = createLucideIcon("kit-tumbler", [
  path("M6 4h12l-1.5 16h-9z"),
  path("M6.6 10h10.8"),
]);

/** The owner's own #1 only (CROSS-LOT ruling 1). Draw it filled. */
export const CrownGlyph = createLucideIcon("kit-crown", [
  path("M4 8.5l4.2 3.6L12 5.5l3.8 6.6L20 8.5 18.6 17H5.4z"),
  path("M5.5 20h13"),
]);

/** A bottle that is open (the tile's "Open · 16%" badge, sort "Least left"). */
export const OpenBottleGlyph = createLucideIcon("kit-open", [
  path("M10 3h4v4l2 3v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-9l2-3z"),
  path("M8 14h8"),
]);
