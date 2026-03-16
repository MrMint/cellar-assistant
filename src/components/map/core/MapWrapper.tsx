"use client";

import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { MapView } from "./MapView";

interface MapWrapperProps {
  userId: string;
  cachedLocation?: CachedLocation | null;
}

export function MapWrapper({ userId, cachedLocation }: MapWrapperProps) {
  return <MapView userId={userId} cachedLocation={cachedLocation} />;
}
