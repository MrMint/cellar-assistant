"use client";

import { ReactNode } from "react";

import { NhostClient, NhostProvider } from "@nhost/nextjs";
import { NhostUrqlProvider } from "@/utilities/UrqlProvider";
import ThemeRegistry from "./ThemeRegistry";

const nhost = new NhostClient({
  region: process.env.NEXT_PUBLIC_NHOST_REGION,
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN,
});

// The @nhost/nextjs library does not play well with nextjs13 app router & RSCs
// This means SSR is unaware of the current session and will only ever server render
// the loading spinner in the withAuth hoc
export default function NhostClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <NhostProvider nhost={nhost} initial={undefined}>
      <NhostUrqlProvider nhost={nhost}>
        <ThemeRegistry>{children}</ThemeRegistry>
      </NhostUrqlProvider>
    </NhostProvider>
  );
}
