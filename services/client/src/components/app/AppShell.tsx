"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { mainContentProps } from "./main-content";
import { isCaptureRoute } from "./nav";
import { useNavHistoryTracker } from "./nav-history";
import { usePointerDownPrefetch } from "./prefetch";
import { RouteTransition } from "./RouteTransition";
import { SideRail } from "./SideRail";
import { TabBar } from "./TabBar";

const MAKE_MODE = /^\/recipes\/[^/]+\/make\/?$/;

/**
 * Routes that take the whole screen (no tab bar, no side rail, no padding):
 * Make mode (L08 "full-screen", CR-5) and the recap deck (L04/L43), whose
 * overlay otherwise sits over chrome that Tab still reaches (CR-14). Each
 * draws its own Close, which goes back (`components/make/leave.ts`).
 */
export const isFullScreenRoute = (pathname: string): boolean =>
  MAKE_MODE.test(pathname) || pathname === "/recap";

/**
 * How the content area treats a route (what `ConditionalPaddingWrapper` did):
 * every `/map/*` route lays itself out edge to edge, and only the map canvas
 * itself (`/map`) clips instead of scrolling, so MapLibre fills exactly the
 * space above the tab bar and its attribution stays visible (N22). The
 * phone's tab bar steps aside on the capture surface (X06, design §2 — the
 * camera has the screen, and Close is the way out) and on the search sheet
 * (X10).
 */
export function contentLayout(pathname: string): {
  padded: boolean;
  scrolls: boolean;
  tabBar: boolean;
} {
  const isMap = pathname === "/map" || pathname.startsWith("/map/");
  const fullScreen = isFullScreenRoute(pathname);
  return {
    padded: !isMap && !fullScreen,
    scrolls: pathname !== "/map",
    // The kit's tab bar never hides on scroll (KIT § 2). It steps aside for
    // the search sheet (X10: full screen on a phone, with its own Cancel),
    // the capture surface (X06: the camera has the screen, and Close is the
    // way out) and the full-screen routes. The rail stays from `md` up.
    tabBar: pathname !== "/search" && !isCaptureRoute(pathname) && !fullScreen,
  };
}

/**
 * The signed-in chrome: `SideRail` from `md` (900, L8) up, `TabBar` below it, and
 * between them the **inner scroller** (D26) — the one element that scrolls,
 * which is what tab re-tap and (later) pull-to-refresh act on.
 *
 * Landmarks (X21): the rail and the tab bar are each a `nav` named "Main"
 * (only one is ever displayed), and the scroller is the page's one `<main>`,
 * the root layout's skip link's target.
 *
 * Layout only. The GraphQL provider, the install prompt and the viewer are
 * the caller's (`components/shell/AppShell.tsx` wraps this). It also starts a
 * route's prefetch at the pointerdown on any in-app link inside it (X24,
 * `prefetch.ts`).
 *
 * Route motion (B05): the scroller is the page-level View Transition
 * (`RouteTransition`), so a push slides it, Back slides it back and a tab
 * switch crossfades it, while the rail and the tab bar — outside it, and
 * anchored by name in `app/view-transitions.css` — stay put.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  useNavHistoryTracker();
  usePointerDownPrefetch();
  const { padded, scrolls, tabBar } = contentLayout(pathname);
  const rail = !isFullScreenRoute(pathname);

  return (
    <div
      data-slot="app-shell"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row",
        // Phones: reclaim the bottom safe area the root layout pads, so the
        // tab bar's glass runs under the home indicator. It has to be this
        // element: the shell clips (overflow-hidden), so a negative margin
        // on the tab bar itself was cut off at the shell's edge. Nothing
        // between the root layout and here may clip either. Without a tab
        // bar (the search sheet, X10; capture, X06) there is no glass to run
        // under it, so the root layout's padding keeps the content clear.
        tabBar && "max-md:mb-[calc(-1*env(safe-area-inset-bottom))]",
      )}
    >
      {rail && <SideRail className="hidden md:flex" />}
      <RouteTransition>
        <main
          {...mainContentProps}
          data-app-scroller=""
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-x-hidden outline-none",
            padded && "p-4",
            scrolls ? "overflow-y-auto" : "flex flex-col overflow-y-hidden",
          )}
        >
          {children}
        </main>
      </RouteTransition>
      {tabBar && <TabBar className="md:hidden" />}
    </div>
  );
}
