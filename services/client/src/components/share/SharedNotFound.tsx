"use client";

import { useEffect, useState } from "react";
import { ICON_STROKE, NoResults } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { MainContent } from "@/components/app/main-content";
import { ShellMessage } from "@/components/shell/ShellMessage";
import { NOT_FOUND_COPY } from "@/components/shell/shell-copy";
import { Button } from "@/components/ui/button";
import { withReturnTo } from "@/utilities/sanitize-return-to";

/**
 * D24's one message, on a public page. The way on is signing in and coming
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
    // The page's whole frame, so it is the skip link's target too (X21).
    <MainContent className="flex min-w-0 flex-1 flex-col">
      <ShellMessage
        copy={NOT_FOUND_COPY}
        icon={<NoResults strokeWidth={ICON_STROKE} />}
        actions={
          <Button asChild>
            <Link href={withReturnTo("/sign-in", here)} underline="none">
              Sign in
            </Link>
          </Button>
        }
      />
    </MainContent>
  );
}
