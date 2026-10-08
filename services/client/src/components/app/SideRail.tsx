"use client";

import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, useState } from "react";
import { cn } from "@/lib/utils";
import { CaptureChooser } from "./CaptureChooser";
import { Link } from "./Link";
import { CaptureIcon, TABS, type Tab } from "./nav";
import { handleActiveTabTap, opensElsewhere, useOptimisticTab } from "./TabBar";

/**
 * From `sm` up: the same five destinations as `TabBar`, stacked in a rail on
 * the left, labels always visible (so no tooltip is needed to name a glyph).
 */
export function SideRail({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [active, setActive] = useOptimisticTab();
  const [choosing, setChoosing] = useState(false);

  const onTap = (event: MouseEvent<HTMLAnchorElement>, tab: Tab) => {
    if (opensElsewhere(event)) return;
    if (tab.key === active) {
      if (handleActiveTabTap(tab, pathname, router.push)) {
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
      <button
        type="button"
        aria-label="Add"
        aria-haspopup="dialog"
        aria-expanded={choosing}
        onClick={() => setChoosing(true)}
        className="my-1 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-transform duration-(--ca-dur-micro) ease-standard hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 motion-reduce:active:scale-100"
      >
        <CaptureIcon aria-hidden className="size-7" strokeWidth={2} />
      </button>
      {TABS.slice(2).map(item)}
      <CaptureChooser open={choosing} onOpenChange={setChoosing} />
    </nav>
  );
}
