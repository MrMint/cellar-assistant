import type { Metadata } from "next";
import { MeHub } from "@/components/user/MeHub";
import {
  EMPTY_ME_EXTRAS,
  EMPTY_ME_HUB,
  FRIEND_REQUESTS_PAGE,
  MeCountsQuery,
  MeExtrasQuery,
  MeHubQuery,
  meCountsFromResult,
  meExtrasFromResult,
  meHubFromResult,
  PINNED_TIER_LISTS,
} from "@/components/user/me-hub-data";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Me" };
export const dynamic = "force-dynamic";

/**
 * `/me` — the Me tab's hub (Shell-Me): Lists (Loved, Want to try, your
 * tier lists, Top rated, Taste profile), People (requests to answer,
 * Friends, Add a friend), then Settings. The viewer comes from the session
 * the group's layout has already checked; the pinned lists and the badge,
 * the header's counts (X18) and the hub's extras are three reads side by
 * side, and the hub still renders — with plain rows, or without the count
 * row — if any fails.
 */
export default async function MePage() {
  const [user, hub, counts, extras] = await Promise.all([
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
    apiServerQuery(MeExtrasQuery)
      .then(meExtrasFromResult)
      .catch((error: unknown) => {
        console.error("Me extras read failed:", error);
        return EMPTY_ME_EXTRAS;
      }),
  ]);
  return <MeHub user={user} data={{ ...hub, counts }} extras={extras} />;
}
