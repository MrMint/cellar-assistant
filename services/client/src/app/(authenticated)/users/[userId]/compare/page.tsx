import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppBar } from "@/components/app/AppBar";
import { Page } from "@/components/app/Page";
import { ApiError } from "@/components/cellar-api/ApiError";
import { LockedProfile } from "@/components/profile/LockedProfile";
import { FriendshipQuery, PersonQuery } from "@/components/profile/queries";
import { CompareView } from "@/components/taste/compare/CompareView";
import { firstName } from "@/components/taste/compare/compare-lines";
import { isNotFound, unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Compare taste" };

/**
 * `/users/[userId]/compare` — "You and Maya" on a phone (Social-Friends 09):
 * the profile's agreement card opens it. From `md` up the same view is the
 * profile's own right column. The rows are the server's (MC-compare): a
 * non-friend gets none, so this page shows nothing of a stranger's.
 *
 * Friendship is asked first (`friendProfile`, F-56, FR-7): anyone who isn't
 * a friend gets the profile's locked state — who they are, the lock and Add
 * friend — and no compare read at all; an id that names nobody is a 404.
 */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const [{ userId }, viewer] = await Promise.all([params, getServerUser()]);
  if (userId.toLowerCase() === viewer.id.toLowerCase()) redirect("/me");

  const friendship = unwrapResult(
    (await apiServerQuery(FriendshipQuery, { userId })).friendProfile,
    "FriendProfile",
  );
  if (!friendship.ok) {
    if (!isNotFound(friendship.error)) {
      return (
        <Page>
          <AppBar parent={`/users/${userId}`} />
          <ApiError error={friendship.error} title="Can’t compare right now" />
        </Page>
      );
    }
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
  const name = friendship.data.user.displayName;
  return (
    <Page>
      <AppBar
        title={`You and ${firstName(name)}`}
        parent={`/users/${userId}`}
        breadcrumbs={[
          { label: "Friends", href: "/friends" },
          { label: name, href: `/users/${userId}` },
          { label: "Compare" },
        ]}
      />
      <CompareView userId={userId} name={name} />
    </Page>
  );
}
