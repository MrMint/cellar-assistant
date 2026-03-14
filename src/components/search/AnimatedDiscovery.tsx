"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { fadeUp, staggerContainer } from "./motion-variants";

interface AnimatedDiscoveryProps {
  children: ReactNode;
}

/**
 * Client wrapper that applies a staggered fade-up entrance
 * to the discovery section's children (greeting, stats, search, chips).
 */
export function AnimatedDiscovery({ children }: AnimatedDiscoveryProps) {
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  if (prefersReducedMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      style={{ display: "contents" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Wraps an individual child element to participate in the stagger.
 * Full-width flex container that centers both text and block children.
 */
export function AnimatedDiscoveryItem({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      {children}
    </motion.div>
  );
}
