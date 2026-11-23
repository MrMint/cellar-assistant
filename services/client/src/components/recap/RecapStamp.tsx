/**
 * The round breadth stamp from the Recap board: the tier, then its noun, in a
 * brass ring tilted -8 degrees. On a stamp card (large) and on Me (small).
 */
import type { BreadthStampKind } from "@cellar-assistant/contracts/recap";
import { stampDescription } from "@/lib/stamps/stamps";
import { cn } from "@/lib/utils";
import { stampFace } from "./recap-copy";

export function RecapStamp({
  stamp,
  size = "lg",
}: {
  stamp: { kind: BreadthStampKind; tier: number; count: number };
  size?: "lg" | "sm";
}) {
  const face = stampFace(stamp);
  return (
    <span
      role="img"
      aria-label={stampDescription(stamp)}
      data-slot="recap-stamp"
      className={cn(
        "flex -rotate-[8deg] flex-col items-center justify-center gap-1 rounded-full text-brass shadow-[inset_0_0_0_3px_var(--ca-accent)]",
        size === "lg" ? "mt-3 size-[132px]" : "size-[88px] shrink-0",
      )}
    >
      <span
        className={cn(
          "font-display leading-none",
          size === "lg" ? "text-[34px]" : "text-2xl",
        )}
      >
        {face.count}
      </span>
      <span className="max-w-[80%] text-center text-[11px] leading-[14px] font-semibold tracking-[.06em] uppercase">
        {face.noun}
      </span>
    </span>
  );
}
