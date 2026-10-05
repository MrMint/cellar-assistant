"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { fadeUp, staggerContainer } from "./motion-variants";

interface AnimateInProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fade-up entrance for a single element.
 * Wraps server components to add framer-motion animation.
 */
export function FadeIn({ children, className }: AnimateInProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger container — staggers its StaggerItem children.
 */
export function StaggerIn({ children, className }: AnimateInProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Child of StaggerIn — participates in the stagger sequence.
 */
export function StaggerItem({ children }: { children: ReactNode }) {
  return <motion.div variants={fadeUp}>{children}</motion.div>;
}
