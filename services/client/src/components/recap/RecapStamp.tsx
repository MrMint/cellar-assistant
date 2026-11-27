/**
 * The round breadth stamp from the Social-Recap board: the tier, then its
 * noun, inside a double gold ring (gold is the owner's own verdict, and a
 * stamp is only ever the owner's), tilted -8 degrees. On a stamp card (large)
 * and on Me (small).
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
        "relative flex -rotate-[8deg] flex-col items-center justify-center gap-0.5 rounded-full border-[3px] border-gold text-ink-1",
        size === "lg" ? "size-[148px]" : "size-[88px] shrink-0",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-[6px] rounded-full border border-gold/50"
      />
      <span
        className={cn(
          "tabular leading-none",
          size === "lg" ? "t-title" : "t-head",
        )}
      >
        {face.count}
      </span>
      <span
        className={cn(
          "max-w-[80%] text-center",
          size === "lg" ? "t-body" : "t-micro",
        )}
      >
        {face.noun}
      </span>
    </span>
  );
}
