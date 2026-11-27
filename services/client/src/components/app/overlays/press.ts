import type { PointerEvent } from "react";
import { feedback } from "@/lib/feedback";

/**
 * The pressed look every control in the shell and its overlays shares (SPEC
 * movement 1): scale .97 over micro on the standard curve; under reduced
 * motion, opacity .7 instead of the scale.
 */
export const PRESS_CLASS =
  "transition-[transform,opacity,color,background-color] duration-(--ca-dur-micro) ease-standard active:scale-97 motion-reduce:active:scale-100 motion-reduce:active:opacity-70";

type PressName = "press" | "primary";

/**
 * Pointer handlers that play a press's sound down on press and up on release
 * (MC-feedback: `press` and `primary` take a phase). Spread them on the
 * pressable; a primary action (Add, Open page) passes `"primary"`.
 */
export function pressFeedback(name: PressName = "press"): {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
} {
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      feedback(name, { phase: "down" });
    },
    onPointerUp: (event) => {
      if (event.button !== 0) return;
      feedback(name, { phase: "up" });
    },
  };
}
