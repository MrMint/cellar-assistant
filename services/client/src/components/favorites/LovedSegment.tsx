"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { LOVED_KINDS, type LovedKind, lovedHref } from "./loved-recipes";

/**
 * Drinks · Recipes on Loved (X18). Each half is its own server render, so
 * the switch is a navigation; the segment moves on the tap rather than when
 * the page lands (N12: acknowledge every tap within a frame).
 */
export function LovedSegment({ value }: { value: LovedKind }) {
  const router = useRouter();
  const [shown, setShown] = useState<LovedKind>(value);
  return (
    <SegmentedControl
      aria-label="Show"
      value={shown}
      onValueChange={(next) => {
        setShown(next);
        router.replace(lovedHref(next), { scroll: false });
      }}
      options={LOVED_KINDS}
    />
  );
}
