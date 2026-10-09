"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CAPTURE_OPTIONS } from "./nav";

/**
 * Prefetch on `pointerdown` (X24, design §4.10).
 *
 * A tap on a phone is pointerdown → (about 100 ms of finger on glass) →
 * pointerup → click, and Next only starts navigating at the click. Starting
 * the route's prefetch at pointerdown buys that gap back: with the routes'
 * `loading.tsx` shells, what it fetches is the shell (down to the first
 * loading boundary), so the click commits straight into it.
 *
 * One capture-phase listener on the document, not a handler per link, so it
 * covers every in-app anchor in the shell — `app/Link` (the tab bar's tabs
 * included), the stretched card links, the rows — without turning `app/Link`
 * into a client component. Next's own `<Link>` already prefetches at
 * `touchstart` and on hover; this adds the pointer types those miss (a pen, a
 * mouse that clicks without lingering) and the anchors that are not `<Link>`.
 * `router.prefetch` dedupes against Next's cache, so a link it has already
 * prefetched costs nothing.
 *
 * Opt a link out with `data-prefetch="false"`.
 */

/**
 * The path to prefetch for a pointerdown on `target`, or null: the nearest
 * anchor's same-origin page URL (path and query), unless the anchor opens
 * elsewhere, downloads, opts out, or only moves within the current page.
 */
export function prefetchTarget(
  target: EventTarget | null,
  current: { href: string; origin: string },
): string | null {
  if (target === null || typeof (target as Element).closest !== "function") {
    return null;
  }
  const anchor = (target as Element).closest("a[href]");
  if (anchor === null) return null;
  if (anchor.getAttribute("data-prefetch") === "false") return null;
  if (anchor.hasAttribute("download")) return null;
  const opensIn = anchor.getAttribute("target");
  if (opensIn !== null && opensIn !== "" && opensIn !== "_self") return null;

  let url: URL;
  try {
    url = new URL(anchor.getAttribute("href") ?? "", current.href);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Route handlers and assets are not pages.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return null;
  }
  const here = new URL(current.href);
  if (url.pathname === here.pathname && url.search === here.search) {
    return null; // a hash link, or this very page
  }
  return `${url.pathname}${url.search}`;
}

/** Only the primary button (a touch, a pen tip, a left click). */
const isPrimary = (event: PointerEvent): boolean =>
  event.isPrimary && event.button === 0;

/**
 * Installs the document's pointerdown prefetch for as long as the caller is
 * mounted (`AppShell`).
 */
export function usePointerDownPrefetch(): void {
  const router = useRouter();
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!isPrimary(event)) return;
      const href = prefetchTarget(event.target, {
        href: window.location.href,
        origin: window.location.origin,
      });
      if (href !== null) router.prefetch(href);
    };
    document.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: true,
    });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, [router]);
}

/**
 * The ＋ button's pointerdown (tab bar and side rail): warm the chooser's
 * four destinations while the finger is still down, so whichever row is
 * picked commits into its shell.
 */
export function prefetchCaptureDestinations(router: {
  prefetch: (href: string) => void;
}): void {
  for (const option of CAPTURE_OPTIONS) router.prefetch(option.href);
}
