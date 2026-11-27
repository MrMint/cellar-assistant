"use client";

import { Wine as Mark } from "lucide-react";
import { useEffect, useState } from "react";
import { ICON_STROKE, NoResults } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { MainContent } from "@/components/app/main-content";
import { ShellMessage } from "@/components/shell/ShellMessage";
import { NOT_FOUND_COPY } from "@/components/shell/shell-copy";
import { Button } from "@/components/ui/button";
import { withReturnTo } from "@/utilities/sanitize-return-to";

/**
 * D24's one message, on a public page: "Can't open this page", the same
 * for a list that is gone and one that is private (CROSS-LOT). The way on is signing in and coming
 * straight back here: something shared with the viewer as a friend is
 * missing on the public page and present once they are signed in.
 *
 * `returnTo` is read from the address bar after mount. A not-found page is
 * not handed its route's params, and under the proxy's rewrite the address
 * bar holds the canonical URL (`/tier-lists/<id>`) while the server rendered
 * `/share/…`; reading it on the server would be the rewritten path, and
 * reading it during render would mismatch hydration. Until then the link is
 * plain `/sign-in`, which works too.
 */
export function SharedNotFound() {
  const [here, setHere] = useState<string | null>(null);
  useEffect(() => {
    setHere(`${window.location.pathname}${window.location.search}`);
  }, []);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
      {/* ShareFrame's top bar, without its Sign in: the message's own
          button is the one way on (Shell-Entry, shared-list-gone). */}
      <header className="flex min-h-14 flex-none items-center gap-2 border-b border-hair px-4">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-md bg-raised"
        >
          <Mark strokeWidth={ICON_STROKE} className="size-4 text-act-ink" />
        </span>
        <span className="t-head text-ink">Cellar Assistant</span>
      </header>
      {/* The page's main, so it is the skip link's target too (X21). */}
      <MainContent className="flex min-w-0 flex-1 flex-col">
        <ShellMessage
          copy={NOT_FOUND_COPY}
          icon={<NoResults strokeWidth={ICON_STROKE} />}
          actions={
            <Button asChild variant="outline">
              <Link href={withReturnTo("/sign-in", here)} underline="none">
                Sign in
              </Link>
            </Button>
          }
        />
      </MainContent>
    </div>
  );
}
