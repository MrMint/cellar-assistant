"use client";

import { Box } from "@mui/joy";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface AnimatedPlaceholderProps {
  examples: string[];
  enabled?: boolean;
  holdDuration?: number;
}

export function AnimatedPlaceholder({
  examples,
  enabled = true,
  holdDuration = 3000,
}: AnimatedPlaceholderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!enabled || examples.length <= 1 || prefersReducedMotion) {
      return;
    }

    // Reset to first example when re-enabled
    setCurrentIndex(0);

    const advance = () => {
      setCurrentIndex((prev) => (prev + 1) % examples.length);
      timerRef.current = setTimeout(advance, holdDuration);
    };

    timerRef.current = setTimeout(advance, holdDuration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, examples, holdDuration, prefersReducedMotion]);

  if (!enabled || examples.length === 0) {
    return null;
  }

  const text = examples[currentIndex] ?? examples[0];

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        pointerEvents: "none",
        overflow: "hidden",
        // Match Joy UI Input inner padding (startDecorator takes ~32px)
        pl: "calc(var(--Input-paddingInline) + var(--Input-decoratorChildHeight) + var(--Input-gap))",
        pr: "var(--Input-paddingInline)",
      }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={prefersReducedMotion ? "static" : currentIndex}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={{
            color: "var(--Input-placeholderColor)",
            fontSize: "inherit",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
          }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </Box>
  );
}
