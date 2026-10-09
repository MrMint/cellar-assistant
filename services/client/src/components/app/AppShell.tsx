"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useNavHistoryTracker } from "./nav-history";
import { usePointerDownPrefetch } from "./prefetch";
import { SideRail } from "./SideRail";
import { TabBar } from "./TabBar";

/**
 * How the content area treats a route (what `ConditionalPaddingWrapper` did):
 * every `/map/*` route lays itself out edge to edge, and only the map canvas
 * itself (`/map`) clips instead of scrolling, so MapLibre fills exactly the
 * space above the tab bar and its attribution stays visible (N22).
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
    // hides the tab bar (design §2). The side rail stays from `sm` up.
    tabBar: pathname !== "/search",
  };
}

/**
 * The signed-in chrome: `SideRail` from `sm` up, `TabBar` below it, and
 * between them the **inner scroller** (D26) — the one element that scrolls,
 * which is what tab re-tap and (later) pull-to-refresh act on.
 *
 * Layout only. The GraphQL provider, the install prompt and the viewer are
 * the caller's (`components/shell/AppShell.tsx` wraps this). It also starts a
 * route's prefetch at the pointerdown on any in-app link inside it (X24,
 * `prefetch.ts`).
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
        // between the root layout and here may clip either.
        "max-sm:mb-[calc(-1*env(safe-area-inset-bottom))]",
      )}
    >
      <SideRail className="hidden sm:flex" />
      <main
        data-app-scroller=""
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-x-hidden",
          padded && "p-4",
          scrolls ? "overflow-y-auto" : "flex flex-col overflow-y-hidden",
        )}
      >
        {children}
      </main>
      {tabBar && <TabBar className="sm:hidden" />}
    </div>
  );
}
