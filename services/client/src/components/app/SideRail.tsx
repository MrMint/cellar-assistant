"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { Link } from "./Link";
import { ADD_KEYS, LEADING_TABS, ME_TAB, type Tab, TRAILING_TABS } from "./nav";
import { KeyTooltip } from "./overlays/Kbd";
import { isMoreRoute, MoreMenu } from "./overlays/MoreMenu";
import { PRESS_CLASS, pressFeedback } from "./overlays/press";
import { CaptureButton, MeTab, useTabTap } from "./TabBar";

function RailLink({
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
    <KeyTooltip label={tab.label} keys={tab.keys}>
      <Link
        href={tab.href}
        underline="none"
        aria-current={active ? "page" : undefined}
        data-active={active ? "" : undefined}
        {...pressFeedback()}
        onClick={(event) => onTap(event, tab)}
        className={cn(
          "t-micro relative flex w-16 flex-col items-center justify-center gap-1 rounded-md py-1.5 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
          PRESS_CLASS,
          active ? "font-semibold text-ink" : "text-ink-3",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-13 items-center justify-center rounded-lg",
            active && "bg-sel",
          )}
        >
          <Icon
            aria-hidden
            className="size-6"
            strokeWidth={active ? 2.25 : 1.75}
          />
        </span>
        <span>{tab.label}</span>
        <HapticOverlay />
      </Link>
    </KeyTooltip>
  );
}

/**
 * From `md` up (KIT § 3 Desktop): the 88 rail that replaces the tab bar —
 * Cellars, Search, Map, Add (teal, 48 × 40), Lists, More, and Me at the foot.
 * Each item is 64 wide with its label always shown, and names its key in a
 * tooltip after 400 ms. It never moves.
 */
export function SideRail({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const { active, onTap } = useTabTap();
  const item = (tab: Tab) => (
    <RailLink
      key={tab.key}
      tab={tab}
      active={tab.key === active}
      onTap={onTap}
    />
  );

  return (
    <TooltipProvider>
      <nav
        aria-label="Main"
        data-slot="side-rail"
        className={cn(
          "touch-none-select flex w-22 shrink-0 flex-col items-center gap-3 border-hair border-r bg-surface-1 pt-4 pb-4",
          className,
        )}
      >
        {LEADING_TABS.map(item)}
        <span className="flex w-16 flex-col items-center gap-1">
          <KeyTooltip label="Add" keys={ADD_KEYS}>
            <CaptureButton variant="rail" />
          </KeyTooltip>
          <span aria-hidden className="t-micro text-ink-3">
            Add
          </span>
        </span>
        {TRAILING_TABS.map(item)}
        <MoreMenu variant="rail" active={isMoreRoute(pathname)} />
        <div className="mt-auto">
          <MeTab variant="rail" active={active === ME_TAB.key} onTap={onTap} />
        </div>
      </nav>
    </TooltipProvider>
  );
}
