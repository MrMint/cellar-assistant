import type { ResultOf } from "@cellar-assistant/shared";
import { Stack } from "@mui/joy";
import type { RecentReviewsQuery, SearchDiscoveryQuery } from "./fragments";
import { NearbyPlaces } from "./NearbyPlaces";
import { RecentActivity } from "./RecentActivity";

type DiscoveryData = ResultOf<typeof SearchDiscoveryQuery>;

type ReviewsData = ResultOf<typeof RecentReviewsQuery>["item_reviews"];

interface SearchDiscoveryContentProps {
  data: DiscoveryData;
  reviews: ReviewsData;
  currentUserId: string;
}

/**
 * Content section: activity feed + nearby places.
 * Rendered below the search bar, full width.
 */
export function SearchDiscoveryContent({
  data,
  reviews,
  currentUserId,
}: SearchDiscoveryContentProps) {
  return (
    <Stack spacing={4}>
      {/* Unified activity feed: additions + reviews sorted by time */}
      <RecentActivity
        cellarItems={data.recent_cellar_items}
        reviews={reviews}
        currentUserId={currentUserId}
      />

      {/* Nearby places — client component, uses geolocation */}
      <NearbyPlaces />
    </Stack>
  );
}
