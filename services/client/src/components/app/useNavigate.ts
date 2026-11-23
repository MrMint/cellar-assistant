"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

/**
 * What kind of move a navigation is, for the transition that plays with it.
 * `forward` drills in, `back` returns, `tab` switches a top-level section,
 * `none` swaps in place (a filter, a query string).
 */
export type TransitionKind = "forward" | "back" | "tab" | "none";

export type NavigateOptions = {
  readonly kind?: TransitionKind;
  readonly scroll?: boolean;
};

export type Navigate = {
  push(href: string, opts?: NavigateOptions): void;
  replace(href: string, opts?: NavigateOptions): void;
  back(opts?: { readonly kind?: TransitionKind }): void;
};

/** Only the options Next's router takes; `kind` is ours. */
const routerOptions = (
  opts: NavigateOptions | undefined,
): { scroll: boolean } | undefined =>
  opts?.scroll === undefined ? undefined : { scroll: opts.scroll };

/**
 * The one way client code moves between pages (ux-c M2, plan L5/L25).
 *
 * Every `push`, `replace` and `back` goes through here so the page transition
 * can be chosen in one place. For now it passes straight to Next's router:
 * `kind` is accepted and dropped, and `scroll` is forwarded only when given,
 * so each call reaches `useRouter()` with exactly the arguments it used to.
 * `refresh` and `prefetch` stay on `useRouter()`; they carry no transition.
 */
export function useNavigate(): Navigate {
  const router = useRouter();
  return useMemo<Navigate>(
    () => ({
      push: (href, opts) => {
        const options = routerOptions(opts);
        if (options === undefined) router.push(href);
        else router.push(href, options);
      },
      replace: (href, opts) => {
        const options = routerOptions(opts);
        if (options === undefined) router.replace(href);
        else router.replace(href, options);
      },
      back: () => router.back(),
    }),
    [router],
  );
}
