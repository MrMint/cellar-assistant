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
  const small = size === "sm";
  const ring = (
    <span
      data-slot="recap-stamp"
      className={cn(
        "relative flex -rotate-[8deg] flex-col items-center justify-center gap-0.5 rounded-full border-[3px] border-gold text-ink-1",
        small ? "size-[60px] shrink-0" : "size-[148px]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-[6px] rounded-full border border-gold/50"
      />
      <span
        className={cn("tabular leading-none", small ? "t-head" : "t-title")}
      >
        {face.count}
      </span>
      {!small && (
        <span className="t-body max-w-[80%] text-center">{face.noun}</span>
      )}
    </span>
  );
  if (!small)
    return (
      <span role="img" aria-label={stampDescription(stamp)} className="flex">
        {ring}
      </span>
    );
  // On Me the noun sits under the ring (the board), so four fit in a row.
  return (
    <span
      role="img"
      aria-label={stampDescription(stamp)}
      className="flex flex-1 flex-col items-center gap-2"
    >
      {ring}
      <span className="t-cap max-w-full truncate text-center text-ink-2">
        {face.noun}
      </span>
    </span>
  );
}
