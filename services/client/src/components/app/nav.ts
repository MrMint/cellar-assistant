/**
 * The app's top-level destinations (D1, design-direction.md §2) and the rule
 * that decides which one is lit. Shared by `TabBar` (phones) and `SideRail`
 * (from `sm` up) so the two can never disagree.
 *
 * No `"use client"`: plain data and pure functions, importable from either
 * side of the boundary.
 */
import {
  Add,
  AddPlace,
  type AppIcon,
  Camera,
  Cellar,
  Cocktail,
  Home,
  MapIcon,
  Me,
  Scan,
} from "./icons";

export type TabKey = "home" | "cellar" | "map" | "me";

export type Tab = {
  key: TabKey;
  label: string;
  href: string;
  icon: AppIcon;
  /**
   * Path prefixes that light this tab, beyond `href` itself. Until the IA
   * clean-up (X01) moves them, destinations reached from the Me hub light
   * Me, Recipes light Cellar (its "Bar" segment), places light Map.
   */
  also: readonly string[];
};

/** The four tabs, in bar order; the capture ＋ sits between Cellar and Map. */
export const TABS: readonly Tab[] = [
  { key: "home", label: "Home", href: "/", icon: Home, also: ["/search"] },
  {
    key: "cellar",
    label: "Cellar",
    href: "/cellars",
    icon: Cellar,
    also: ["/recipes"],
  },
  {
    key: "map",
    label: "Map",
    href: "/map",
    icon: MapIcon,
    also: ["/places", "/discoveries"],
  },
  {
    key: "me",
    label: "Me",
    href: "/me",
    icon: Me,
    also: [
      "/tier-lists",
      "/rankings",
      "/favorites",
      "/want-to-try",
      "/friends",
      "/users",
      "/brands",
    ],
  },
];

/** Whether `pathname` is `prefix` or below it (`/map` matches `/map/scans`, not `/mapx`). */
export const isUnder = (pathname: string, prefix: string): boolean =>
  prefix === "/"
    ? pathname === "/"
    : pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The tab a route belongs to, or `undefined` for routes outside the four. */
export function activeTab(pathname: string): TabKey | undefined {
  return TABS.find(
    (tab) =>
      isUnder(pathname, tab.href) ||
      tab.also.some((prefix) => isUnder(pathname, prefix)),
  )?.key;
}

export type CaptureOption = {
  key: "bottle" | "menu" | "recipe" | "place";
  label: string;
  description: string;
  href: string;
  icon: AppIcon;
};

/**
 * What ＋ offers (X01 chooser), each leading into today's flow. X06 later
 * replaces the chooser with the full-screen capture surface.
 */
export const CAPTURE_OPTIONS: readonly CaptureOption[] = [
  {
    key: "bottle",
    label: "Bottle",
    description: "Snap a label or scan a barcode",
    href: "/add",
    icon: Camera,
  },
  {
    key: "menu",
    label: "Menu",
    description: "Pick the place on the map, then scan its menu",
    href: "/map",
    icon: Scan,
  },
  {
    key: "recipe",
    label: "Recipe",
    description: "Write one or let AI draft it",
    href: "/recipes/ai-generator",
    icon: Cocktail,
  },
  {
    key: "place",
    label: "Place",
    description: "Add a bar, shop or restaurant",
    href: "/map/create-place",
    icon: AddPlace,
  },
];

/** The capture button's own glyph. */
export const CaptureIcon = Add;
