"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

/**
 * Leaving the sign-in or sign-up page for where the viewer lands (X01).
 *
 * The navigation runs in a transition, so `landing` stays true until the next
 * page has **committed** — the form keeps its spinner the whole way instead of
 * going idle while the destination's server render streams in (shell-2: the
 * button came back to "Sign in" for a beat, which reads as "it didn't work",
 * and invited a second tap).
 *
 * `replace`, so Back does not walk into the sign-in page behind a live session
 * and bounce straight forward again; then `refresh`, because the
 * `(authenticated)` layout is a server component and would otherwise
 * re-render from the router cache, from before the cookie existed.
 */
export function useLanding(destination: string): {
  land: () => void;
  landing: boolean;
} {
  const router = useRouter();
  const [landing, startTransition] = useTransition();
  const land = useCallback(() => {
    startTransition(() => {
      router.replace(destination);
      router.refresh();
    });
  }, [router, destination]);
  return { land, landing };
}
