"use client";

import { useReducedMotion } from "motion/react";
import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
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
  useArmOnPress();
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
 * Which card title the viewer last pressed (W-8): the `data-morph-id` of the
 * `MorphTitle` that is, or is inside, the link they pressed, and its name.
 *
 * One page can draw the same bottle more than once — the cellar's "Open
 * now" and "Recently added" shelves sit above its grid, each a `BottleCard`
 * with the same href — and React pairs a page's heading with the FIRST card
 * of that name it meets that is not off-screen, so the title flew from a
 * shelf, or from nothing visible, instead of the card that was tapped. Only
 * the pressed card carries the name; the page's heading always does.
 *
 * Once the pressed card unmounts (the forward move), its `id` is cleared
 * and the name stays: on the way Back every card of that name is named
 * again, and React lands the heading on the last of them (the grid, below
 * the shelves) until the next press picks one.
 */
const MORPH_ID_ATTR = "data-morph-id";
const MORPH_NAME_ATTR = "data-morph-name";
type Armed = { id: string | null; name: string } | null;
let armedMorph: Armed = null;
const armedListeners = new Set<() => void>();

/** Arm the card with this id and name; `null` disarms (exported for tests). */
export function armMorph(armed: Armed): void {
  if (armedMorph?.id === armed?.id && armedMorph?.name === armed?.name) return;
  armedMorph = armed;
  armedListeners.forEach((listener) => {
    listener();
  });
}

/** Whether the card `id`, named `name`, carries its name now. */
const isArmed = (id: string, name: string): boolean =>
  armedMorph !== null &&
  armedMorph.name === name &&
  (armedMorph.id === id || armedMorph.id === null);

const subscribeArmed = (listener: () => void) => {
  armedListeners.add(listener);
  return () => {
    armedListeners.delete(listener);
  };
};

/** What a press on `target` arms: its link's own morph, or one inside it. */
export function morphFor(target: EventTarget | null): Armed {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a");
  if (link === null) return null;
  const owner = link.hasAttribute(MORPH_ID_ATTR)
    ? link
    : link.querySelector(`[${MORPH_ID_ATTR}]`);
  const id = owner?.getAttribute(MORPH_ID_ATTR) ?? null;
  const name = owner?.getAttribute(MORPH_NAME_ATTR) ?? null;
  return id === null || name === null ? null : { id, name };
}

/**
 * Arms on `pointerdown` (and on `click`, for a keyboard Enter), in the
 * capture phase: the re-render that names the card is a discrete update, so
 * it commits before the click's navigation transition reads the old tree.
 */
function useArmOnPress(): void {
  useLayoutEffect(() => {
    const onPress = (event: Event) => {
      const armed = morphFor(event.target);
      if (armed !== null) armMorph(armed);
    };
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("click", onPress, true);
    return () => {
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("click", onPress, true);
    };
  }, []);
}

/**
 * A title that morphs into the page it links to (B05: a card's title →
 * that page's heading). Wrap one element: the card's title with the card's
 * `href`, the page's heading with nothing (it is named for the current
 * pathname). Make it a block — a heading that wraps is then still one box;
 * a fragmented inline box would make the browser skip the transition.
 *
 * A card's copy is named only once it is pressed (see `armedMorph`); its
 * element carries `data-morph-id` and `data-morph-name` so the press can
 * find it, so the element must pass `data-*` props through to the DOM.
 */
export function MorphTitle({
  href,
  children,
}: {
  href?: string;
  children: ReactElement;
}) {
  const pathname = useCurrentPath();
  const id = useId();
  const name = morphName(href ?? pathname);
  const armed = useSyncExternalStore(
    subscribeArmed,
    () => isArmed(id, name),
    () => false,
  );
  // The pressed card has gone (the move it started committed): keep the
  // name for the way Back, for whichever card of it mounts then.
  useLayoutEffect(
    () => () => {
      if (armedMorph?.id === id) armMorph({ id: null, name: armedMorph.name });
    },
    [id],
  );
  const named = href === undefined || armed;
  return (
    <ViewTransition
      name={named ? name : undefined}
      share={MORPH}
      default="none"
    >
      {href === undefined
        ? children
        : cloneElement(children as ReactElement<Record<string, unknown>>, {
            [MORPH_ID_ATTR]: id,
            [MORPH_NAME_ATTR]: name,
          })}
    </ViewTransition>
  );
}
