import type { Metadata } from "next";
import { Suspense } from "react";
import { MapShell } from "@/components/map/core/MapShell";
import { MapWrapper } from "@/components/map/core/MapWrapper";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Map" };

/**
 * `82450ad1:src/app/(authenticated)/map/page.tsx`, restored: the xstate map
 * (`components/map`) opening at the cached-location cookie. `getServerUserId`
 * → `getServerUser().id`; the id only gates the tier-list filter query — no
 * request names whose map to draw.
 */
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [user, cachedLocation] = await Promise.all([
    getServerUser(),
    getGeolocationFromCookie(),
  ]);

  return (
    // N22: fill the content area (map/layout.tsx), not the viewport.
    <div className="relative flex h-full min-h-0 w-full flex-auto flex-col overflow-hidden bg-surface-1">
      <Suspense fallback={<MapShell />}>
        <MapWrapper userId={user.id} cachedLocation={cachedLocation} />
      </Suspense>
    </div>
  );
}
