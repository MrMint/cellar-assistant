"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface MapLayoutProps {
  children: ReactNode;
}

export default function MapLayout({ children }: MapLayoutProps) {
  const pathname = usePathname();
  const isMapCanvas = pathname === "/map";

  if (!isMapCanvas) {
    return <>{children}</>;
  }

  // N22: the content area's height, not the viewport's. `100dvh` here sat
  // inside a shell that already spends part of the viewport on the bottom
  // nav (and the safe-area insets), so the map ran ~50 px under the nav and
  // its attribution — a licensing obligation — was hidden behind it.
  return (
    <div className="flex h-full min-h-0 flex-auto flex-col overflow-hidden overscroll-contain">
      {children}
    </div>
  );
}
