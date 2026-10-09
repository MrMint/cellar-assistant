import type { Metadata } from "next";
import { AppBar } from "@/components/app/AppBar";
import { ICON_STROKE, Warning } from "@/components/app/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EditProfileClient } from "@/components/user/EditProfileClient";
import { MyProfileQuery } from "@/components/user/fragments";
import { apiServerQuery } from "@/lib/api/urql-server";

export const metadata: Metadata = { title: "Edit profile" };

/**
 * `/users/edit`.
 *
 * `me` can still come back `null` even though `(authenticated)/layout.tsx` has
 * already resolved a session: the layout's `/get-session` call and this query's
 * JWT are two round trips, and a session that expires or is revoked between
 * them lands here. D8 wrote this branch for a different reason — the layout
 * gated on the *Nhost* session then, so a viewer could get past it with no
 * better-auth session at all — and D9 kept it because the narrow race is real.
 */
export default async function EditProfile() {
  const data = await apiServerQuery(MyProfileQuery);

  return (
    <div className="flex flex-col gap-4">
      {/* Reached from the Me hub (D1): Back goes there on a cold open. */}
      <AppBar title="Edit profile" parent="/me" />
      {data.me === null ? (
        <SessionEnded />
      ) : (
        <EditProfileClient profile={data.me.profile} />
      )}
    </div>
  );
}

function SessionEnded() {
  return (
    <Alert>
      <Warning aria-hidden strokeWidth={ICON_STROKE} />
      <AlertDescription className="type-body text-ink-1">
        Your session ended while this page was loading. Sign in again to edit
        your profile.
      </AlertDescription>
    </Alert>
  );
}
