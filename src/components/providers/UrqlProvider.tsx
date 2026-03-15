"use client";

import { UrqlProvider as Provider } from "@urql/next";
import { useMemo } from "react";
import { makeClientClient } from "@/lib/urql/client";

interface UrqlProviderProps {
  children: React.ReactNode;
}

export function UrqlProvider({ children }: UrqlProviderProps) {
  const [client, ssr] = useMemo(() => {
    const { client, ssr } = makeClientClient();
    return [client, ssr];
  }, []);

  // biome-ignore lint/suspicious/noExplicitAny: URQL version type mismatch between client and provider
  const providerClient = client as any;
  // biome-ignore lint/suspicious/noExplicitAny: URQL version type mismatch between client and provider
  const providerSsr = ssr as any;

  return (
    <Provider client={providerClient} ssr={providerSsr}>
      {children}
    </Provider>
  );
}
