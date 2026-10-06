import { Alert, Typography } from "@mui/joy";
import { EditProfileClient } from "@/components/user/EditProfileClient";
import { MyProfileQuery } from "@/components/user/fragments";
import { apiServerQuery } from "@/lib/api/urql-server";

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

  if (data.me === null) {
    return (
      <Alert color="warning" variant="soft">
        <Typography level="body-md">
          Your session ended while this page was loading. Sign in again to edit
          your profile.
        </Typography>
      </Alert>
    );
  }

  return <EditProfileClient profile={data.me.profile} />;
}
