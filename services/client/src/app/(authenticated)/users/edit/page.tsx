import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { ICON_STROKE, Warning } from "@/components/app/icons";
import { Page } from "@/components/app/Page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MyProfileQuery } from "@/components/user/fragments";
import { ProfileEditor } from "@/components/user/ProfileEditor";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Edit profile" };

/**
 * `/users/edit`.
 *
 * `me` can still come back `null` even though `(authenticated)/layout.tsx` has
 * already resolved a session: the layout's `/get-session` call and this query's
 * JWT are two round trips, and a session that expires or is revoked between
 * them lands here.
 */
export default async function EditProfile() {
  const data = await apiServerQuery(MyProfileQuery);

  return (
    <Page className="max-w-[480px]">
      {/* Reached from Settings: Back goes there on a cold open. */}
      <AppBar title="Edit profile" parent="/me/settings" />
      {data.me === null ? (
        <SessionEnded />
      ) : (
        <ProfileEditor
          profile={{
            displayName: data.me.profile.displayName,
            avatarUrl: data.me.profile.avatarUrl ?? null,
          }}
        />
      )}
    </Page>
  );
}

function SessionEnded() {
  return (
    <Alert>
      <Warning aria-hidden strokeWidth={ICON_STROKE} />
      <AlertDescription className="t-body text-ink">
        Your session ended. Sign in again to edit your profile.
      </AlertDescription>
    </Alert>
  );
}
