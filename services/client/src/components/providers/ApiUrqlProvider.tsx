"use client";

import { UrqlProvider as Provider } from "@urql/next";
import { useMemo } from "react";
import { makeApiClient } from "@/lib/api/urql-client";

/**
 * The app's GraphQL client, in React context.
 *
 * D2–D8 mounted one of these per route group so a group could migrate while the
 * Hasura client still served the rest; D9 deleted that client and hoisted this
 * to `(authenticated)/layout.tsx`. **Mount it once.** Each mount builds its own
 * client through `useMemo`, and therefore its own graphcache — two mounts in
 * one tree means a mutation under one of them cannot update an entity the other
 * has cached.
 */
export function ApiUrqlProvider({ children }: { children: React.ReactNode }) {
  const [client, ssr] = useMemo(() => {
    const { client, ssr } = makeApiClient();
    return [client, ssr];
  }, []);

  // biome-ignore lint/suspicious/noExplicitAny: @urql/next and @urql/core resolve to different copies of the Client type.
  const providerClient = client as any;
  // biome-ignore lint/suspicious/noExplicitAny: see above.
  const providerSsr = ssr as any;

  return (
    <Provider client={providerClient} ssr={providerSsr}>
      {children}
    </Provider>
  );
}
