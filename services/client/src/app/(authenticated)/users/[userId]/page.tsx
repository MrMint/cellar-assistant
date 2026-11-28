import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppBar } from "@/components/app/AppBar";
import { Page } from "@/components/app/Page";
import { ApiError } from "@/components/cellar-api/ApiError";
import { friendProfileView } from "@/components/profile/adapter";
import { FriendProfile } from "@/components/profile/FriendProfile";
import { LockedProfile } from "@/components/profile/LockedProfile";
import {
  FriendProfileQuery,
  PersonQuery,
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
 * API's call: `friendProfile` answers a friend, and one `NOT_FOUND` for
 * anyone else. Then `user(id:)` — the name and picture any signed-in viewer
 * may see — decides between a locked profile with Add friend (Social-Friends
 * 17) and `notFound()` for an id that names nobody (D24). Nothing a friend
 * shares is read on the locked path.
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
    if (isNotFound(result.error)) {
      const person = unwrapResult(
        (await apiServerQuery(PersonQuery, { userId })).user,
        "UserProfile",
      );
      if (!person.ok) notFound();
      return (
        <LockedProfile
          person={{
            userId: person.data.id,
            name: person.data.displayName,
            avatarUrl: person.data.avatarUrl ?? null,
          }}
        />
      );
    }
    // Anything else (a session that ended, a budget, a fault) is said in the
    // page's own frame, with Back, rather than as a bare line.
    return (
      <Page>
        <AppBar parent="/friends" />
        <ApiError error={result.error} title="Can’t open this profile" />
      </Page>
    );
  }
  return <FriendProfile view={friendProfileView(result.data)} />;
}
