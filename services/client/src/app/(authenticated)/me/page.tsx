import type { Metadata } from "next";
import { MeHub } from "@/components/user/MeHub";
import {
  EMPTY_ME_HUB,
  FRIEND_REQUESTS_PAGE,
  MeHubQuery,
  meHubFromResult,
  PINNED_TIER_LISTS,
} from "@/components/user/me-hub-data";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Me · Cellar Assistant" };
export const dynamic = "force-dynamic";

/**
 * `/me` — the Me tab's hub (D1): Lists (your tier lists pinned first, then
 * Top rated and Loved), Friends with a request badge, Scans, Edit profile and
 * Sign out. The viewer comes from the session the group's layout has already
 * checked; the pinned lists and the badge are one read, and the hub still
 * renders — with plain rows — if that read fails.
 */
export default async function MePage() {
  const [user, data] = await Promise.all([
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
  ]);
  return <MeHub user={user} data={data} />;
}
