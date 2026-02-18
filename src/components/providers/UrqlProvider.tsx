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

  return (
    <Provider client={client as any} ssr={ssr as any}>
      {children}
    </Provider>
  );
}
