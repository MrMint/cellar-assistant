"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { ChevronRight } from "../icons";
import { Link } from "../Link";
import { isUnder, MORE, MORE_LINKS } from "../nav";
import { AnchoredSheet } from "./AnchoredSheet";
import { OPEN_MORE_EVENT } from "./app-keys";
import { PRESS_CLASS, pressFeedback } from "./press";

/** Whether a route is one of More's own destinations. */
export const isMoreRoute = (pathname: string): boolean =>
  MORE_LINKS.some((link) => isUnder(pathname, link.href));

/**
 * More (KIT § 2): the tab bar's and the rail's sixth item. It opens a sheet
 * on a phone and a popover at the rail on desktop, listing the places with no
 * tab of their own. Lit while one of them is showing.
 */
export function MoreMenu({
  variant,
  active = false,
}: {
  variant: "tab" | "rail";
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  // A route change (one of the rows) closes it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger.
  useEffect(() => setOpen(false), [pathname]);
  // `G O` (app-keys): only the menu that is showing answers.
  const desktop = useMediaQuery(breakpointUp("md"));
  const showing = desktop ? variant === "rail" : variant === "tab";
  useEffect(() => {
    if (!showing) return;
    const openMenu = () => setOpen(true);
    window.addEventListener(OPEN_MORE_EVENT, openMenu);
    return () => window.removeEventListener(OPEN_MORE_EVENT, openMenu);
  }, [showing]);
  const lit = active || open;
  const Icon = MORE.icon;

  const button = (
    <button
      type="button"
      data-slot="more-button"
      data-active={lit ? "" : undefined}
      {...pressFeedback()}
      onClick={() => feedback("tick")}
      className={cn(
        "relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        PRESS_CLASS,
        variant === "tab" ? "t-micro flex-1" : "t-micro w-16 py-1.5",
        lit ? "font-semibold text-ink" : "text-ink-3",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-lg",
          variant === "rail" && "h-8 w-13",
          variant === "rail" && lit && "bg-sel",
        )}
      >
        <Icon aria-hidden className="size-6" strokeWidth={lit ? 2.25 : 1.75} />
      </span>
      <span>{MORE.label}</span>
      <HapticOverlay />
    </button>
  );

  return (
    <AnchoredSheet
      open={open}
      onOpenChange={setOpen}
      title={MORE.label}
      side={variant === "rail" ? "right" : "top"}
      align={variant === "rail" ? "start" : "end"}
      tooltip={
        variant === "rail" ? { label: MORE.label, keys: MORE.keys } : undefined
      }
      trigger={button}
    >
      <ul className="flex flex-col pb-2">
        {MORE_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              underline="none"
              {...pressFeedback()}
              aria-current={isUnder(pathname, link.href) ? "page" : undefined}
              className={cn(
                "t-body flex min-h-14 items-center justify-between gap-3 rounded-md px-2 text-ink hover:bg-raised aria-[current=page]:font-semibold",
                PRESS_CLASS,
              )}
            >
              <span>{link.label}</span>
              <ChevronRight aria-hidden className="size-5 text-glyph" />
            </Link>
          </li>
        ))}
      </ul>
    </AnchoredSheet>
  );
}
