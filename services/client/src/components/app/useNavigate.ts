"use client";

import { useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import {
  inferKind,
  motionEnv,
  pathOf,
  type TransitionKind,
  transitionTypesFor,
} from "./transition-kind";
import { expectPop } from "./traverse-transition";

export type { TransitionKind } from "./transition-kind";

export type NavigateOptions = {
  /** Which way the page moves; inferred from the href when absent. */
  readonly kind?: TransitionKind;
  readonly scroll?: boolean;
};

export type Navigate = {
  push(href: string, opts?: NavigateOptions): void;
  replace(href: string, opts?: NavigateOptions): void;
  back(opts?: { readonly kind?: TransitionKind }): void;
};

type RouterOptions = { scroll?: boolean; transitionTypes?: string[] };

/** The current pathname, read at call time (not the render's). */
const here = (): string =>
  typeof window === "undefined" ? "/" : window.location.pathname;

/**
 * Only the options Next's router takes: `scroll` when given, and the
 * transition types `kind` maps to (none without the View Transition API or
 * under reduced motion), so a call with nothing to add reaches the router
 * with exactly the arguments it always had.
 */
const routerOptions = (
  href: string,
  opts: NavigateOptions | undefined,
  reducedMotion: boolean,
): RouterOptions | undefined => {
  const from = here();
  const kind = opts?.kind ?? inferKind(from, pathOf(href, from));
  const transitionTypes = transitionTypesFor(kind, motionEnv(reducedMotion));
  const options: RouterOptions = {};
  if (opts?.scroll !== undefined) options.scroll = opts.scroll;
  if (transitionTypes !== undefined) options.transitionTypes = transitionTypes;
  return Object.keys(options).length === 0 ? undefined : options;
};

/**
 * The one way client code moves between pages (ux-c M2, plan L5/L25).
 *
 * Every `push`, `replace` and `back` goes through here so the page transition
 * is chosen in one place (B05): `kind` — given, or inferred from where the
 * href sits relative to the current page (`transition-kind.ts`) — becomes
 * Next's `transitionTypes`. `back` goes through browser history, which
 * carries no types, so it tells `traverse-transition.ts` the kind for Next's
 * traversal instead. `refresh` and `prefetch` stay on `useRouter()`; they carry
 * no transition.
 */
export function useNavigate(): Navigate {
  const router = useRouter();
  // A ref, so the returned object stays stable when the preference flips.
  const reduced = useRef(false);
  reduced.current = useReducedMotion() ?? false;
  return useMemo<Navigate>(
    () => ({
      push: (href, opts) => {
        const options = routerOptions(href, opts, reduced.current);
        if (options === undefined) router.push(href);
        else router.push(href, options);
      },
      replace: (href, opts) => {
        // A replace with no kind is in place unless it leaves the path.
        const options = routerOptions(href, opts, reduced.current);
        if (options === undefined) router.replace(href);
        else router.replace(href, options);
      },
      back: (opts) => {
        expectPop(opts?.kind ?? "back");
        router.back();
      },
    }),
    [router],
  );
}
