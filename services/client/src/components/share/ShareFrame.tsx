import type { ReactNode } from "react";
import { ActionBar } from "@/components/app/ActionBar";
import { Link } from "@/components/app/Link";
import { Page } from "@/components/app/Page";
import { Button } from "@/components/ui/button";
import { withReturnTo } from "@/utilities/sanitize-return-to";

/**
 * The public pages' chrome (X17): no tab bar — the viewer has no app to
 * navigate yet — just the name, a way to sign in, and one brass invitation
 * pinned within thumb reach. Both buttons come back to `canonicalPath`, the
 * URL the viewer is on, through sign-in or a social sign-up (D19).
 *
 * The page's own scroller, as the app shell's inner one would be, so the
 * `ActionBar` rides its bottom edge.
 */
export function ShareFrame({
  canonicalPath,
  cta,
  pitch,
  children,
}: {
  /** The in-app URL of what is shown; where signing in comes back to. */
  canonicalPath: string;
  /** The brass button's words ("Join to rank your own"). */
  cta: string;
  /** One line above it, saying what joining gets you. */
  pitch?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-app-scroller
      className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain"
    >
      <header className="surface-glass sticky top-0 z-20 flex min-h-14 items-center justify-between gap-3 px-4">
        <span className="type-headline font-display text-ink-1">
          Cellar Assistant
        </span>
        <Button asChild variant="ghost">
          <Link href={withReturnTo("/sign-in", canonicalPath)} underline="none">
            Sign in
          </Link>
        </Button>
      </header>
      <div className="flex flex-1 flex-col px-4 pt-4">
        <Page withActionBar className="flex-1">
          {children}
        </Page>
        <ActionBar className="flex-col items-stretch gap-1 px-3 pt-2 pb-3">
          {pitch !== undefined && (
            <p className="type-footnote px-1 text-center">{pitch}</p>
          )}
          {/* A CTA can carry a person's name ("Join to connect with …"), so
              it wraps rather than run off a 390 px screen. */}
          <Button
            asChild
            className="h-auto min-h-11 whitespace-normal text-balance text-center wrap-anywhere"
          >
            <Link
              href={withReturnTo("/sign-up", canonicalPath)}
              underline="none"
            >
              {cta}
            </Link>
          </Button>
        </ActionBar>
      </div>
    </div>
  );
}
