"use client";

import type { ReactNode } from "react";
import { IconContext } from "react-icons";
import ThemeRegistry from "./ThemeRegistry";

/**
 * The client-side context every page needs: icon defaults and the Joy theme.
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
    <IconContext.Provider
      value={{
        color: "var(--Icon-color)",
        style: {
          margin: "var(--Icon-margin)",
          fontSize: "var(--Icon-fontSize, 20px)",
          width: "0.75em",
          height: "0.75em",
        },
      }}
    >
      <ThemeRegistry>{children}</ThemeRegistry>
    </IconContext.Provider>
  );
}
