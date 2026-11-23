"use client";

import { useReducedMotion } from "motion/react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import {
  inferKind,
  motionEnv,
  pathOf,
  type TransitionKind,
  transitionTypesFor,
} from "./transition-kind";

export type LinkProps = ComponentProps<typeof NextLink> & {
  /**
   * Stretch the link's hit area over its nearest `relative` ancestor (a card
   * or a row), the "stretched link" pattern. The text
   * stays where it is; the whole tile becomes the target, and nested buttons
   * stay clickable by sitting above it (`relative z-10`).
   */
  overlay?: boolean;
  /** `hover` (the default for text links), `always`, or `none`. */
  underline?: "none" | "hover" | "always";
  /**
   * Which way the page moves (B05). Inferred from the href against the
   * current page when absent; an explicit `transitionTypes` wins over both.
   */
  kind?: TransitionKind;
};

/** The pathname a `next/link` href points at. */
const hrefPath = (href: LinkProps["href"], from: string): string =>
  typeof href === "string" ? pathOf(href, from) : (href.pathname ?? from);

const UNDERLINE = {
  none: "no-underline",
  hover: "no-underline hover:underline",
  always: "underline",
} as const;

/**
 * The app's link (it replaced the Joy-era `common/Link.tsx`). A `next/link` with the two
 * props callers actually used — `overlay` and `underline` — and a
 * `className`. Server components still render it directly (a client
 * component takes their serialisable props).
 *
 * It is also where B05 infers the View Transition type from the href
 * (`transition-kind.ts`): forward, back or a tab crossfade, and nothing under
 * reduced motion or without the API. The guard test
 * (`navigation-guard.test.ts`) keeps it the only `next/link` importer.
 */
export function Link({
  overlay = false,
  underline = "hover",
  className,
  kind,
  transitionTypes,
  ...props
}: LinkProps) {
  const pathname = usePathname() ?? "/";
  const reducedMotion = useReducedMotion() ?? false;
  const types =
    transitionTypes ??
    transitionTypesFor(
      kind ?? inferKind(pathname, hrefPath(props.href, pathname)),
      motionEnv(reducedMotion),
    );
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
      transitionTypes={types}
    />
  );
}
