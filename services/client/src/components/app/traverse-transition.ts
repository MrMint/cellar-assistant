import { addTransitionType } from "react";
import { readNavStack } from "./nav-history";
import {
  motionEnv,
  popKind,
  type TransitionKind,
  transitionTypesFor,
} from "./transition-kind";

/**
 * The transition type of a history traversal: browser Back and Forward, the
 * edge swipe, and `navigate.back()` (B05, E-6/W-9).
 *
 * Next starts a traversal from its own `popstate` listener, as
 * `startTransition(() => dispatchTraverseAction(…))`, and passes it no type.
 * A second `popstate` listener can't add one. A browser-dispatched event
 * runs a microtask checkpoint between listeners, and React flushes a
 * transition scheduled during `popstate` eagerly in that checkpoint. So a
 * listener's own no-op transition commits alone, and that commit claims the
 * root's queued types. Next's page swap then commits untyped, and Back plays
 * no slide. That is how `RouteTransition`'s old listener failed, and only in
 * a real browser: a script `dispatchEvent` has no checkpoint between
 * listeners.
 *
 * Next calls `onRouterTransitionStart(url, "traverse")`, from
 * `instrumentation-client.ts`, synchronously inside that same
 * `startTransition` scope, just before it dispatches. An `addTransitionType`
 * there lands on Next's own transition, and the commit that swaps the page
 * carries it.
 *
 * Module state, not React state: the hook runs outside any render, and
 * there is one history per tab. No `"use client"`: it is loaded by
 * `instrumentation-client.ts` before the app hydrates.
 */

/** The kind `navigate.back()` asked for, consumed by the next traversal. */
let pendingPopKind: TransitionKind | null = null;

/** The viewer's reduced-motion preference, kept by `RouteTransition`. */
let reducedMotion = false;

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

/**
 * Record motion's `useReducedMotion` for the hook, which runs outside
 * React. `lib/motion.ts` says the app never reads the media query itself.
 */
export function setTraverseReducedMotion(reduced: boolean): void {
  reducedMotion = reduced;
}

/**
 * Next's client instrumentation hook, re-exported by
 * `instrumentation-client.ts`. A push or replace already carries its types
 * from `useNavigate` and `app/Link`, so only a traversal is typed here. The
 * kind comes from `navigate.back()` when it asked, otherwise from the
 * nav-history stack, read before the tracker records the new path.
 */
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
): void {
  if (navigationType !== "traverse" || typeof window === "undefined") return;
  const to = new URL(url, window.location.href).pathname;
  const types = transitionTypesFor(takePopKind(to), motionEnv(reducedMotion));
  for (const type of types ?? []) addTransitionType(type);
}
