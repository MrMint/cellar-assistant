"use client";

import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { CompareView } from "./CompareView";
import { firstName } from "./compare-lines";

/**
 * The desktop compare column (Social-Friends-desktop 02, 04): "You and Maya"
 * beside their profile from `md` up. Below `md` it draws nothing and asks
 * nothing; the agreement card opens the compare page there instead.
 */
export function CompareColumn({
  userId,
  name,
  className,
}: {
  userId: string;
  name: string;
  className?: string;
}) {
  const desktop = useMediaQuery(breakpointUp("md"));
  if (!desktop) return null;
  return (
    <aside
      aria-labelledby={`compare-${userId}`}
      data-slot="compare-column"
      className={cn("flex min-w-0 flex-col gap-3", className)}
    >
      <h2 id={`compare-${userId}`} className="t-head text-ink">
        You and {firstName(name)}
      </h2>
      <CompareView userId={userId} name={name} />
    </aside>
  );
}
