import "@/styles/poi-labels.css";
import type { ReactNode } from "react";

interface MapLayoutProps {
  children: ReactNode;
}

export default function MapLayout({ children }: MapLayoutProps) {
  return <div style={{ height: "100vh", overflow: "hidden" }}>{children}</div>;
}
