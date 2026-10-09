import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { requestOrigin } from "@/lib/share/origin";

/**
 * The public share pages (X17). No app shell — `ShareFrame` is each page's
 * chrome — and a `metadataBase` from the request, so the link-preview card
 * each page carries (`opengraph-image`) is an absolute URL on the host the
 * link was opened on. Nothing here is indexed: these are links between
 * people, not a catalogue for search engines.
 */
export async function generateMetadata(): Promise<Metadata> {
  const origin = requestOrigin(await headers());
  return {
    ...(origin === null ? {} : { metadataBase: new URL(origin) }),
    robots: { index: false, follow: false },
  };
}

export default function ShareLayout({ children }: { children: ReactNode }) {
  return children;
}
