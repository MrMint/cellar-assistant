import type { Metadata } from "next";
import { MainContent } from "@/components/app/main-content";
import { AppShell } from "@/components/shell/AppShell";
import { NotFoundMessage } from "@/components/shell/NotFoundMessage";
import { getOptionalServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Not found" };

/**
 * A URL that matches no route at all (a stale link, `/wines` since D7, a
 * mistyped id path). It renders under the root layout only — outside
 * `(authenticated)` — so it builds the shell itself when there is a viewer,
 * and keeps the same D24 copy either way.
 *
 * Signed out, `src/proxy.ts` has normally redirected to `/sign-in` before
 * this runs; the bare message is for a cookie whose session has ended.
 */
export default async function NotFound() {
  const user = await getOptionalServerUser();
  if (user === null)
    return (
      // No shell to give it one: the message is the page's main (X21).
      <MainContent className="flex min-w-0 flex-1 flex-col">
        <NotFoundMessage signedIn={false} />
      </MainContent>
    );
  return (
    <AppShell>
      <NotFoundMessage />
    </AppShell>
  );
}
