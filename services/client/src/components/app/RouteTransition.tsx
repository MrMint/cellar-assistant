"use client";

import { useReducedMotion } from "motion/react";
import {
  addTransitionType,
  type ReactElement,
  type ReactNode,
  startTransition,
  useEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { useCurrentPath } from "./Link";
import { readNavStack } from "./nav-history";
import {
  morphName,
  motionEnv,
  popKind,
  TRANSITION_TYPE,
  type TransitionKind,
  transitionTypesFor,
} from "./transition-kind";

/**
 * The kind `navigate.back()` asked for, consumed by the next `popstate`.
 * Module state, not React state: the pop it describes happens outside any
 * render, and there is one history per tab.
 */
let pendingPopKind: TransitionKind | null = null;

/** Say what the next history pop is (`useNavigate().back`). */
export function expectPop(kind: TransitionKind): void {
  pendingPopKind = kind;
}

/** The kind for a pop that has just landed on `to` (exported for tests). */
export function takePopKind(to: string): TransitionKind {
  const asked = pendingPopKind;
  pendingPopKind = null;
  return asked ?? popKind(readNavStack(), to);
}

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
 * with no transition type. This listener gives that navigation one: inside
 * the same event it starts a transition that adds the type and schedules a
 * no-op update, so the type queues on the root in the same transition lane
 * as Next's own traverse and the commit that swaps the page carries it.
 * The kind comes from `navigate.back()` when it asked, else from the
 * nav-history stack (read before the tracker records the new path).
 */
function usePopTransitionType(): void {
  const [, setPops] = useState(0);
  const reduced = useRef(false);
  reduced.current = useReducedMotion() ?? false;
  useEffect(() => {
    const onPop = () => {
      const kind = takePopKind(window.location.pathname);
      const types = transitionTypesFor(kind, motionEnv(reduced.current));
      if (types === undefined) return;
      startTransition(() => {
        for (const type of types) addTransitionType(type);
        setPops((n) => n + 1);
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
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
  usePopTransitionType();
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
