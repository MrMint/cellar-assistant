import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppBar } from "@/components/app/AppBar";
import { Page } from "@/components/app/Page";
import { ApiError } from "@/components/cellar-api/ApiError";
import { friendProfileView } from "@/components/profile/adapter";
import { FriendProfile } from "@/components/profile/FriendProfile";
import {
  FriendProfileQuery,
  PROFILE_LOG_PAGE_SIZE,
  PROFILE_SECTION_SIZE,
} from "@/components/profile/queries";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

/**
 * The tab title names nobody: a title is the one part of a page that outlives
 * it (history, the tab strip), and the name is already the page's heading.
 */
export const metadata: Metadata = { title: "Friend" };

/**
 * `/users/[userId]` — a friend's read-only profile (X18).
 *
 * Your own id goes to `/me`, which is where you are. Anyone else is the
 * API's call: `friendProfile` answers a friend, and one `NOT_FOUND` for a
 * stranger, an id that names nobody and a malformed one alike — which is
 * `notFound()` here, the group's one "doesn't exist or isn't shared with
 * you" (D24). The page never reads the profile any other way, so it cannot
 * say more than the gate did.
 */
export default async function FriendProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const [{ userId }, viewer] = await Promise.all([params, getServerUser()]);
  if (userId.toLowerCase() === viewer.id.toLowerCase()) redirect("/me");

  const data = await apiServerQuery(FriendProfileQuery, {
    userId,
    sections: PROFILE_SECTION_SIZE,
    logs: PROFILE_LOG_PAGE_SIZE,
  });
  const result = unwrapResult(data.friendProfile, "FriendProfile");
  if (!result.ok) {
    if (isNotFound(result.error)) notFound();
    // Anything else (a session that ended, a budget, a fault) is said in the
    // page's own frame, with Back, rather than as a bare line.
    return (
      <Page>
        <AppBar parent="/friends" />
        <ApiError error={result.error} title="Couldn't open this profile" />
      </Page>
    );
  }
  return <FriendProfile view={friendProfileView(result.data)} />;
}
