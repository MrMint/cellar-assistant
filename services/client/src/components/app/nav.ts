/**
 * The app's top-level destinations (D1, design-direction.md §2) and the rule
 * that decides which one is lit. Shared by `TabBar` (phones) and `SideRail`
 * (from `sm` up) so the two can never disagree.
 *
 * No `"use client"`: plain data and pure functions, importable from either
 * side of the boundary.
 */
import { Add, type AppIcon, Cellar, Home, MapIcon, Me } from "./icons";

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
  /**
   * Where a tap goes when this tab is already showing its root, scrolled to
   * the top — the one tap that would otherwise do nothing. Home opens search
   * (X10: "the tab bar search"), the way a phone's own apps do.
   */
  rootTap?: string;
};

/** The four tabs, in bar order; the capture ＋ sits between Cellar and Map. */
export const TABS: readonly Tab[] = [
  /**
   * `/` is Home's own page since X10 ("Today"). Search is a full-screen
   * sheet reached from Home — its field, or a tap on Home at the top — so
   * `/search` lights Home too.
   */
  {
    key: "home",
    label: "Home",
    href: "/",
    icon: Home,
    also: ["/search"],
    rootTap: "/search",
  },
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
    // `/discoveries` went to Home's Waiting on you (X10) and redirects there.
    also: ["/places"],
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

/**
 * Where ＋ goes (X06): the full-screen capture surface — the camera, with the
 * mode row Bottle · Menu · Recipe opening on the last mode used. It replaced
 * X01's chooser sheet; a place is added from the map.
 */
export const CAPTURE_HREF = "/add";

/** The per-type cellar add routes' segments (`/cellars/[id]/wines/add`). */
const CAPTURE_TYPE_SEGMENTS = "items|wines|beers|spirits|coffees|sakes|teas";
const CELLAR_CAPTURE = new RegExp(
  `^/cellars/[^/]+/(?:${CAPTURE_TYPE_SEGMENTS})/add/?$`,
);

/**
 * Routes that are the capture surface, where the tab bar steps aside
 * (design §2: "It hides only in capture"): `/add` and below, and a cellar's
 * own add pages. Not `/cellars/add` (a form for a new cellar) or
 * `/tier-lists/add`.
 */
export const isCaptureRoute = (pathname: string): boolean =>
  isUnder(pathname, CAPTURE_HREF) || CELLAR_CAPTURE.test(pathname);

/** The capture button's own glyph. */
export const CaptureIcon = Add;
