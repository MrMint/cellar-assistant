/**
 * Which way a navigation moves (B05, design-direction §4.3/§4.4), as pure
 * functions so the rules are tested without a browser.
 *
 * Three kinds animate: `forward` (a push deeper: the page slides in from the
 * trailing edge), `back` (it slides back) and `tab` (a crossfade, no slide:
 * a tab switch is "same place, different content", not a journey). `none`
 * swaps in place — a filter, a query string — and so does everything when
 * the viewer asks for reduced motion or the browser has no View Transition
 * API. Each kind is one React transition type (`nav-forward`, …), which
 * `useNavigate` and `app/Link` hand Next as `transitionTypes`, and which
 * `RouteTransition` maps to CSS classes in `app/view-transitions.css`.
 *
 * No `"use client"`: plain data and functions, importable from either side.
 */
import { activeTab, isUnder, TABS } from "./nav";

/**
 * What kind of move a navigation is, for the transition that plays with it.
 * `forward` drills in, `back` returns, `tab` switches a top-level section,
 * `none` swaps in place (a filter, a query string).
 */
export type TransitionKind = "forward" | "back" | "tab" | "none";

/** The React transition type each animated kind carries. */
export const TRANSITION_TYPE = {
  forward: "nav-forward",
  back: "nav-back",
  tab: "nav-tab",
} as const satisfies Record<Exclude<TransitionKind, "none">, string>;

/** What the browser and the viewer allow, read once per navigation. */
export type MotionEnv = {
  /** `document.startViewTransition` exists. */
  readonly supported: boolean;
  /** The viewer's reduced-motion preference. */
  readonly reducedMotion: boolean;
};

/**
 * The transition types a navigation of `kind` carries, or `undefined` for
 * none — so the router call is exactly what it was before B05. Reduced
 * motion gets no types at all: the page swaps instantly, the way it did.
 */
export function transitionTypesFor(
  kind: TransitionKind,
  env: MotionEnv,
): string[] | undefined {
  if (kind === "none" || !env.supported || env.reducedMotion) return undefined;
  return [TRANSITION_TYPE[kind]];
}

/**
 * The live environment. `reducedMotion` is the caller's, from motion's
 * `useReducedMotion` (lib/motion.ts: the app never reads its own media
 * query); `supported` is false on the server.
 */
export function motionEnv(reducedMotion: boolean): MotionEnv {
  const supported =
    typeof document !== "undefined" &&
    typeof (document as { startViewTransition?: unknown })
      .startViewTransition === "function";
  return { supported, reducedMotion };
}

/**
 * The pathname an href points at, resolved against `from` (the current
 * pathname): `?q=x` and `#a` stay on `from`, a relative segment resolves
 * like a browser would. Query and hash are dropped.
 */
export function pathOf(href: string, from: string): string {
  if (href.startsWith("?") || href.startsWith("#") || href === "") return from;
  try {
    const url = new URL(href, `http://app.invalid${from}`);
    if (url.host !== "app.invalid") return href; // off-site: never ours
    const path = url.pathname;
    return path.length > 1 ? path.replace(/\/+$/, "") : path;
  } catch {
    return href;
  }
}

/** Whether `path` is one of the four tabs' own roots (`/`, `/cellars`, …). */
export const isTabRoot = (path: string): boolean =>
  TABS.some((tab) => tab.href === path);

/**
 * The kind of a move from `from` to `to` (both pathnames), from the app's
 * shape alone — for a link or a push that did not say:
 *
 * - the same path (a query or hash change) → `none`;
 * - a tab's root in another tab than the current page → `tab`;
 * - an ancestor of the current page (`/cellars/1` → `/cellars`) → `back`;
 * - anything else → `forward`.
 */
export function inferKind(from: string, to: string): TransitionKind {
  if (from === to) return "none";
  if (isTabRoot(to) && activeTab(to) !== activeTab(from)) return "tab";
  if (to !== "/" && isUnder(from, to)) return "back";
  return "forward";
}

/**
 * The kind of a browser history move (Back, Forward, a swipe) that lands on
 * `to`, from the in-app stack `nav-history.ts` keeps — read before the
 * tracker records `to`. Landing on the entry just below the top is Back;
 * any other entry is Forward (the stack cannot see forward entries). A move
 * between two tabs' roots is a tab switch either way.
 */
export function popKind(stack: readonly string[], to: string): TransitionKind {
  const from = stack.at(-1);
  if (from === undefined || from === to) return "none";
  if (isTabRoot(to) && isTabRoot(from) && activeTab(to) !== activeTab(from)) {
    return "tab";
  }
  return stack.at(-2) === to ? "back" : "forward";
}

/**
 * The shared-element name a title morphs under (B05: a card's title flies
 * into its page's heading). Keyed by the page's pathname, so the card only
 * needs its `href` and the page only its own path — a CSS ident, so every
 * character outside `[A-Za-z0-9_-]` becomes `_`.
 */
export function morphName(href: string): string {
  const path = pathOf(href, "/");
  return `title${path.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
