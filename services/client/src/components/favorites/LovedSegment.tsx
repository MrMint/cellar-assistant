"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { useNavigate } from "@/components/app/useNavigate";
import { LOVED_KINDS, type LovedKind, lovedHref } from "./loved-recipes";

/**
 * Drinks · Recipes on Loved (X18). Each half is its own server render, so
 * the switch is a navigation; the segment moves on the tap rather than when
 * the page lands (N12: acknowledge every tap within a frame).
 */
export function LovedSegment({ value }: { value: LovedKind }) {
  const navigate = useNavigate();
  const [shown, setShown] = useState<LovedKind>(value);
  return (
    <SegmentedControl
      aria-label="Show"
      value={shown}
      onValueChange={(next) => {
        setShown(next);
        navigate.replace(lovedHref(next), { scroll: false });
      }}
      options={LOVED_KINDS}
    />
  );
}
