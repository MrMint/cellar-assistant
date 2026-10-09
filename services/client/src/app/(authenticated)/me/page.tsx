import type { Metadata } from "next";
import { MeHub } from "@/components/user/MeHub";
import {
  EMPTY_ME_HUB,
  FRIEND_REQUESTS_PAGE,
  MeCountsQuery,
  MeHubQuery,
  meCountsFromResult,
  meHubFromResult,
  PINNED_TIER_LISTS,
} from "@/components/user/me-hub-data";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Me · Cellar Assistant" };
export const dynamic = "force-dynamic";

/**
 * `/me` — the Me tab's hub (D1): Lists (your tier lists pinned first, then
 * Top rated, Loved and Want to try), Friends with a request badge, Scans,
 * then Settings. The viewer comes from the session the group's layout has
 * already checked; the pinned lists and the badge are one read and the
 * header's counts (X18) another, side by side, and the hub still renders —
 * with plain rows, or without the count row — if either fails.
 */
export default async function MePage() {
  const [user, hub, counts] = await Promise.all([
    getServerUser(),
    apiServerQuery(MeHubQuery, {
      pinned: PINNED_TIER_LISTS,
      requests: FRIEND_REQUESTS_PAGE,
    })
      .then(meHubFromResult)
      .catch((error: unknown) => {
        console.error("Me hub read failed:", error);
        return EMPTY_ME_HUB;
      }),
    apiServerQuery(MeCountsQuery)
      .then(meCountsFromResult)
      .catch((error: unknown) => {
        console.error("Me counts read failed:", error);
        return null;
      }),
  ]);
  return <MeHub user={user} data={{ ...hub, counts }} />;
}
