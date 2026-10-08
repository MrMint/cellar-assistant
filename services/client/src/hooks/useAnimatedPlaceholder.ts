"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Phase = "typing" | "paused";

interface UseAnimatedPlaceholderOptions {
  examples: string[];
  typingSpeed?: number;
  pauseDuration?: number;
  enabled?: boolean;
}

export function useAnimatedPlaceholder({
  examples,
  typingSpeed = 50,
  pauseDuration = 2000,
  enabled = true,
}: UseAnimatedPlaceholderOptions): string {
  const [displayText, setDisplayText] = useState("");
  // motion's own read of the setting (the one the root MotionConfig
  // honours). It is read once, at mount — false on the server, the real
  // setting on the client's first render — and does not follow a change made
  // while the page is open (the media query it replaces did). Safe for
  // hydration only because it is read in the effect below, never in render.
  const prefersReducedMotion = useReducedMotion() ?? false;

  const animState = useRef({
    phase: "typing" as Phase,
    exampleIndex: 0,
    charIndex: 0,
  });

  useEffect(() => {
    if (!enabled || examples.length === 0) {
      return;
    }

    if (prefersReducedMotion) {
      setDisplayText(examples[0]);
      return;
    }

    // Reset on re-enable
    animState.current = { phase: "typing", exampleIndex: 0, charIndex: 0 };
    setDisplayText("");

    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const s = animState.current;
      const currentExample = examples[s.exampleIndex];

      switch (s.phase) {
        case "typing": {
          s.charIndex++;
          setDisplayText(currentExample.slice(0, s.charIndex));
          if (s.charIndex >= currentExample.length) {
            s.phase = "paused";
            timeoutId = setTimeout(tick, pauseDuration);
          } else {
            timeoutId = setTimeout(tick, typingSpeed);
          }
          break;
        }
        case "paused": {
          // Skip erasing — clear instantly and advance to next example
          s.exampleIndex = (s.exampleIndex + 1) % examples.length;
          s.charIndex = 0;
          s.phase = "typing";
          setDisplayText("");
          timeoutId = setTimeout(tick, typingSpeed * 4);
          break;
        }
      }
    };

    timeoutId = setTimeout(tick, typingSpeed * 6);

    return () => clearTimeout(timeoutId);
  }, [enabled, examples, typingSpeed, pauseDuration, prefersReducedMotion]);

  return displayText;
}
