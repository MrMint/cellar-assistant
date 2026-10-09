import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The offline page is a client component, so its title (X21) lives here, the
 * one server file in its segment.
 */
export const metadata: Metadata = { title: "Offline" };

export default function OfflineLayout({ children }: { children: ReactNode }) {
  return children;
}
