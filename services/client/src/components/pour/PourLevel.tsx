"use client";

import { motion, useReducedMotion, useSpring } from "motion/react";
import { Slider as SliderPrimitive } from "radix-ui";
import { type PointerEvent, useEffect, useId, useRef } from "react";
import { vesselShape } from "@/components/app/LabelPlate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  LIQUID_BOUNDS,
  levelAtPointer,
  levelForKey,
  levelValueText,
  liquidTop,
} from "./pour-plan";

/**
 * The liquid's colour: the type's text-safe hue (BottleCard's level bar
 * uses the same, for the same 3:1 against the glass). Written out so
 * Tailwind sees each class.
 */
const LIQUID_FILL: Readonly<Record<ApiItemType, string>> = {
  WINE: "fill-type-wine-text",
  BEER: "fill-type-beer-text",
  SPIRIT: "fill-type-spirit-text",
  SAKE: "fill-type-sake-text",
  COFFEE: "fill-type-coffee-text",
  TEA: "fill-type-tea-text",
};
const RANGE_FILL: Readonly<Record<ApiItemType, string>> = {
  WINE: "bg-type-wine-text",
  BEER: "bg-type-beer-text",
  SPIRIT: "bg-type-spirit-text",
  SAKE: "bg-type-sake-text",
  COFFEE: "bg-type-coffee-text",
  TEA: "bg-type-tea-text",
};

/** How far the surface sloshes up on release, in vessel units. */
const SLOSH = 4;

export type PourLevelProps = {
  type: ApiItemType;
  /** What was in the bottle when the sheet opened — the most it can show. */
  from: number;
  /** The level after this pour. */
  value: number;
  onChange: (level: number) => void;
  /** Just the picture (the drained bottle after the last pour): no control. */
  readOnly?: boolean;
};

/**
 * "Pour": the level is the control (design §5, signature moment 4). The
 * bottle's own silhouette (`VesselSilhouette`'s shape), with the liquid
 * clipped inside it: drag it down — anywhere on the bottle — and the level
 * follows the finger; let go and it sloshes back level (`spring.celebrate`).
 * What was there before stays as a faint ghost above the new surface, so the
 * pour reads as the gap between them.
 *
 * It is a `slider` (`aria-valuenow`, arrows by 1, Shift or Page by 10, Home
 * empties, End puts it back), `touch-action: none` with `data-vaul-no-drag`
 * so dragging the liquid neither scrolls the page nor pulls the sheet.
 *
 * Under reduced motion it is a plain slider instead — the design's own
 * fallback ("a plain slider plus the sheet") — with no physics to switch off.
 */
export function PourLevel(props: PourLevelProps) {
  const reduced = useReducedMotion();
  if (reduced && props.readOnly) return null;
  return reduced ? <PlainLevel {...props} /> : <BottleLevel {...props} />;
}

function BottleLevel({
  type,
  from,
  value,
  onChange,
  readOnly = false,
}: PourLevelProps) {
  const clipId = useId();
  const vessel = vesselShape(type);
  const { bottom } = LIQUID_BOUNDS[type];
  const dragging = useRef(false);
  const surface = useSpring(liquidTop(type, value), spring.celebrate);

  // Follow the value: instantly while a finger is on it, on the spring when
  // a preset or a key moves it.
  useEffect(() => {
    const top = liquidTop(type, value);
    if (dragging.current) surface.jump(top);
    else surface.set(top);
  }, [surface, type, value]);

  const levelAt = (event: PointerEvent<HTMLDivElement>) =>
    levelAtPointer(
      type,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      from,
    );

  const release = () => {
    if (!dragging.current) return;
    dragging.current = false;
    // The wobble: the surface sloshes up a little, then settles.
    const top = liquidTop(type, value);
    surface.jump(Math.max(0, top - SLOSH));
    surface.set(top);
  };

  const ghostTop = liquidTop(type, from);

  const picture = (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 64 160"
      className="h-full w-full"
    >
      <defs>
        <clipPath id={clipId}>
          <path
            d={vessel.d}
            fillRule={vessel.evenOdd ? "evenodd" : undefined}
          />
        </clipPath>
      </defs>
      {/* The glass. */}
      <path
        d={vessel.d}
        fillRule={vessel.evenOdd ? "evenodd" : undefined}
        className="fill-surface-3"
      />
      <g clipPath={`url(#${clipId})`}>
        {/* Where it was: the pour is the gap. */}
        <rect
          x={0}
          y={ghostTop}
          width={64}
          height={Math.max(0, bottom - ghostTop)}
          className={cn(LIQUID_FILL[type], "opacity-25")}
        />
        {/* Where it is: one tall rect, moved by transform only. */}
        <motion.rect
          data-slot="pour-liquid"
          x={0}
          y={0}
          width={64}
          height={170}
          style={{ y: surface }}
          className={LIQUID_FILL[type]}
        />
      </g>
    </svg>
  );

  if (readOnly) {
    return (
      <div aria-hidden className="h-40 w-16 shrink-0">
        {picture}
      </div>
    );
  }

  return (
    // An <input type=range> cannot be a bottle: this is the ARIA slider
    // pattern in full (role, value, value text, keys).
    <div
      role="slider"
      tabIndex={0}
      aria-label="Level"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={from}
      aria-valuenow={value}
      aria-valuetext={levelValueText(from, value)}
      data-slot="pour-level"
      data-vaul-no-drag=""
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragging.current = true;
        onChange(levelAt(event));
      }}
      onPointerMove={(event) => {
        if (dragging.current) onChange(levelAt(event));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onKeyDown={(event) => {
        const next = levelForKey(event.key, value, from, event.shiftKey);
        if (next === null) return;
        event.preventDefault();
        onChange(next);
      }}
      className="relative h-60 w-24 shrink-0 cursor-ns-resize touch-none select-none rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {picture}
    </div>
  );
}

/** Reduced motion: the same value on a plain slider. */
function PlainLevel({ type, from, value, onChange }: PourLevelProps) {
  return (
    <div className="flex w-full flex-col gap-3" data-slot="pour-level-plain">
      <SliderPrimitive.Root
        value={[value]}
        min={0}
        max={Math.max(1, from)}
        step={1}
        disabled={from === 0}
        onValueChange={(next) => onChange(next[0] ?? value)}
        className="relative flex h-11 w-full touch-none select-none items-center"
        data-vaul-no-drag=""
      >
        <SliderPrimitive.Track className="relative h-3 grow overflow-hidden rounded-full bg-surface-3">
          <SliderPrimitive.Range
            className={cn("absolute h-full", RANGE_FILL[type])}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label="Level"
          aria-valuetext={levelValueText(from, value)}
          className="block size-7 rounded-full bg-ink-1 shadow-sm outline-none ring-ring/50 focus-visible:ring-4"
        />
      </SliderPrimitive.Root>
    </div>
  );
}
