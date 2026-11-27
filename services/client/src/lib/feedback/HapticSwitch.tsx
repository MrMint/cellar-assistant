"use client";

/**
 * The iPhone's two haptic switches, ported from Fettle (`haptics.ts` argues
 * both).
 *
 * `HapticSwitch` is the app's one hidden switch, mounted by
 * `FeedbackProvider`. `haptic()` clicks its label from script; iOS 18 to 26.4
 * tick for that, 26.5+ toggle it in silence. Nothing else touches it.
 *
 * `HapticOverlay` is how a press is felt on iOS 26.5+: an invisible
 * `<input type="checkbox" switch>` laid over the element it sits in, so the
 * finger itself lands on a switch. Render it as the LAST child of a
 * positioned pressable element whose click handler calls `feedback()`
 * synchronously, and only while a press there asks for one: the switch ticks
 * for every real tap it takes. It draws nothing on the server, on Android
 * (which has `vibrate`), on a desk, or with the Haptics setting off.
 *
 * Both are devices, not controls: `aria-hidden`, out of the tab order, no
 * name. The `switch` attribute is not in React's DOM types, so it is spread
 * in as a plain attribute.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  attachHapticOverlay,
  hapticOverlayLive,
  registerHapticSwitch,
  subscribeHaptics,
  switchDevice,
} from "./haptics";

const SWITCH_ATTRIBUTE: Record<string, string> = { switch: "" };

export function HapticSwitch() {
  const label = useRef<HTMLLabelElement>(null);
  useEffect(
    () =>
      label.current === null ? undefined : registerHapticSwitch(label.current),
    [],
  );
  return (
    <label
      ref={label}
      data-slot="haptic-switch"
      aria-hidden="true"
      className="hidden"
    >
      <input type="checkbox" tabIndex={-1} {...SWITCH_ATTRIBUTE} />
    </label>
  );
}

const offOnServer = (): boolean => false;

/**
 * Whether an overlay draws on this device now. False on the server and in the
 * hydrating render. `force` draws it whatever the setting: the one press that
 * turns haptics ON must be felt (Fettle M-8).
 */
export function useHapticOverlay(force = false): boolean {
  return useSyncExternalStore(
    subscribeHaptics,
    force ? switchDevice : hapticOverlayLive,
    offOnServer,
  );
}

export function HapticOverlay({
  className,
  force = false,
}: {
  readonly className?: string | undefined;
  /** Draw it with the setting off: only for the act that turns haptics on. */
  readonly force?: boolean | undefined;
}) {
  const live = useHapticOverlay(force);
  const input = useRef<HTMLInputElement>(null);
  useEffect(
    () =>
      live && input.current !== null
        ? attachHapticOverlay(input.current)
        : undefined,
    [live],
  );
  if (!live) return null;
  return (
    <input
      ref={input}
      type="checkbox"
      tabIndex={-1}
      aria-hidden="true"
      data-slot="haptic-overlay"
      {...SWITCH_ATTRIBUTE}
      /* `opacity-0`, never `hidden` or `pointer-events-none`: the finger has
         to land on it. Above the element's own children. */
      className={cn(
        "absolute inset-0 z-[2] m-0 size-full cursor-[inherit] rounded-[inherit] border-0 p-0 opacity-0",
        className,
      )}
    />
  );
}
