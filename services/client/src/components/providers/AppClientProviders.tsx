"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/app/Toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The client-side context every page needs: reduced motion, tooltips and the
 * toast host.
 *
 * - `MotionConfig reducedMotion="user"` sits at the root, not the
 *   authenticated layout, so sign-in's intro obeys it too (design §4.9).
 * - `Toaster` is mounted once here so `notify()` works from any page; it sits
 *   above the tab bar (`app/Toaster`).
 *
 * There is deliberately **no GraphQL provider here.** D2–D8 mount
 * `ApiUrqlProvider` per route group instead, which is what let the migration
 * run one group at a time; the root layout is a server component and mounting a
 * client at the root would have put every page's queries on one client before
 * any of them were ready for it. Keeping it per-group also means a page that
 * never queries pays for no client at all.
 *
 * Auth is entirely server-side: `src/proxy.ts` gates on the better-auth session
 * cookie, `getServerUser()` resolves it against the actors app, and server
 * components exchange it for a JWT once per request
 * (`src/lib/api/auth-server.ts`). Nothing here holds a session.
 */
export default function AppClientProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </MotionConfig>
  );
}
