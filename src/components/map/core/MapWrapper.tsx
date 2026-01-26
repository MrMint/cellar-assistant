"use client";

import { MapNotifications } from "./MapNotifications";
import { MapView } from "./MapView";

interface MapWrapperProps {
  userId: string;
}

export function MapWrapper({ userId }: MapWrapperProps) {
  return (
    <>
      <MapView userId={userId} />
      <MapNotifications userId={userId} />
    </>
  );
}
