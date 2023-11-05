"use client";

import { NhostClient, NhostProvider } from "@nhost/nextjs";
import { ReactNode } from "react";
import { IconContext } from "react-icons";
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
      </NhostUrqlProvider>
    </NhostProvider>
  );
}
