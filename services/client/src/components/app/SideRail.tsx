"use client";

import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { Link } from "./Link";
import { TABS, type Tab } from "./nav";
import {
  CaptureButton,
  handleActiveTabTap,
  opensElsewhere,
  useOptimisticTab,
} from "./TabBar";
import { useNavigate } from "./useNavigate";

/**
 * From `sm` up: the same five destinations as `TabBar`, stacked in a rail on
 * the left, labels always visible (so no tooltip is needed to name a glyph).
 */
export function SideRail({ className }: { className?: string }) {
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
    setActive(tab.key);
  };

  const item = (tab: Tab) => {
    const Icon = tab.icon;
    const isActive = tab.key === active;
    return (
      <Link
        key={tab.key}
        href={tab.href}
        underline="none"
        aria-current={isActive ? "page" : undefined}
        data-active={isActive ? "" : undefined}
        onClick={(event) => onTap(event, tab)}
        className={cn(
          "flex min-h-14 w-16 flex-col items-center justify-center gap-1 rounded-md font-medium text-[11px] leading-3.5 transition-colors duration-(--ca-dur-micro) hover:bg-surface-2",
          isActive ? "bg-surface-2 text-ink-1" : "text-ink-3",
        )}
      >
        <Icon
          aria-hidden
          className="size-6"
          strokeWidth={isActive ? 2.25 : 1.75}
        />
        <span>{tab.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Main"
      data-slot="side-rail"
      className={cn(
        "touch-none-select flex w-20 shrink-0 flex-col items-center gap-2 bg-surface-1 py-4",
        className,
      )}
    >
      {TABS.slice(0, 2).map(item)}
      <CaptureButton className="my-1 hover:bg-primary/90" />
      {TABS.slice(2).map(item)}
    </nav>
  );
}
