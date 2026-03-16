"use client";

import type { ReactNode } from "react";
import { IconContext } from "react-icons";
import ThemeRegistry from "./ThemeRegistry";
import { UrqlProvider } from "./UrqlProvider";

/**
 * Client-side provider wrapper.
 *
 * Auth is fully managed server-side via httpOnly cookies:
 * - Middleware validates/refreshes tokens on navigation
 * - /api/graphql proxy refreshes tokens on GraphQL requests
 * - Server components get user data via getServerUser()
 *
 * No client-side Nhost SDK or CookieStorage is needed.
 */
export default function NhostClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <UrqlProvider>
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
    </UrqlProvider>
  );
}
