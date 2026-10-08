import NextLink from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type LinkProps = ComponentProps<typeof NextLink> & {
  /**
   * Stretch the link's hit area over its nearest `relative` ancestor (a card
   * or a row), the "stretched link" pattern Joy called `overlay`. The text
   * stays where it is; the whole tile becomes the target, and nested buttons
   * stay clickable by sitting above it (`relative z-10`).
   */
  overlay?: boolean;
  /** `hover` (the default for text links), `always`, or `none`. */
  underline?: "none" | "hover" | "always";
};

const UNDERLINE = {
  none: "no-underline",
  hover: "no-underline hover:underline",
  always: "underline",
} as const;

/**
 * The app's link (replaces `common/Link.tsx`, Joy, which stays for
 * unconverted callers until the removal step). A `next/link` with the two
 * props callers actually used — `overlay` and `underline` — and a
 * `className`. No `"use client"`: server components render it directly.
 *
 * It is also where B05 will infer View Transition types from the href, so
 * route visual links through it rather than importing `next/link`.
 */
export function Link({
  overlay = false,
  underline = "hover",
  className,
  ...props
}: LinkProps) {
  return (
    <NextLink
      data-slot="link"
      className={cn(
        "rounded-xs underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        UNDERLINE[underline],
        overlay &&
          "after:absolute after:inset-0 after:content-[''] focus-visible:ring-0 focus-visible:after:rounded-[inherit] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}
