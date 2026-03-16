import type { ResultOf } from "@cellar-assistant/shared";
import { Stack } from "@mui/joy";
import type { PlaceSummary } from "@/app/(authenticated)/map/place-actions";
import type { PlaceResult } from "@/components/map/types";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import type {
  RecentReviewsQuery,
  RecentTierListItemsQuery,
  SearchDiscoveryQuery,
} from "./fragments";
import { NearbyPlaces } from "./NearbyPlaces";
import { type ActivityKind, RecentActivity } from "./RecentActivity";

type DiscoveryData = ResultOf<typeof SearchDiscoveryQuery>;

type ReviewsData = ResultOf<typeof RecentReviewsQuery>["item_reviews"];

type TierListItemsData = ResultOf<
  typeof RecentTierListItemsQuery
>["tier_list_items"];

interface SearchDiscoveryContentProps {
  data: DiscoveryData;
  reviews: ReviewsData;
  tierListItems: TierListItemsData;
  activityKinds: ActivityKind[];
  nearbyPlaces?: PlaceResult[];
  nearbySummaries?: Record<string, PlaceSummary>;
  cachedLocation?: CachedLocation | null;
}

/**
 * Content section: activity feed + nearby places.
 * Rendered below the search bar, full width.
 */
export function SearchDiscoveryContent({
  data,
  reviews,
  tierListItems,
  activityKinds,
  nearbyPlaces,
  nearbySummaries,
  cachedLocation,
}: SearchDiscoveryContentProps) {
  return (
    <Stack spacing={4}>
      {/* Unified activity feed: additions + reviews + tier list updates sorted by time */}
      <RecentActivity
        cellarItems={data.recent_cellar_items}
        reviews={reviews}
        tierListItems={tierListItems}
        selectedKinds={activityKinds}
      />

      {/* Nearby places — pre-fetched server-side when cached location available */}
      <NearbyPlaces
        initialPlaces={nearbyPlaces}
        initialSummaries={nearbySummaries}
        cachedLocation={cachedLocation}
      />
    </Stack>
  );
}
