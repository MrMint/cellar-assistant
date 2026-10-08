import type { Metadata } from "next";
import { MeHub } from "@/components/user/MeHub";
import { getServerUser } from "@/utilities/auth-server";

export const metadata: Metadata = { title: "Me · Cellar Assistant" };

/**
 * `/me` — the Me tab's hub (D1): Lists (Tier lists, Top rated, Loved),
 * Friends, Recipes, Brands, Scans, Edit profile and Sign out. Links only; the
 * viewer comes from the session the group's layout has already checked.
 */
export default async function MePage() {
  const user = await getServerUser();
  return <MeHub user={user} />;
}
