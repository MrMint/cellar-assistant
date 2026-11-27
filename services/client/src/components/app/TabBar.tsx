"use client";

import { usePathname } from "next/navigation";
import { type MouseEvent, useEffect, useState } from "react";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { Link, type LinkProps } from "./Link";
import {
  activeTab,
  CAPTURE_HREF,
  CaptureIcon,
  LEADING_TABS,
  ME_TAB,
  type Tab,
  type TabKey,
  TRAILING_TABS,
} from "./nav";
import { isMoreRoute, MoreMenu } from "./overlays/MoreMenu";
import { PRESS_CLASS, pressFeedback } from "./overlays/press";
import { badgeCount, meLabel, useShellViewer } from "./overlays/ShellViewer";
import { UserAvatar } from "./UserAvatar";
import { useNavigate } from "./useNavigate";

/** The shell's inner scroller (`AppShell`), which re-tap scrolls to the top. */
export const SCROLLER_SELECTOR = "[data-app-scroller]";

/** A click that opens elsewhere (new tab/window) rather than navigating here. */
export const opensElsewhere = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey;

/**
 * Re-tapping the active tab (D26): scroll its page to the top first; already
 * at the top, pop to the tab's root; already at the root, go where the tab's
 * `rootTap` says (Home: search, X10). Returns whether it handled the tap.
 */
export function handleActiveTabTap(
  tab: Tab,
  pathname: string,
  navigate: (href: string) => void,
  scroller: Element | null = typeof document === "undefined"
    ? null
    : document.querySelector(SCROLLER_SELECTOR),
): boolean {
  if (scroller !== null && scroller.scrollTop > 0) {
    scroller.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }
  if (pathname !== tab.href) {
    navigate(tab.href);
    return true;
  }
  if (tab.rootTap !== undefined) {
    navigate(tab.rootTap);
    return true;
  }
  return false;
}

/**
 * The lit tab, set the moment a tab is tapped (N12) rather than when the next
 * route finishes loading, and corrected by the route once it lands.
 */
export function useOptimisticTab(): [
  TabKey | undefined,
  (key: TabKey) => void,
] {
  const pathname = usePathname() ?? "/";
  const [pending, setPending] = useState<TabKey | undefined>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on every route change, which is what pathname signals.
  useEffect(() => setPending(undefined), [pathname]);
  return [pending ?? activeTab(pathname), setPending];
}

function TabLink({
  tab,
  active,
  onTap,
}: {
  tab: Tab;
  active: boolean;
  onTap: (event: MouseEvent<HTMLAnchorElement>, tab: Tab) => void;
}) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      underline="none"
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      {...pressFeedback()}
      onClick={(event) => onTap(event, tab)}
      className={cn(
        "t-micro relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        PRESS_CLASS,
        active ? "font-semibold text-ink" : "text-ink-3",
      )}
    >
      <Icon aria-hidden className="size-6" strokeWidth={active ? 2.25 : 1.75} />
      <span>{tab.label}</span>
      <HapticOverlay />
    </Link>
  );
}

/**
 * Add (KIT § 2): a teal pill in the bar, a teal 48 × 40 on the rail — a link
 * straight into the full-screen capture surface (X06). As a link it is
 * prefetched at pointerdown like every tab (X24). It is the screen's one
 * primary, so it plays the primary press.
 */
export function CaptureButton({
  className,
  variant = "tab",
  ...rest
}: Omit<LinkProps, "href"> & {
  variant?: "tab" | "rail";
}) {
  return (
    <Link
      {...rest}
      href={CAPTURE_HREF}
      underline="none"
      aria-label="Add"
      data-slot="capture-button"
      {...pressFeedback("primary")}
      onClick={() => feedback("tick")}
      className={cn(
        "relative flex items-center justify-center rounded-md bg-act text-on-act outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        PRESS_CLASS,
        variant === "tab" ? "h-11 w-13" : "h-10 w-12",
        className,
      )}
    >
      <CaptureIcon aria-hidden className="size-6" strokeWidth={2} />
      <HapticOverlay />
    </Link>
  );
}

/**
 * Me (KIT § 2): the viewer's 32 avatar over its label, with the act badge
 * counting friend requests ("Me, 2 friend requests").
 */
export function MeTab({
  active,
  onTap,
  variant = "tab",
}: {
  active: boolean;
  onTap: (event: MouseEvent<HTMLAnchorElement>, tab: Tab) => void;
  variant?: "tab" | "rail";
}) {
  const viewer = useShellViewer();
  const requests = viewer.requests ?? 0;
  return (
    <Link
      href={ME_TAB.href}
      underline="none"
      aria-label={meLabel(requests)}
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      data-slot="me-tab"
      {...pressFeedback()}
      onClick={(event) => onTap(event, ME_TAB)}
      className={cn(
        "t-micro relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        PRESS_CLASS,
        variant === "tab" ? "flex-1" : "w-16 py-1.5",
        active ? "font-semibold text-ink" : "text-ink-3",
      )}
    >
      <span className="relative">
        <UserAvatar
          size="sm"
          displayName={viewer.displayName}
          avatarUrl={viewer.avatarUrl}
          aria-hidden
          className={cn("border", active ? "border-ink" : "border-edge-2")}
        />
        {requests > 0 && (
          <span
            aria-hidden
            data-slot="me-badge"
            className="t-micro absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-act px-1 font-semibold text-on-act tabular-nums"
          >
            {badgeCount(requests)}
          </span>
        )}
      </span>
      <span aria-hidden>{ME_TAB.label}</span>
      <HapticOverlay />
    </Link>
  );
}

/** The tap handler a tab bar and the rail share. */
export function useTabTap(): {
  active: TabKey | undefined;
  onTap: (event: MouseEvent<HTMLAnchorElement>, tab: Tab) => void;
} {
  const pathname = usePathname() ?? "/";
  const navigate = useNavigate();
  const [active, setActive] = useOptimisticTab();
  const onTap = (event: MouseEvent<HTMLAnchorElement>, tab: Tab) => {
    if (opensElsewhere(event)) return;
    if (tab.key === active) {
      if (handleActiveTabTap(tab, pathname, navigate.push)) {
        event.preventDefault();
      }
      return;
    }
    // A tick on change (KIT § 2: "tick on change").
    feedback("tick");
    setActive(tab.key);
  };
  return { active, onTap };
}

/**
 * Phones (below `md`): 64 tall on glass, Cellars · Search · Map · Add ·
 * Lists · More · Me (KIT § 2). The current tab is ink and weight, the rest
 * ink-3; every control presses to .97. It never hides on scroll; only the
 * capture surface and the full-screen routes take it away (`AppShell`).
 * `SideRail` is the same set from `md` up.
 */
export function TabBar({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const { active, onTap } = useTabTap();

  const tab = (t: Tab) => (
    <TabLink key={t.key} tab={t} active={t.key === active} onTap={onTap} />
  );
  return (
    <nav
      aria-label="Main"
      data-slot="tab-bar"
      className={cn(
        "touch-none-select relative z-40 shrink-0 border-hair border-t bg-glass backdrop-blur-xl",
        // Under the home indicator: AppShell reclaims the safe area the root
        // layout pads, and the bar pads its own content instead.
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <div className="flex h-16 items-center gap-0.5 px-1">
        {LEADING_TABS.map(tab)}
        <div className="flex flex-1 justify-center">
          <CaptureButton />
        </div>
        {TRAILING_TABS.map(tab)}
        <MoreMenu variant="tab" active={isMoreRoute(pathname)} />
        <MeTab active={active === "me"} onTap={onTap} />
      </div>
    </nav>
  );
}
