"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { notify } from "@/components/app/notify";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/api/auth-client";
import { completeSignOut } from "@/lib/auth/sign-out";
import { purgeUserCaches } from "@/lib/pwa/purge-caches";
import { cn } from "@/lib/utils";

/**
 * Sign out, as the last row of the `/me` hub (it lived in the old side bar's
 * avatar menu until D1 moved it here).
 *
 * Sign out of **better-auth**, which is the system `/sign-in` signs viewers
 * into. It has to be a browser `fetch` rather than a server action, for the
 * same reason `SignInApiClient` does: the session cookie is set and cleared by
 * `Set-Cookie` on the response the *browser* receives, and a server action
 * would have to forward that header by hand. `completeSignOut` then does the
 * thing only the server can do (drop the router cache's signed-in render).
 *
 * Then the service worker's caches: they hold pages, RSC payloads and
 * photos rendered for this viewer, and would otherwise outlive the session
 * on a shared device (`@/lib/pwa/purge-caches`). Only after the session is
 * really gone — a failed sign-out keeps the viewer signed in, and their
 * cache with them — but straight after it, ahead of `completeSignOut`: a
 * server action that fails (a dropped connection, a redeploy) must not
 * leave a signed-out device holding the last viewer's pages. `/sign-in`
 * purges once more when it mounts (`usePurgeUserCachesOnMount`), which
 * also catches anything an in-flight request wrote back meanwhile.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleSignOut = async () => {
    setPending(true);
    try {
      const { error } = await authClient.signOut();
      if (error !== null) {
        console.error("Sign out failed:", error.message);
        notify("Couldn't sign out. Try again.", { tone: "error" });
        setPending(false);
        return;
      }
      await purgeUserCaches();
      // Best effort, and it must not keep the viewer here: the session
      // cookie is already gone, so the proxy answers this server action's
      // POST with a redirect to /sign-in and the action rejects ("An
      // unexpected response was received from the server") whenever it runs
      // from a gated page — which /me is. `router.refresh()` below drops the
      // signed-in router cache either way.
      try {
        await completeSignOut();
      } catch (error) {
        console.warn("completeSignOut failed after sign-out:", error);
      }
    } catch (error) {
      console.error("Sign out failed:", error);
      notify("Couldn't sign out. Try again.", { tone: "error" });
      setPending(false);
      return;
    }
    // `replace`, so Back does not walk into a signed-in page that no longer
    // has a session behind it.
    router.replace("/sign-in");
    router.refresh();
  };

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void handleSignOut()}
      className={cn(
        "type-body flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-destructive outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-surface-3 disabled:opacity-60",
        className,
      )}
    >
      <span className="flex-1">Sign out</span>
      {pending && <Spinner aria-hidden className="text-ink-3" />}
    </button>
  );
}
