import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppBar } from "@/components/app/AppBar";
import { Page } from "@/components/app/Page";
import { PersonQuery } from "@/components/profile/queries";
import { CompareView } from "@/components/taste/compare/CompareView";
import { firstName } from "@/components/taste/compare/compare-lines";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getServerUser } from "@/utilities/auth-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Compare taste" };

/**
 * `/users/[userId]/compare` — "You and Maya" on a phone (Social-Friends 09):
 * the profile's agreement card opens it. From `md` up the same view is the
 * profile's own right column. The rows are the server's (MC-compare): a
 * non-friend gets none, so this page shows nothing of a stranger's.
 */
export default async function ComparePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const [{ userId }, viewer] = await Promise.all([params, getServerUser()]);
  if (userId.toLowerCase() === viewer.id.toLowerCase()) redirect("/me");

  const data = await apiServerQuery(PersonQuery, { userId });
  const person = unwrapResult(data.user, "UserProfile");
  if (!person.ok) notFound();
  const name = person.data.displayName;
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
