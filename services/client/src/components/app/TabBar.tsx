"use client";

import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CaptureChooser } from "./CaptureChooser";
import { Link } from "./Link";
import { activeTab, CaptureIcon, TABS, type Tab, type TabKey } from "./nav";

/** The shell's inner scroller (`AppShell`), which re-tap scrolls to the top. */
export const SCROLLER_SELECTOR = "[data-app-scroller]";

/**
 * Re-tapping the active tab (D26): scroll its page to the top first; already
 * at the top, pop to the tab's root. Returns whether it handled the tap.
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
      onClick={(event) => onTap(event, tab)}
      className={cn(
        "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-md pt-1 font-medium text-[10px] leading-3 transition-colors duration-(--ca-dur-micro)",
        active ? "text-ink-1" : "text-ink-3",
      )}
    >
      <Icon aria-hidden className="size-6" strokeWidth={active ? 2.25 : 1.75} />
      <span>{tab.label}</span>
    </Link>
  );
}

/**
 * Phones (below `sm`): five labelled tabs, Home · Cellar · ＋ · Map · Me (D1).
 * 49 pt plus the home-indicator inset on frosted glass; the brass ＋ is 56 pt
 * and sits 8 pt proud of the bar. `SideRail` is the same set from `sm` up.
 */
export function TabBar({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [active, setActive] = useOptimisticTab();
  const [choosing, setChoosing] = useState(false);

  const onTap = (event: MouseEvent<HTMLAnchorElement>, tab: Tab) => {
    if (tab.key === active) {
      if (handleActiveTabTap(tab, pathname, router.push)) {
        event.preventDefault();
      }
      return;
    }
    setActive(tab.key);
  };

  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  return (
    <nav
      aria-label="Main"
      data-slot="tab-bar"
      className={cn(
        "surface-glass touch-none-select relative z-40 shrink-0 rounded-none",
        // Extend under the home indicator: the root layout pads the safe
        // area, the bar reclaims it and pads its own content instead.
        "mb-[calc(-1*env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <div className="grid h-(--ca-tabbar-h) grid-cols-5 items-stretch px-1">
        {left.map((tab) => (
          <TabLink
            key={tab.key}
            tab={tab}
            active={tab.key === active}
            onTap={onTap}
          />
        ))}
        <div className="relative flex justify-center">
          <button
            type="button"
            aria-label="Add"
            aria-haspopup="dialog"
            aria-expanded={choosing}
            onClick={() => setChoosing(true)}
            className="absolute -top-2 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/40 outline-none transition-transform duration-(--ca-dur-micro) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 motion-reduce:active:scale-100"
          >
            <CaptureIcon aria-hidden className="size-7" strokeWidth={2} />
          </button>
        </div>
        {right.map((tab) => (
          <TabLink
            key={tab.key}
            tab={tab}
            active={tab.key === active}
            onTap={onTap}
          />
        ))}
      </div>
      <CaptureChooser open={choosing} onOpenChange={setChoosing} />
    </nav>
  );
}
