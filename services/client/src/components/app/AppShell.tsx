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
  return {
    padded: !isMap,
    scrolls: pathname !== "/map",
    // X10: search is a full-screen sheet on a phone, and a full-screen sheet
    // hides the tab bar (design §2), as does capture (X06: "It hides only in
    // capture"). The side rail stays from `sm` up.
    tabBar: pathname !== "/search" && !isCaptureRoute(pathname),
  };
}

/**
 * The signed-in chrome: `SideRail` from `sm` up, `TabBar` below it, and
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

  return (
    <div
      data-slot="app-shell"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:flex-row",
        // Phones: reclaim the bottom safe area the root layout pads, so the
        // tab bar's glass runs under the home indicator. It has to be this
        // element: the shell clips (overflow-hidden), so a negative margin
        // on the tab bar itself was cut off at the shell's edge. Nothing
        // between the root layout and here may clip either. Without a tab
        // bar (the search sheet, X10; capture, X06) there is no glass to run
        // under it, so the root layout's padding keeps the content clear.
        tabBar && "max-sm:mb-[calc(-1*env(safe-area-inset-bottom))]",
      )}
    >
      <SideRail className="hidden sm:flex" />
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
      {tabBar && <TabBar className="sm:hidden" />}
    </div>
  );
}
