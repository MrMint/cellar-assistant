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

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        overscrollBehavior: "contain",
      }}
    >
      {children}
    </div>
  );
}
