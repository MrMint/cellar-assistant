import { Alert, Typography } from "@mui/joy";
import { getApiToken } from "@/lib/api/auth-server";
import { FriendsClient } from "./FriendsClient";

/**
 * `/friends`.
 *
 * `getApiToken()` can still return `null` even though `(authenticated)/layout.tsx`
 * has already resolved a session: the layout's `/get-session` call and this
 * token exchange are two round trips, and a session that expires or is revoked
 * between them lands here. D8 wrote this branch for a different reason — the
 * layout gated on the *Nhost* session then, so a viewer could get past it with
 * no better-auth session at all — and D9 kept it because the narrow race is
 * real.
 */
export async function Friends() {
  const token = await getApiToken();

  if (token === null) {
    return (
      <Alert color="warning" variant="soft">
        <Typography level="body-md">
          Your session ended while this page was loading. Sign in again to see
          your friends.
        </Typography>
      </Alert>
    );
  }

  return <FriendsClient />;
}
