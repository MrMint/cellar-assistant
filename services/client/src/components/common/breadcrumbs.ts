/**
 * The pathname → crumbs rule from `82450ad1:src/components/common/ServerBreadcrumbs.tsx`,
 * lifted into a plain module so it is testable and importable from a server
 * component (a value import out of a `"use client"` module is what
 * `client-boundary.test.ts` forbids). Logic unchanged except `ITEM_SEGMENTS`.
 */

import { activeTab, TABS } from "@/components/app/nav";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

/**
 * The six item-type route segments. The old list stopped at four
 * (`beers`, `wines`, `spirits`, `coffees`) because sake and tea came later and
 * the breadcrumbs were never updated, so `/sakes/<id>` lost its item crumb.
 * Restored with all six — the same omission class as §7's "Rankings had no
 * sake or tea fragments".
 */
const ITEM_SEGMENTS = ["beers", "wines", "spirits", "coffees", "sakes", "teas"];

export function generateBreadcrumbs(
  pathname: string,
  cellarName?: string,
  itemName?: string,
  recipeName?: string,
): BreadcrumbSegment[] {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: BreadcrumbSegment[] = [{ label: "Home", href: "/" }];

  if (segments.length === 0) return breadcrumbs;

  // Handle authenticated routes (skip the "(authenticated)" segment)
  let segmentIndex = 0;
  if (segments[0] === "(authenticated)") {
    segmentIndex = 1;
  }

  for (let i = segmentIndex; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;

    // Build href up to current segment
    const href = `/${segments.slice(segmentIndex, i + 1).join("/")}`;

    if (segment === "cellars") {
      breadcrumbs.push({ label: "Cellars", href: isLast ? undefined : href });
    } else if (
      segment.match(/^[0-9a-f-]{36}$/i) &&
      segments[i - 1] === "cellars"
    ) {
      // Cellar ID → `/cellars/{id}/items`, the old target (82450ad1, whose
      // `/cellars/[cellarId]` page only printed the id). That route now
      // exists as a new-only overview (UI parity decision 2, pending the
      // user's ratification); until it is ratified the crumb keeps the old
      // behaviour and goes to the item list.
      const label = cellarName || "Cellar";
      breadcrumbs.push({ label, href: isLast ? undefined : `${href}/items` });
    } else if (ITEM_SEGMENTS.includes(segment)) {
      // Check if this is a cellar item path (cellars/{id}/spirits/{id}) vs standalone item path (spirits/{id})
      const isCellarItemPath = segments.some(
        (s, idx) => s === "cellars" && idx < i,
      );

      if (!isCellarItemPath) {
        // Only add item type breadcrumb for standalone item pages, not cellar
        // item pages. A label, never a link: D7 removed the `/{type}s` index
        // pages, so `/wines` is a not-found and a crumb to it would be a
        // dead end.
        const label = segment.charAt(0).toUpperCase() + segment.slice(1);
        breadcrumbs.push({ label });
      }
    } else if (
      segment.match(/^[0-9a-f-]{36}$/i) &&
      ITEM_SEGMENTS.includes(segments[i - 1])
    ) {
      // Item ID
      const label = itemName || "Item";
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    } else if (segment === "edit") {
      breadcrumbs.push({ label: "Edit" });
    } else if (segment === "add") {
      breadcrumbs.push({ label: "Add" });
    } else if (segment === "favorites") {
      // D1/D27: favourites are "Loved" everywhere a person reads them.
      breadcrumbs.push({ label: "Loved", href: isLast ? undefined : href });
    } else if (segment === "want-to-try") {
      breadcrumbs.push({
        label: "Want to try",
        href: isLast ? undefined : href,
      });
    } else if (segment === "friends") {
      breadcrumbs.push({ label: "Friends", href: isLast ? undefined : href });
    } else if (segment === "rankings") {
      breadcrumbs.push({ label: "Rankings", href: isLast ? undefined : href });
    } else if (segment === "tier-lists") {
      // Title-cased by the fallback below this read "Tier-lists".
      breadcrumbs.push({
        label: "Tier lists",
        href: isLast ? undefined : href,
      });
    } else if (segment === "search") {
      breadcrumbs.push({ label: "Search", href: isLast ? undefined : href });
    } else if (segment === "recipes") {
      breadcrumbs.push({ label: "Recipes", href: isLast ? undefined : href });
    } else if (segment === "groups" && segments[i - 1] === "recipes") {
      // `/recipes/groups` is not a page; the group crumb below carries the
      // link. The old rule fell through to a "Groups" crumb that 404'd.
    } else if (
      segment.match(/^[0-9a-f-]{36}$/i) &&
      segments[i - 1] === "groups" &&
      segments[i - 2] === "recipes"
    ) {
      // Recipe group ID: the group page shows its featured version, so the
      // crumb is that recipe's name, as `RecipeHeaderServer` passes it.
      const label = recipeName || "Recipe";
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    } else if (
      segment.match(/^[0-9a-f-]{36}$/i) &&
      segments[i - 1] === "recipes"
    ) {
      // Recipe ID
      const label = recipeName || "Recipe";
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    } else if (segment === "users") {
      breadcrumbs.push({ label: "Profile", href: isLast ? undefined : href });
    } else if (!segment.match(/^[0-9a-f-]{36}$/i)) {
      // Non-UUID segments that aren't recognized
      const label = segment.charAt(0).toUpperCase() + segment.slice(1);
      breadcrumbs.push({ label, href: isLast ? undefined : href });
    }
  }

  return breadcrumbs;
}

