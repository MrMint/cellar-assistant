"use client";

import type { NhostClient } from "@nhost/nhost-js";
import { UrqlProvider as Provider } from "@urql/next";
import { useMemo } from "react";
import { makeClientClient } from "@/lib/urql/client";

interface UrqlProviderProps {
  children: React.ReactNode;
  nhost: NhostClient;
}

export function UrqlProvider({ children, nhost }: UrqlProviderProps) {
  const [client, ssr] = useMemo(() => {
    const { client, ssr } = makeClientClient(nhost);
    return [client, ssr];
  }, [nhost]);

  return (
    <Provider client={client as any} ssr={ssr as any}>
      {children}
    </Provider>
  );
}
