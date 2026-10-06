import { Stack } from "@mui/joy";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import type { ActivityEntry, ActivityKind, NearbyPlace } from "./adapter";
import { NearbyPlaces } from "./NearbyPlaces";
import { RecentActivity } from "./RecentActivity";

interface SearchDiscoveryContentProps {
  feed: ActivityEntry[];
  activityKinds: ActivityKind[];
  nearbyPlaces?: NearbyPlace[];
  cachedLocation?: CachedLocation | null;
}

/**
 * `82450ad1:src/components/search/SearchDiscovery.tsx`, restored (UI parity
 * G31). The old props were three Hasura result sets plus place summaries;
 * they arrive adapted (`./adapter.ts`), so this is the layout and nothing
 * else — as it was.
 *
 * Content section: activity feed + nearby places.
 * Rendered below the search bar, full width.
 */
export function SearchDiscoveryContent({
  feed,
  activityKinds,
  nearbyPlaces,
  cachedLocation,
}: SearchDiscoveryContentProps) {
  return (
    <Stack spacing={4}>
      {/* Unified activity feed: additions + reviews + tier list updates sorted by time */}
      <RecentActivity feed={feed} selectedKinds={activityKinds} />

      {/* Nearby places — pre-fetched server-side when cached location available */}
      <NearbyPlaces
        initialPlaces={nearbyPlaces}
        cachedLocation={cachedLocation}
      />
    </Stack>
  );
}
