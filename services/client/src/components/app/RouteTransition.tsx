"use client";

import { useReducedMotion } from "motion/react";
import {
  type ReactElement,
  type ReactNode,
  useLayoutEffect,
  ViewTransition,
} from "react";
import { useCurrentPath } from "./Link";
import { morphName, TRANSITION_TYPE } from "./transition-kind";
import { setTraverseReducedMotion } from "./traverse-transition";

// Moved to `traverse-transition.ts`; kept here for their importers.
export { expectPop, takePopKind } from "./traverse-transition";

/** Each animated type → the class `view-transitions.css` styles. */
const BY_TYPE = {
  [TRANSITION_TYPE.forward]: "nav-forward",
  [TRANSITION_TYPE.back]: "nav-back",
  [TRANSITION_TYPE.tab]: "nav-tab",
  default: "none",
} as const;

/** The morph plays on a forward or back move only; a tab switch fades. */
const MORPH = {
  [TRANSITION_TYPE.forward]: "morph",
  [TRANSITION_TYPE.back]: "morph",
  default: "none",
} as const;

/**
 * Browser Back and Forward (and the edge swipe) reach Next as a `popstate`
 * with no transition type. `traverse-transition.ts` adds one from inside
 * Next's own traverse transition. It runs outside React, so the viewer's
 * reduced-motion preference is handed to it from here.
 */
function useTraverseReducedMotion(): void {
  const reduced = useReducedMotion() ?? false;
  useLayoutEffect(() => {
    setTraverseReducedMotion(reduced);
  }, [reduced]);
}

/**
 * The page-level View Transition (B05). Wraps the shell's one `<main>` —
 * which stays mounted across routes, so the move is an `update` of it, not
 * an enter/exit — and maps each navigation's type to its class. Untyped
 * transitions (a refresh, a Suspense reveal, reduced motion, no API) map to
 * `none`: nothing animates and nothing is named. The bars sit outside it
 * and are anchored by `view-transitions.css`.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  useTraverseReducedMotion();
  return (
    <ViewTransition
      enter={BY_TYPE}
      exit={BY_TYPE}
      update={BY_TYPE}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}

/**
 * A title that morphs into the page it links to (B05: a card's title →
 * that page's heading). Wrap one element: the card's title with the card's
 * `href`, the page's heading with nothing (it is named for the current
 * pathname). Make it a block — a heading that wraps is then still one box;
 * a fragmented inline box would make the browser skip the transition.
 */
export function MorphTitle({
  href,
  children,
}: {
  href?: string;
  children: ReactElement;
}) {
  const pathname = useCurrentPath();
  return (
    <ViewTransition
      name={morphName(href ?? pathname)}
      share={MORPH}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
