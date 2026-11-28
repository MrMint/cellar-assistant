import { Wine as Mark } from "lucide-react";
import type { ReactNode } from "react";
import { ICON_STROKE } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { mainContentProps } from "@/components/app/main-content";
import { Page } from "@/components/app/Page";
import { Button } from "@/components/ui/button";
import { withReturnTo } from "@/utilities/sanitize-return-to";

/**
 * The public pages' chrome (X17; Social-Lists, signed out): no tab bar, the
 * viewer has no app to navigate yet. A top bar with the mark, the name and
 * Sign in; under the page, the join bar: one short pitch and the Join
 * button, always in thumb reach. Both come back to `canonicalPath`, the URL
 * the viewer is on, through sign-in or a sign-up (D19).
 *
 * Landmarks (X21): the top bar is the page's `header`, everything under it
 * (the join bar included) its `<main>`. The page scrolls inside `main`, so
 * the join bar is a footer under the scroller rather than over it.
 */
export function ShareFrame({
  canonicalPath,
  cta,
  pitch,
  children,
}: {
  /** The in-app URL of what is shown; where signing in comes back to. */
  canonicalPath: string;
  /** The button's words ("Join"; an invite names its sender). */
  cta: string;
  /** One line beside it, saying what joining gets you (≤ 8 words). */
  pitch?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
      <header className="flex min-h-14 flex-none items-center justify-between gap-3 border-b border-hair pr-1.5 pl-4">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-md bg-raised"
          >
            <Mark strokeWidth={ICON_STROKE} className="size-4 text-act-ink" />
          </span>
          <span className="t-head text-ink">Cellar Assistant</span>
        </span>
        <Button asChild variant="ghost" className="t-head text-act-ink">
          <Link href={withReturnTo("/sign-in", canonicalPath)} underline="none">
            Sign in
          </Link>
        </Button>
      </header>
      <main
        {...mainContentProps}
        className="flex min-h-0 flex-1 flex-col outline-none"
      >
        <div
          data-app-scroller
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          <Page className="flex-1 gap-2.5 px-4 pt-4 pb-6">{children}</Page>
        </div>
        <div
          data-slot="share-join"
          className="flex min-h-19 flex-none items-center gap-3 border-t border-edge bg-card px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <p className="t-cap m-0 min-w-0 flex-1 text-ink-2">{pitch}</p>
          {/* An invite's CTA carries a person's name ("Join to connect
              with …"), so it wraps rather than run off a 390 px screen. */}
          <Button
            asChild
            className="t-head h-auto min-h-11 max-w-[60%] shrink-0 whitespace-normal px-5 text-balance text-center wrap-anywhere"
          >
            <Link
              href={withReturnTo("/sign-up", canonicalPath)}
              underline="none"
            >
              {cta}
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
