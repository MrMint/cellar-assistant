/**
 * The app's top-level destinations (KIT § 2 Tab bar, § 3 Desktop) and the
 * rule that decides which one is lit. Shared by `TabBar` (phones) and
 * `SideRail` (from `md` up) so the two can never disagree.
 *
 * The kit draws Cellars, Search, Map, Add, Lists, More and Me. Search is the
 * landing (`/`): the Home tab *is* Search in the settled shell
 * (Shell-Home ruling 2). More is not a route: it opens a sheet (a popover at
 * the rail on desktop) with the destinations that have no tab of their own.
 * Me is the viewer's avatar.
 *
 * No `"use client"`: plain data and pure functions, importable from either
 * side of the boundary.
 */
import {
  Add,
  type AppIcon,
  Cellar,
  Lists,
  MapIcon,
  Me,
  More,
  Search,
} from "./icons";

export type TabKey = "cellars" | "search" | "map" | "lists" | "me";

export type Tab = {
  key: TabKey;
  label: string;
  href: string;
  icon: AppIcon;
  /** The desktop rail's key, shown in its tooltip ("G C", "/"). */
  keys: string;
  /**
   * Path prefixes that light this tab, beyond `href` itself: recipes and
   * brands light Cellars, places light Map, rankings light Lists, and the Me
   * hub's own pages (loved, want to try, friends, taste profile) light Me.
   */
  also: readonly string[];
  /**
   * Where a tap goes when this tab is already showing its root, scrolled to
   * the top — the one tap that would otherwise do nothing. Search at the
   * landing focuses the full search (X10).
   */
  rootTap?: string;
};

/** The five route tabs, in bar order. Add sits after Map; More after Lists. */
export const TABS: readonly Tab[] = [
  {
    key: "cellars",
    label: "Cellars",
    href: "/cellars",
    icon: Cellar,
    keys: "G C",
    also: ["/recipes", "/brands"],
  },
  {
    key: "search",
    label: "Search",
    href: "/",
    icon: Search,
    keys: "/",
    also: ["/search"],
    rootTap: "/search",
  },
  {
    key: "map",
    label: "Map",
    href: "/map",
    icon: MapIcon,
    keys: "M",
    // `/discoveries` went to the landing (X10) and redirects there.
    also: ["/places"],
  },
  {
    key: "lists",
    label: "Lists",
    href: "/tier-lists",
    icon: Lists,
    keys: "G L",
    also: ["/rankings"],
  },
  {
    key: "me",
    label: "Me",
    href: "/me",
    icon: Me,
    keys: "G M",
    also: [
      "/favorites",
      "/want-to-try",
      "/friends",
      "/users",
      "/taste-profile",
    ],
  },
];

/** The tabs before Add (Cellars, Search, Map) and after it (Lists). Me is apart. */
export const LEADING_TABS = TABS.slice(0, 3);
export const TRAILING_TABS = TABS.slice(3, 4);
export const ME_TAB = TABS[4] as Tab;

/** More: a sheet, not a route (KIT § 2). Its key on desktop is "G O". */
export const MORE = { label: "More", icon: More, keys: "G O" } as const;

/**
 * The destinations with no tab of their own, listed in More. H1 takes the
 * More menu over after wave 1 (L42).
 */
export const MORE_LINKS: readonly { label: string; href: string }[] = [
  { label: "Recipes", href: "/recipes" },
  { label: "Rankings", href: "/rankings" },
  { label: "Friends", href: "/friends" },
  { label: "Taste profile", href: "/taste-profile" },
  { label: "Your recap", href: "/recap" },
];

/** Add's key on desktop. */
export const ADD_KEYS = "N";

/** Whether `pathname` is `prefix` or below it (`/map` matches `/map/scans`, not `/mapx`). */
export const isUnder = (pathname: string, prefix: string): boolean =>
  prefix === "/"
    ? pathname === "/"
    : pathname === prefix || pathname.startsWith(`${prefix}/`);

/** The tab a route belongs to, or `undefined` for routes outside the tabs. */
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