/**
 * Pages that *are* a tab: the four tabs' own hrefs, plus `/search`, where
 * Home's `/` lands (it redirects there until X10's Home exists).
 */
const TAB_ROOTS: ReadonlySet<string> = new Set(["/", "/search"]);

/** Crumbs too generic to stand alone as a page title on a phone. */
const GENERIC_LAST = new Set(["Items", "Edit", "Add"]);

export interface PageHeader {
  /** The phone title: the page's own crumb, named after its owner if generic. */
  title: string;
  /** Where Back goes on a cold open; undefined on a tab root. */
  parent?: string;
  /** One of the five tabs' own pages (`/`, `/cellars`, `/map`, `/me`): no Back. */
  tabRoot: boolean;
}

/**
 * What `HeaderBar` hands `AppBar` on a phone, where the trail collapses to a
 * Back and a title (N26):
 *
 * - **title** — the last crumb; a generic one ("Items", "Edit", "Add") takes
 *   the crumb before it as its subject ("Home bar", "Edit Barolo").
 * - **parent** — the nearest earlier crumb that links somewhere other than
 *   this page (a cellar's crumb points at its own items page, so on that page
 *   it is skipped). A parent of `/` becomes the route's tab root instead, so
 *   the lists that moved under Me (D1) go back to `/me`, not Home.
 * - **tabRoot** — the page *is* a tab (or `/search`, Home's landing): no
 *   Back, whatever the history.
 */
export function pageHeader(
  pathname: string,
  crumbs: readonly BreadcrumbSegment[],
): PageHeader {
  const last = crumbs.at(-1);
  const before = crumbs.at(-2);
  let title = last?.label ?? "";
  if (last !== undefined && before !== undefined && GENERIC_LAST.has(title)) {
    title = title === "Items" ? before.label : `${title} ${before.label}`;
  }

  const tabRoot =
    TAB_ROOTS.has(pathname) || TABS.some((t) => t.href === pathname);
  if (tabRoot) return { title, tabRoot };

  let parent = crumbs
    .slice(0, -1)
    .reverse()
    .find((c) => c.href !== undefined && c.href !== pathname)?.href;
  if (parent === "/") {
    const tab = TABS.find((t) => t.key === activeTab(pathname));
    if (tab !== undefined && tab.href !== pathname) parent = tab.href;
  }
  return { title, parent, tabRoot };
}
