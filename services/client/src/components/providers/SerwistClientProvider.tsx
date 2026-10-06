"use client";

import { SerwistProvider } from "@serwist/turbopack/react";

export default function SerwistClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>;
}
